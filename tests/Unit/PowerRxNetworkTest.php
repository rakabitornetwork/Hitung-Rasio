<?php

namespace Tests\Unit;

use App\Services\OpticalBudget\PowerRxCalculator;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class PowerRxNetworkTest extends TestCase
{
    #[Test]
    public function it_simulates_eight_odp_points_with_mixed_splitters(): void
    {
        $calculator = new PowerRxCalculator;

        $odps = [];

        for ($i = 1; $i <= 8; $i++) {
            $odps[] = [
                'key' => "odp-{$i}",
                'name' => "ODP-{$i}",
                'enabled' => true,
                'fiber_length_km' => 0.5,
                'connector_count' => 1,
                'connector_loss_db_each' => 0.3,
                'splice_count' => 0,
                'splice_loss_db_each' => 0.1,
                'other_loss_db' => 0.0,
                'stages' => $i <= 4
                    ? [['mode' => 'ratio', 'ratio' => 8, 'insertion_loss_db' => null]]
                    : [[
                        'mode' => 'percent',
                        'percent' => 10,
                        'excess_loss_db' => 0.3,
                        'insertion_loss_db' => null,
                    ]],
            ];
        }

        $result = $calculator->calculateNetwork([
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

        $this->assertCount(8, $result['odps']);
        $this->assertSame(8, $result['summary']['enabled_count']);
        $this->assertNotNull($result['odps'][0]['result']);
        $this->assertNotNull($result['odps'][7]['result']);

        // Shared: fiber 1.4 + conn 0.6 + splitter 7.0 = 9.0
        $this->assertEqualsWithDelta(9.0, $result['shared_loss_db'], 0.0001);

        // ODP ratio path adds branch fiber 0.175 + conn 0.3 + splitter 10.5
        $this->assertEqualsWithDelta(
            19.975,
            $result['odps'][0]['result']['total_loss_db'],
            0.0001,
        );

        // ODP percent path adds branch fiber 0.175 + conn 0.3 + splitter 10.3
        $this->assertEqualsWithDelta(
            19.775,
            $result['odps'][7]['result']['total_loss_db'],
            0.0001,
        );
    }

    #[Test]
    public function it_skips_disabled_odp_points(): void
    {
        $calculator = new PowerRxCalculator;

        $odps = [];

        for ($i = 1; $i <= 8; $i++) {
            $odps[] = [
                'key' => "odp-{$i}",
                'name' => "ODP-{$i}",
                'enabled' => $i !== 3,
                'fiber_length_km' => 0.5,
                'connector_count' => 0,
                'connector_loss_db_each' => 0.3,
                'splice_count' => 0,
                'splice_loss_db_each' => 0.1,
                'other_loss_db' => 0.0,
                'stages' => [],
            ];
        }

        $result = $calculator->calculateNetwork([
            'tx_power_dbm' => 5.0,
            'fiber_length_km' => 1.0,
            'attenuation_db_per_km' => 0.35,
            'connector_count' => 0,
            'connector_loss_db_each' => 0.3,
            'splice_count' => 0,
            'splice_loss_db_each' => 0.1,
            'other_loss_db' => 0.0,
            'design_margin_db' => 0.0,
            'stages' => [],
            'odps' => $odps,
        ]);

        $this->assertSame(7, $result['summary']['enabled_count']);
        $this->assertFalse($result['odps'][2]['enabled']);
        $this->assertNull($result['odps'][2]['result']);
    }
}
