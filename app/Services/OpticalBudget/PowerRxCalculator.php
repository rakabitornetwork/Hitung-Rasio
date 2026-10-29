<?php

namespace App\Services\OpticalBudget;

use InvalidArgumentException;

class PowerRxCalculator
{
    /**
     * Rantai tap ala YapsiNET:
     * SFP → [Rasio% ODP1] → through → [Rasio% ODP2] → … → ODP8
     * tiap tap → Splitter 1:N ODP → Hasil Redaman
     *
     * @param  array{
     *     sfp_power_dbm: float|int,
     *     odps: list<array{name: string, tap_percent: int, odp_splitter: int, enabled?: bool}>
     * }  $input
     * @return array{
     *     odps: list<array{
     *         name: string,
     *         enabled: bool,
     *         input_power_dbm: float,
     *         tap_percent: int,
     *         through_percent: int,
     *         tap_il_db: float,
     *         through_il_db: float,
     *         output_tap_dbm: float,
     *         output_through_dbm: float,
     *         odp_splitter: int,
     *         odp_splitter_il_db: float,
     *         hasil_redaman_dbm: float,
     *         status: 'ok'|'marginal'|'overload'|'fail'
     *     }>,
     *     summary: array{enabled_count: int, ok: int, marginal: int, overload: int, fail: int}
     * }
     */
    public function calculateTapChain(array $input): array
    {
        $power = (float) $input['sfp_power_dbm'];
        $odpResults = [];
        $summary = [
            'enabled_count' => 0,
            'ok' => 0,
            'marginal' => 0,
            'overload' => 0,
            'fail' => 0,
        ];

        foreach ($input['odps'] as $odp) {
            $enabled = (bool) ($odp['enabled'] ?? true);
            $tapPercent = (int) $odp['tap_percent'];
            $throughPercent = 100 - $tapPercent;
            $odpSplitter = (int) $odp['odp_splitter'];

            $tapIl = $this->rasioInsertionLoss($tapPercent);
            $throughIl = $this->rasioInsertionLoss($throughPercent);
            $odpIl = $this->odpSplitterInsertionLoss($odpSplitter);

            $outputTap = $power - $tapIl;
            $outputThrough = $power - $throughIl;
            $hasil = $outputTap - $odpIl;
            $status = $this->resolveStatus($hasil);

            $row = [
                'name' => $odp['name'],
                'enabled' => $enabled,
                'input_power_dbm' => $power,
                'tap_percent' => $tapPercent,
                'through_percent' => $throughPercent,
                'tap_il_db' => $tapIl,
                'through_il_db' => $throughIl,
                'output_tap_dbm' => $outputTap,
                'output_through_dbm' => $outputThrough,
                'odp_splitter' => $odpSplitter,
                'odp_splitter_il_db' => $odpIl,
                'hasil_redaman_dbm' => $hasil,
                'status' => $status,
            ];

            $odpResults[] = $row;

            if ($enabled) {
                $summary['enabled_count']++;
                $summary[$status]++;
            }

            // Daya lanjut ke ODP berikutnya = output through (meski ODP nonaktif, rantai tetap lanjut).
            $power = $outputThrough;
        }

        return [
            'odps' => $odpResults,
            'summary' => $summary,
        ];
    }

    public function rasioInsertionLoss(int $percent): float
    {
        $table = config('power_rx.rasio_il');

        if (! isset($table[$percent])) {
            throw new InvalidArgumentException("Persen rasio {$percent} tidak ada di tabel IL.");
        }

        return (float) $table[$percent];
    }

    public function odpSplitterInsertionLoss(int $ratio): float
    {
        $table = config('power_rx.odp_splitter_il');

        if (! isset($table[$ratio])) {
            throw new InvalidArgumentException("Splitter ODP 1:{$ratio} tidak didukung.");
        }

        return (float) $table[$ratio];
    }

    /**
     * @return 'ok'|'marginal'|'overload'|'fail'
     */
    public function resolveStatus(float $rxPowerDbm): string
    {
        $maxRx = (float) config('power_rx.thresholds.max_rx_dbm');
        $minOk = (float) config('power_rx.thresholds.min_ok_dbm');
        $sensitivity = (float) config('power_rx.thresholds.sensitivity_dbm');

        if ($rxPowerDbm > $maxRx) {
            return 'overload';
        }

        if ($rxPowerDbm >= $minOk) {
            return 'ok';
        }

        if ($rxPowerDbm >= $sensitivity) {
            return 'marginal';
        }

        return 'fail';
    }
}
