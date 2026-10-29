<?php

namespace Tests\Unit;

use App\Services\OpticalBudget\PowerRxCalculator;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class PowerRxNetworkTest extends TestCase
{
    #[Test]
    public function it_matches_yapsinet_excel_chain_example(): void
    {
        $calculator = new PowerRxCalculator;

        $odps = [];
        $taps = [4, 4, 4, 4, 6, 6, 8, 8];

        for ($i = 0; $i < 8; $i++) {
            $odps[] = [
                'name' => 'ODP '.($i + 1),
                'enabled' => true,
                'tap_percent' => $taps[$i],
                'odp_splitter' => 8,
            ];
        }

        $result = $calculator->calculateTapChain([
            'sfp_power_dbm' => 7.0,
            'odps' => $odps,
        ]);

        $this->assertCount(8, $result['odps']);
        $this->assertEqualsWithDelta(-17.23, $result['odps'][0]['hasil_redaman_dbm'], 0.01);
        $this->assertEqualsWithDelta(-17.66, $result['odps'][1]['hasil_redaman_dbm'], 0.01);
        $this->assertEqualsWithDelta(-18.09, $result['odps'][2]['hasil_redaman_dbm'], 0.01);
        $this->assertEqualsWithDelta(-18.52, $result['odps'][3]['hasil_redaman_dbm'], 0.01);
        $this->assertEqualsWithDelta(-17.19, $result['odps'][4]['hasil_redaman_dbm'], 0.01);
        $this->assertEqualsWithDelta(-17.71, $result['odps'][5]['hasil_redaman_dbm'], 0.01);
        $this->assertEqualsWithDelta(-16.98, $result['odps'][6]['hasil_redaman_dbm'], 0.01);
        $this->assertEqualsWithDelta(-17.59, $result['odps'][7]['hasil_redaman_dbm'], 0.01);

        // Through of ODP1 becomes input of ODP2
        $this->assertEqualsWithDelta(6.57, $result['odps'][0]['output_through_dbm'], 0.01);
        $this->assertEqualsWithDelta(6.57, $result['odps'][1]['input_power_dbm'], 0.01);
        $this->assertEqualsWithDelta(0.0, $result['path_loss']['total_db'], 0.01);
    }

    #[Test]
    public function it_subtracts_fiber_connector_splice_and_margin_before_chain(): void
    {
        $calculator = new PowerRxCalculator;

        $result = $calculator->calculateTapChain([
            'sfp_power_dbm' => 7.0,
            'fiber_m' => 2000.0,
            'attenuation_db_per_km' => 0.35,
            'connector_count' => 2,
            'connector_loss_db_each' => 0.3,
            'splice_count' => 4,
            'splice_loss_db_each' => 0.1,
            'design_margin_db' => 1.0,
            'odps' => [
                [
                    'name' => 'ODP 1',
                    'enabled' => true,
                    'tap_percent' => 4,
                    'odp_splitter' => 8,
                ],
            ],
        ]);

        // 2*0.35 + 2*0.3 + 4*0.1 + 1 = 0.7 + 0.6 + 0.4 + 1 = 2.7
        $this->assertEqualsWithDelta(2.7, $result['path_loss']['total_db'], 0.01);
        $this->assertEqualsWithDelta(4.3, $result['path_loss']['sfp_after_path_dbm'], 0.01);
        $this->assertEqualsWithDelta(4.3, $result['odps'][0]['input_power_dbm'], 0.01);
        // tanpa jalur: −17.23; dengan −2.7 → −19.93
        $this->assertEqualsWithDelta(-19.93, $result['odps'][0]['hasil_redaman_dbm'], 0.01);
    }

    #[Test]
    public function it_pairs_rasio_then_splitter_and_allows_standalone_modules(): void
    {
        $calculator = new PowerRxCalculator;

        $paired = $calculator->calculateTapChain([
            'sfp_power_dbm' => 7.0,
            'nodes' => [
                [
                    'id' => 'c1',
                    'type' => 'combo',
                    'name' => 'ODP 1',
                    'tap_percent' => 4,
                    'odp_splitter' => 8,
                ],
            ],
        ]);

        $this->assertSame('rasio_splitter', $paired['stages'][0]['kind']);
        $this->assertEqualsWithDelta(-17.23, $paired['stages'][0]['hasil_redaman_dbm'], 0.01);

        $rasioOnly = $calculator->calculateTapChain([
            'sfp_power_dbm' => 7.0,
            'nodes' => [
                ['id' => 'r1', 'type' => 'rasio', 'name' => 'Rasio 1', 'tap_percent' => 4],
            ],
        ]);

        // Hasil = output tap saja (7 − 14.23)
        $this->assertSame('rasio', $rasioOnly['stages'][0]['kind']);
        $this->assertEqualsWithDelta(-7.23, $rasioOnly['stages'][0]['hasil_redaman_dbm'], 0.01);

        $splitterOnly = $calculator->calculateTapChain([
            'sfp_power_dbm' => 7.0,
            'nodes' => [
                ['id' => 's1', 'type' => 'splitter', 'name' => 'Split', 'odp_splitter' => 8],
            ],
        ]);

        $this->assertSame('splitter', $splitterOnly['stages'][0]['kind']);
        $this->assertEqualsWithDelta(-3.0, $splitterOnly['stages'][0]['hasil_redaman_dbm'], 0.01);
    }
}
