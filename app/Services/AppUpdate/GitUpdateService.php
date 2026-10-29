<?php

namespace App\Services\AppUpdate;

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

        $fetch = Process::path(base_path())
            ->timeout(60)
            ->run(['git', 'fetch', $remote, $branch]);

        if ($fetch->failed()) {
            throw new RuntimeException('Gagal mengambil data dari GitHub: '.$fetch->errorOutput());
        }

        $current = trim(Process::path(base_path())->run(['git', 'rev-parse', 'HEAD'])->output());
        $remoteSha = trim(Process::path(base_path())->run(['git', 'rev-parse', "{$remote}/{$branch}"])->output());

        $behind = (int) trim(Process::path(base_path())->run([
            'git', 'rev-list', '--count', "HEAD..{$remote}/{$branch}",
        ])->output());

        $ahead = (int) trim(Process::path(base_path())->run([
            'git', 'rev-list', '--count', "{$remote}/{$branch}..HEAD",
        ])->output());

        $dirty = Process::path(base_path())->run(['git', 'status', '--porcelain'])->output() !== '';

        $available = $behind > 0;

        return [
            'enabled' => true,
            'current_sha' => $this->shortSha($current),
            'remote_sha' => $this->shortSha($remoteSha),
            'behind' => $behind,
            'ahead' => $ahead,
            'dirty' => $dirty,
            'update_available' => $available,
            'branch' => $branch,
            'remote' => $remote,
            'message' => $available
                ? "Tersedia {$behind} commit baru dari GitHub."
                : 'Aplikasi sudah versi terbaru.',
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

        $pull = Process::path(base_path())
            ->timeout(120)
            ->run(['git', 'pull', '--ff-only', $remote, $branch]);

        if ($pull->failed()) {
            $hint = $before['dirty']
                ? ' Ada perubahan lokal yang belum di-commit; selesaikan dulu atau stash.'
                : '';

            throw new RuntimeException(
                'Gagal pull dari GitHub: '.$pull->errorOutput().$hint
            );
        }

        $postOutput = [$pull->output()];

        $clear = Process::path(base_path())
            ->timeout(60)
            ->run(['php', 'artisan', 'optimize:clear']);
        $postOutput[] = $clear->output();

        if (config('app_update.run_build') && is_file(base_path('package.json'))) {
            $build = Process::path(base_path())
                ->timeout(300)
                ->run(['npm', 'run', 'build']);
            $postOutput[] = $build->output().$build->errorOutput();

            if ($build->failed()) {
                throw new RuntimeException(
                    'Pull berhasil, tetapi npm run build gagal: '.$build->errorOutput()
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

    private function ensureGitRepo(): void
    {
        $check = Process::path(base_path())->run(['git', 'rev-parse', '--is-inside-work-tree']);

        if ($check->failed() || trim($check->output()) !== 'true') {
            throw new RuntimeException('Direktori aplikasi bukan repositori git.');
        }
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
            'update_available' => false,
            'branch' => (string) config('app_update.branch'),
            'remote' => (string) config('app_update.remote'),
            'message' => $message,
        ];
    }
}
