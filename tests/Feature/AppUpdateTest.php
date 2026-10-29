<?php

namespace Tests\Feature;

use Illuminate\Process\PendingProcess;
use Illuminate\Support\Facades\Process;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class AppUpdateTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config([
            'app_update.enabled' => true,
            'app_update.token' => null,
            'app_update.remote' => 'origin',
            'app_update.branch' => 'main',
            'app_update.run_build' => false,
        ]);
    }

    #[Test]
    public function it_reports_up_to_date_status(): void
    {
        $this->fakeGitStatus(behind: 0, ahead: 0, dirty: false);

        $response = $this->getJson(route('app.update.status'));

        $response->assertOk();
        $response->assertJsonPath('status.update_available', false);
        $response->assertJsonPath('status.behind', 0);
        $response->assertJsonPath('status.message', 'Aplikasi sudah versi terbaru.');
    }

    #[Test]
    public function it_reports_when_update_is_available(): void
    {
        $this->fakeGitStatus(behind: 3, ahead: 0, dirty: false);

        $response = $this->getJson(route('app.update.status'));

        $response->assertOk();
        $response->assertJsonPath('status.update_available', true);
        $response->assertJsonPath('status.behind', 3);
    }

    #[Test]
    public function it_pulls_when_behind_remote(): void
    {
        $pulled = false;

        Process::fake(function (PendingProcess $process) use (&$pulled) {
            $command = $this->commandString($process);

            if (str_contains($command, 'rev-parse --is-inside-work-tree')) {
                return Process::result(output: "true\n");
            }

            if (str_contains($command, 'git fetch') || str_ends_with($command, 'fetch origin main')) {
                return Process::result();
            }

            if (str_contains($command, 'pull')) {
                $pulled = true;

                return Process::result(output: "Updating aaaaaaa..bbbbbbb\nFast-forward\n");
            }

            if (str_contains($command, 'optimize:clear')) {
                return Process::result(output: "INFO  Cleared.\n");
            }

            if (str_contains($command, 'rev-parse HEAD')) {
                return Process::result(output: $pulled ? "bbbbbbb\n" : "aaaaaaa\n");
            }

            if (str_contains($command, 'rev-parse origin/main')) {
                return Process::result(output: "bbbbbbb\n");
            }

            if (str_contains($command, 'rev-list --count HEAD..origin/main')) {
                return Process::result(output: $pulled ? "0\n" : "2\n");
            }

            if (str_contains($command, 'rev-list --count origin/main..HEAD')) {
                return Process::result(output: "0\n");
            }

            if (str_contains($command, 'status --porcelain')) {
                return Process::result(output: '');
            }

            return Process::result();
        });

        $response = $this->postJson(route('app.update.pull'));

        $response->assertOk();
        $response->assertJsonPath('ok', true);
        $response->assertJsonPath('pulled', true);
        $response->assertJsonPath('status.update_available', false);
    }

    #[Test]
    public function it_rejects_pull_when_disabled(): void
    {
        config(['app_update.enabled' => false]);

        $response = $this->postJson(route('app.update.pull'));

        $response->assertForbidden();
        $response->assertJsonPath('message', 'Pembaruan aplikasi dinonaktifkan.');
    }

    #[Test]
    public function it_requires_update_token_when_configured(): void
    {
        config(['app_update.token' => 'secret-token']);
        $this->fakeGitStatus(behind: 0, ahead: 0, dirty: false);

        $this->getJson(route('app.update.status'))->assertForbidden();

        $this->withHeader('X-Update-Token', 'secret-token')
            ->getJson(route('app.update.status'))
            ->assertOk()
            ->assertJsonPath('status.update_available', false);
    }

    private function fakeGitStatus(int $behind, int $ahead, bool $dirty): void
    {
        Process::fake(function (PendingProcess $process) use ($behind, $ahead, $dirty) {
            $command = $this->commandString($process);

            if (str_contains($command, 'rev-parse --is-inside-work-tree')) {
                return Process::result(output: "true\n");
            }

            if (str_contains($command, 'fetch')) {
                return Process::result();
            }

            if (str_contains($command, 'rev-parse HEAD')) {
                return Process::result(output: "aaaaaaa\n");
            }

            if (str_contains($command, 'rev-parse origin/main')) {
                return Process::result(output: "bbbbbbb\n");
            }

            if (str_contains($command, 'rev-list --count HEAD..origin/main')) {
                return Process::result(output: "{$behind}\n");
            }

            if (str_contains($command, 'rev-list --count origin/main..HEAD')) {
                return Process::result(output: "{$ahead}\n");
            }

            if (str_contains($command, 'status --porcelain')) {
                return Process::result(output: $dirty ? " M README.md\n" : '');
            }

            return Process::result();
        });
    }

    private function commandString(PendingProcess $process): string
    {
        $command = $process->command;

        return is_array($command) ? implode(' ', $command) : (string) $command;
    }
}
