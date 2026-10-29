<?php

namespace Tests\Feature;

use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class PowerRxPageTest extends TestCase
{
    #[Test]
    public function it_renders_the_power_rx_inertia_page(): void
    {
        $response = $this->get(route('power-rx.index'));

        $response->assertOk();
        $response->assertInertia(fn ($page) => $page
            ->component('PowerRx/Index')
            ->has('config.rasio_il')
            ->has('config.odp_splitter_il')
            ->has('config.defaults')
            ->has('config.max_nodes')
        );
    }

    #[Test]
    public function it_calculates_tap_chain_via_json_endpoint(): void
    {
        $nodes = [];

        for ($i = 1; $i <= 8; $i++) {
            $nodes[] = [
                'id' => "r{$i}",
                'type' => 'rasio',
                'name' => "Rasio {$i}",
                'tap_percent' => 4,
            ];
            $nodes[] = [
                'id' => "s{$i}",
                'type' => 'splitter',
                'name' => "ODP {$i}",
                'odp_splitter' => 8,
            ];
        }

        $response = $this->postJson(route('power-rx.calculate-network'), [
            'sfp_power_dbm' => 7.0,
            'nodes' => $nodes,
        ]);

        $response->assertOk();
        $response->assertJsonPath('result.summary.enabled_count', 8);
        $this->assertCount(8, $response->json('result.stages'));
        $this->assertEqualsWithDelta(
            -17.23,
            $response->json('result.stages.0.hasil_redaman_dbm'),
            0.01,
        );
    }

    #[Test]
    public function it_pairs_adjacent_rasio_splitter_and_allows_standalone(): void
    {
        $paired = $this->postJson(route('power-rx.calculate-network'), [
            'sfp_power_dbm' => 7.0,
            'nodes' => [
                [
                    'id' => 'r1',
                    'type' => 'rasio',
                    'name' => 'Rasio 1',
                    'tap_percent' => 4,
                ],
                [
                    'id' => 's1',
                    'type' => 'splitter',
                    'name' => 'ODP 1',
                    'odp_splitter' => 8,
                ],
            ],
        ]);

        $paired->assertOk();
        $this->assertCount(1, $paired->json('result.stages'));
        $this->assertSame('rasio_splitter', $paired->json('result.stages.0.kind'));

        $standalone = $this->postJson(route('power-rx.calculate-network'), [
            'sfp_power_dbm' => 7.0,
            'nodes' => [
                [
                    'id' => 's1',
                    'type' => 'splitter',
                    'name' => 'Splitter only',
                    'odp_splitter' => 8,
                ],
                [
                    'id' => 'r1',
                    'type' => 'rasio',
                    'name' => 'Rasio only',
                    'tap_percent' => 4,
                ],
            ],
        ]);

        $standalone->assertOk();
        $this->assertCount(2, $standalone->json('result.stages'));
        $this->assertSame('splitter', $standalone->json('result.stages.0.kind'));
        $this->assertSame('rasio', $standalone->json('result.stages.1.kind'));
    }

    #[Test]
    public function it_accepts_path_loss_fields_on_calculate(): void
    {
        $response = $this->postJson(route('power-rx.calculate-network'), [
            'sfp_power_dbm' => 7.0,
            'fiber_m' => 1000,
            'attenuation_db_per_km' => 0.35,
            'connector_count' => 1,
            'connector_loss_db_each' => 0.3,
            'splice_count' => 2,
            'splice_loss_db_each' => 0.1,
            'design_margin_db' => 0,
            'nodes' => [
                [
                    'id' => 'r1',
                    'type' => 'rasio',
                    'name' => 'Rasio 1',
                    'tap_percent' => 4,
                ],
                [
                    'id' => 's1',
                    'type' => 'splitter',
                    'name' => 'ODP 1',
                    'odp_splitter' => 8,
                ],
            ],
        ]);

        $response->assertOk();
        $this->assertEqualsWithDelta(0.85, $response->json('result.path_loss.total_db'), 0.01);
        $this->assertEqualsWithDelta(6.15, $response->json('result.path_loss.sfp_after_path_dbm'), 0.01);
    }
}
