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
            ->has('config.splitter_il')
            ->has('config.percent')
            ->has('config.defaults')
            ->has('config.thresholds')
            ->has('config.odp')
        );
    }

    #[Test]
    public function it_calculates_eight_odp_network_via_json_endpoint(): void
    {
        $odps = [];

        for ($i = 1; $i <= 8; $i++) {
            $odps[] = [
                'key' => "odp-{$i}",
                'name' => "ODP-{$i}",
                'enabled' => true,
                'fiber_length_km' => 0.5,
                'connector_count' => 0,
                'connector_loss_db_each' => 0.3,
                'splice_count' => 0,
                'splice_loss_db_each' => 0.1,
                'other_loss_db' => 0.0,
                'stages' => [
                    ['mode' => 'ratio', 'ratio' => 8, 'insertion_loss_db' => null],
                ],
            ];
        }

        $response = $this->postJson(route('power-rx.calculate-network'), [
            'tx_power_dbm' => 5.0,
            'fiber_length_km' => 4.0,
            'attenuation_db_per_km' => 0.35,
            'connector_count' => 2,
            'connector_loss_db_each' => 0.3,
            'splice_count' => 0,
            'splice_loss_db_each' => 0.1,
            'other_loss_db' => 0.0,
            'design_margin_db' => 0.0,
            'stages' => [
                ['mode' => 'ratio', 'ratio' => 4, 'insertion_loss_db' => null],
            ],
            'odps' => $odps,
        ]);

        $response->assertOk();
        $response->assertJsonPath('result.summary.enabled_count', 8);
        $this->assertCount(8, $response->json('result.odps'));
    }

    #[Test]
    public function it_calculates_power_rx_via_json_endpoint(): void
    {
        $response = $this->postJson(route('power-rx.calculate'), [
            'tx_power_dbm' => 5.0,
            'fiber_length_km' => 8.0,
            'attenuation_db_per_km' => 0.35,
            'connector_count' => 4,
            'connector_loss_db_each' => 0.3,
            'splice_count' => 2,
            'splice_loss_db_each' => 0.1,
            'other_loss_db' => 0.0,
            'design_margin_db' => 0.0,
            'stages' => [
                ['mode' => 'ratio', 'ratio' => 4, 'insertion_loss_db' => null],
                ['mode' => 'ratio', 'ratio' => 8, 'insertion_loss_db' => null],
            ],
        ]);

        $response->assertOk();
        $response->assertJsonPath('result.effective_ratio', 32);
        $response->assertJsonPath('result.status', 'ok');
        $this->assertEqualsWithDelta(
            -16.7,
            $response->json('result.rx_power_dbm'),
            0.0001,
        );
    }

    #[Test]
    public function it_calculates_percent_splitter_via_json_endpoint(): void
    {
        $response = $this->postJson(route('power-rx.calculate'), [
            'tx_power_dbm' => 5.0,
            'fiber_length_km' => 0.0,
            'attenuation_db_per_km' => 0.35,
            'connector_count' => 0,
            'connector_loss_db_each' => 0.3,
            'splice_count' => 0,
            'splice_loss_db_each' => 0.1,
            'other_loss_db' => 0.0,
            'design_margin_db' => 0.0,
            'stages' => [
                [
                    'mode' => 'percent',
                    'percent' => 10,
                    'excess_loss_db' => 0.3,
                    'insertion_loss_db' => null,
                ],
            ],
        ]);

        $response->assertOk();
        $response->assertJsonPath('result.has_percent_stages', true);
        $response->assertJsonPath('result.effective_ratio', null);
        $this->assertEqualsWithDelta(
            10.3,
            $response->json('result.total_loss_db'),
            0.0001,
        );
    }

    #[Test]
    public function it_rejects_negative_fiber_length(): void
    {
        $response = $this->postJson(route('power-rx.calculate'), [
            'tx_power_dbm' => 5.0,
            'fiber_length_km' => -1,
            'attenuation_db_per_km' => 0.35,
            'connector_count' => 0,
            'connector_loss_db_each' => 0.3,
            'splice_count' => 0,
            'splice_loss_db_each' => 0.1,
            'other_loss_db' => 0.0,
            'design_margin_db' => 0.0,
            'stages' => [],
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['fiber_length_km']);
    }

    #[Test]
    public function it_rejects_invalid_splitter_ratio(): void
    {
        $response = $this->postJson(route('power-rx.calculate'), [
            'tx_power_dbm' => 5.0,
            'fiber_length_km' => 1.0,
            'attenuation_db_per_km' => 0.35,
            'connector_count' => 0,
            'connector_loss_db_each' => 0.3,
            'splice_count' => 0,
            'splice_loss_db_each' => 0.1,
            'other_loss_db' => 0.0,
            'design_margin_db' => 0.0,
            'stages' => [
                ['mode' => 'ratio', 'ratio' => 3, 'insertion_loss_db' => null],
            ],
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['stages.0.ratio']);
    }

    #[Test]
    public function it_rejects_percent_stage_without_percent_value(): void
    {
        $response = $this->postJson(route('power-rx.calculate'), [
            'tx_power_dbm' => 5.0,
            'fiber_length_km' => 1.0,
            'attenuation_db_per_km' => 0.35,
            'connector_count' => 0,
            'connector_loss_db_each' => 0.3,
            'splice_count' => 0,
            'splice_loss_db_each' => 0.1,
            'other_loss_db' => 0.0,
            'design_margin_db' => 0.0,
            'stages' => [
                ['mode' => 'percent', 'percent' => null, 'insertion_loss_db' => null],
            ],
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['stages.0.percent']);
    }
}
