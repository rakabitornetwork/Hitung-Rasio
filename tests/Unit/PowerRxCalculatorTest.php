<?php

namespace Tests\Unit;

use App\Services\OpticalBudget\PowerRxCalculator;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class PowerRxCalculatorTest extends TestCase
{
    private PowerRxCalculator $calculator;

    protected function setUp(): void
    {
        parent::setUp();

        $this->calculator = new PowerRxCalculator;
    }

    #[Test]
    public function it_calculates_without_splitter_stages(): void
    {
        $result = $this->calculator->calculate([
            'tx_power_dbm' => 5.0,
            'fiber_length_km' => 10.0,
            'attenuation_db_per_km' => 0.35,
            'connector_count' => 2,
            'connector_loss_db_each' => 0.3,
            'splice_count' => 1,
            'splice_loss_db_each' => 0.1,
            'other_loss_db' => 0.0,
            'design_margin_db' => 0.0,
            'stages' => [],
        ]);

        $this->assertEqualsWithDelta(3.5, $result['breakdown']['fiber_db'], 0.0001);
        $this->assertEqualsWithDelta(0.6, $result['breakdown']['connector_db'], 0.0001);
        $this->assertEqualsWithDelta(0.1, $result['breakdown']['splice_db'], 0.0001);
        $this->assertEqualsWithDelta(0.0, $result['breakdown']['splitter_db'], 0.0001);
        $this->assertSame(1, $result['effective_ratio']);
        $this->assertFalse($result['has_percent_stages']);
        $this->assertEqualsWithDelta(0.8, $result['rx_power_dbm'], 0.0001);
        $this->assertSame('overload', $result['status']);
    }

    #[Test]
    public function it_uses_default_insertion_loss_for_single_stage(): void
    {
        $result = $this->calculator->calculate([
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
                ['mode' => 'ratio', 'ratio' => 32, 'insertion_loss_db' => null],
            ],
        ]);

        $this->assertEqualsWithDelta(17.0, $result['breakdown']['splitter_db'], 0.0001);
        $this->assertSame(32, $result['effective_ratio']);
        $this->assertEqualsWithDelta(-12.0, $result['rx_power_dbm'], 0.0001);
        $this->assertSame('ok', $result['status']);
    }

    #[Test]
    public function it_calculates_cascade_example_from_reference(): void
    {
        $result = $this->calculator->calculate([
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

        $this->assertEqualsWithDelta(2.8, $result['breakdown']['fiber_db'], 0.0001);
        $this->assertEqualsWithDelta(1.2, $result['breakdown']['connector_db'], 0.0001);
        $this->assertEqualsWithDelta(0.2, $result['breakdown']['splice_db'], 0.0001);
        $this->assertEqualsWithDelta(17.5, $result['breakdown']['splitter_db'], 0.0001);
        $this->assertEqualsWithDelta(21.7, $result['total_loss_db'], 0.0001);
        $this->assertEqualsWithDelta(-16.7, $result['rx_power_dbm'], 0.0001);
        $this->assertSame(32, $result['effective_ratio']);
        $this->assertSame('ok', $result['status']);
    }

    #[Test]
    public function it_allows_manual_insertion_loss_override(): void
    {
        $result = $this->calculator->calculate([
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
                ['mode' => 'ratio', 'ratio' => 8, 'insertion_loss_db' => 9.5],
            ],
        ]);

        $this->assertEqualsWithDelta(9.5, $result['breakdown']['splitter_db'], 0.0001);
        $this->assertEqualsWithDelta(-4.5, $result['rx_power_dbm'], 0.0001);
        $this->assertSame('overload', $result['status']);
    }

    #[Test]
    public function it_calculates_percent_stage_with_default_excess_loss(): void
    {
        $result = $this->calculator->calculate([
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
                    'excess_loss_db' => null,
                    'insertion_loss_db' => null,
                ],
            ],
        ]);

        // 10*log10(100/10) + 0.3 = 10.3
        $this->assertEqualsWithDelta(10.3, $result['breakdown']['splitter_db'], 0.0001);
        $this->assertNull($result['effective_ratio']);
        $this->assertTrue($result['has_percent_stages']);
        $this->assertEqualsWithDelta(-5.3, $result['rx_power_dbm'], 0.0001);
        $this->assertSame('overload', $result['status']);
        $this->assertSame('percent', $result['stage_losses'][0]['mode']);
        $this->assertEqualsWithDelta(10.0, $result['stage_losses'][0]['percent'], 0.0001);
    }

    #[Test]
    public function it_calculates_percent_stage_without_excess_loss(): void
    {
        $il = $this->calculator->insertionLossFromPercent(50, 0.0);

        $this->assertEqualsWithDelta(3.0102999566, $il, 0.0001);

        $result = $this->calculator->calculate([
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
                    'percent' => 50,
                    'excess_loss_db' => 0.0,
                    'insertion_loss_db' => null,
                ],
            ],
        ]);

        $this->assertEqualsWithDelta($il, $result['breakdown']['splitter_db'], 0.0001);
        $this->assertNull($result['effective_ratio']);
    }

    #[Test]
    public function it_allows_manual_override_on_percent_stage(): void
    {
        $result = $this->calculator->calculate([
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
                    'insertion_loss_db' => 11.0,
                ],
            ],
        ]);

        $this->assertEqualsWithDelta(11.0, $result['breakdown']['splitter_db'], 0.0001);
    }

    #[Test]
    public function it_marks_fail_below_sensitivity(): void
    {
        $result = $this->calculator->calculate([
            'tx_power_dbm' => 2.0,
            'fiber_length_km' => 20.0,
            'attenuation_db_per_km' => 0.35,
            'connector_count' => 4,
            'connector_loss_db_each' => 0.3,
            'splice_count' => 4,
            'splice_loss_db_each' => 0.1,
            'other_loss_db' => 1.0,
            'design_margin_db' => 0.0,
            'stages' => [
                ['mode' => 'ratio', 'ratio' => 64, 'insertion_loss_db' => null],
            ],
        ]);

        $this->assertLessThan(-28.0, $result['rx_power_dbm']);
        $this->assertSame('fail', $result['status']);
    }

    #[Test]
    public function it_marks_overload_above_max_rx(): void
    {
        $status = $this->calculator->resolveStatus(-7.5);

        $this->assertSame('overload', $status);
    }
}
