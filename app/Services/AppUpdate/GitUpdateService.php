<?php

namespace App\Services\AppUpdate;

use Illuminate\Contracts\Process\ProcessResult;
use Illuminate\Support\Facades\Process;
use RuntimeException;

class GitUpdateService
{
    /**
     * @return array{
     *     enabled: bool,
     *     current_sha: string|null,
     *     remote_sha: string|null,
     *     behind: int,
     *     ahead: int,
     *     dirty: bool,
     *     dirty_files: list<string>,
     *     update_available: bool,
     *     branch: string,
     *     remote: string,
     *     message: string
     * }
     */
    public function status(): array
    {
        if (! config('app_update.enabled')) {
            return $this->disabledStatus('Pembaruan aplikasi dinonaktifkan.');
        }

        $remote = (string) config('app_update.remote');
        $branch = (string) config('app_update.branch');

        $this->ensureGitRepo();

        $fetch = $this->git(['fetch', $remote, $branch], timeout: 60);

        if ($fetch->failed()) {
            throw new RuntimeException(
                'Gagal mengambil data dari GitHub: '.$this->processError($fetch)
            );
        }

        $current = trim($this->git(['rev-parse', 'HEAD'])->output());
        $remoteSha = trim($this->git(['rev-parse', "{$remote}/{$branch}"])->output());

        $behind = (int) trim($this->git([
            'rev-list', '--count', "HEAD..{$remote}/{$branch}",
        ])->output());

        $ahead = (int) trim($this->git([
            'rev-list', '--count', "{$remote}/{$branch}..HEAD",
        ])->output());

        $dirtyFiles = $this->dirtyFiles();
        $dirty = $dirtyFiles !== [];
        $available = $behind > 0;

        $message = $available
            ? "Tersedia {$behind} commit baru dari GitHub."
            : 'Aplikasi sudah versi terbaru.';

        if ($dirty) {
            $message .= ' Ada perubahan lokal yang bisa menghalangi pull.';
        }

        return [
            'enabled' => true,
            'current_sha' => $this->shortSha($current),
            'remote_sha' => $this->shortSha($remoteSha),
            'behind' => $behind,
            'ahead' => $ahead,
            'dirty' => $dirty,
            'dirty_files' => $dirtyFiles,
            'update_available' => $available,
            'branch' => $branch,
            'remote' => $remote,
            'message' => $message,
        ];
    }

    /**
     * @return array{
     *     ok: bool,
     *     status: array<string, mixed>,
     *     pulled: bool,
     *     output: string,
     *     message: string
     * }
     */
    public function pull(): array
    {
        $before = $this->status();

        if (! $before['enabled']) {
            return [
                'ok' => false,
                'status' => $before,
                'pulled' => false,
                'output' => '',
                'message' => $before['message'],
            ];
        }

        if (! $before['update_available']) {
            return [
                'ok' => true,
                'status' => $before,
                'pulled' => false,
                'output' => '',
                'message' => 'Tidak ada pembaruan yang perlu diunduh.',
            ];
        }

        $remote = (string) config('app_update.remote');
        $branch = (string) config('app_update.branch');

        $pull = $this->git(['pull', '--ff-only', $remote, $branch], timeout: 120);

        if ($pull->failed()) {
            $files = $before['dirty_files'] ?? [];
            $hint = $files !== []
                ? ' File lokal yang berubah: '.implode(', ', array_slice($files, 0, 8)).'. Commit, stash, atau kembalikan file itu dulu.'
                : ' Pastikan user PHP-FPM bisa menulis ke folder aplikasi dan .git, serta remote GitHub bisa diakses tanpa prompt.';

            throw new RuntimeException(
                'Gagal pull dari GitHub: '.$this->processError($pull).$hint
            );
        }

        $postOutput = [trim($pull->output())];

        $clear = $this->run(['php', 'artisan', 'optimize:clear'], timeout: 60);
        $postOutput[] = trim($clear->output().$clear->errorOutput());

        if (config('app_update.run_build') && is_file(base_path('package.json'))) {
            $npm = $this->resolveNpm();

            if ($npm === null) {
                throw new RuntimeException(
                    'Pull berhasil, tetapi npm tidak ditemukan di PATH user web server. '
                    .'Set APP_UPDATE_PATH ke folder bin Node/npm, atau set APP_UPDATE_RUN_BUILD=false lalu jalankan npm run build manual.'
                );
            }

            $build = $this->run([$npm, 'run', 'build'], timeout: 300);
            $postOutput[] = trim($build->output().$build->errorOutput());

            if ($build->failed()) {
                throw new RuntimeException(
                    'Pull berhasil, tetapi npm run build gagal: '.$this->processError($build)
                );
            }
        }

        $after = $this->status();

        return [
            'ok' => true,
            'status' => $after,
            'pulled' => true,
            'output' => trim(implode("\n", array_filter($postOutput))),
            'message' => 'Pembaruan berhasil diunduh dari GitHub.',
        ];
    }

    /**
     * @param  list<string>  $arguments
     */
    private function git(array $arguments, int $timeout = 60): ProcessResult
    {
        return $this->run(
            array_merge(['git', '-c', 'safe.directory=*'], $arguments),
            $timeout,
        );
    }

    /**
     * @param  list<string>  $command
     */
    private function run(array $command, int $timeout = 60): ProcessResult
    {
        return Process::path(base_path())
            ->timeout($timeout)
            ->env($this->processEnv())
            ->run($command);
    }

    /**
     * @return array<string, string>
     */
    private function processEnv(): array
    {
        $pathParts = array_values(array_filter([
            config('app_update.path_prepend'),
            getenv('PATH') ?: null,
            '/usr/local/bin',
            '/usr/bin',
            '/bin',
        ]));

        $env = [
            'PATH' => implode(':', $pathParts),
            'GIT_TERMINAL_PROMPT' => '0',
            'GIT_ASKPASS' => 'echo',
        ];

        $home = config('app_update.home');

        if (is_string($home) && $home !== '') {
            $env['HOME'] = $home;
        }

        return $env;
    }

    private function resolveNpm(): ?string
    {
        $which = $this->run(['bash', '-lc', 'command -v npm'], timeout: 10);

        if ($which->successful()) {
            $path = trim($which->output());

            if ($path !== '') {
                return $path;
            }
        }

        return null;
    }

    /**
     * @return list<string>
     */
    private function dirtyFiles(): array
    {
        $status = $this->git(['status', '--porcelain', '-uall']);
        $lines = preg_split('/\R/', trim($status->output())) ?: [];

        $files = [];

        foreach ($lines as $line) {
            if ($line === '') {
                continue;
            }

            $files[] = trim(substr($line, 3));
        }

        return array_values(array_unique($files));
    }

    private function ensureGitRepo(): void
    {
        $check = $this->git(['rev-parse', '--is-inside-work-tree']);

        if ($check->failed() || trim($check->output()) !== 'true') {
            throw new RuntimeException('Direktori aplikasi bukan repositori git.');
        }
    }

    private function processError(ProcessResult $result): string
    {
        $error = trim($result->errorOutput());
        $output = trim($result->output());

        if ($error !== '') {
            return $error;
        }

        if ($output !== '') {
            return $output;
        }

        return 'exit code '.$result->exitCode();
    }

    private function shortSha(string $sha): ?string
    {
        $sha = trim($sha);

        if ($sha === '') {
            return null;
        }

        return substr($sha, 0, 7);
    }

    /**
     * @return array{
     *     enabled: bool,
     *     current_sha: null,
     *     remote_sha: null,
     *     behind: int,
     *     ahead: int,
     *     dirty: bool,
     *     dirty_files: list<string>,
     *     update_available: bool,
     *     branch: string,
     *     remote: string,
     *     message: string
     * }
     */
    private function disabledStatus(string $message): array
    {
        return [
            'enabled' => false,
            'current_sha' => null,
            'remote_sha' => null,
            'behind' => 0,
            'ahead' => 0,
            'dirty' => false,
            'dirty_files' => [],
            'update_available' => false,
            'branch' => (string) config('app_update.branch'),
            'remote' => (string) config('app_update.remote'),
            'message' => $message,
        ];
    }
}
