<?php

namespace App\Services\OpticalBudget;

use InvalidArgumentException;

class PowerRxCalculator
{
    /**
     * Rantai modular:
     * SFP − redaman jalur → [rasio | splitter | rasio+splitter berurutan] …
     *
     * - combo / rasio+splitter berurutan → model YapsiNET (tap → splitter → hasil; through lanjut)
     * - rasio saja → hasil = output tap; through lanjut
     * - splitter saja → hasil = input − IL 1:N; rantai lanjut dari hasil
     *
     * @param  array{
     *     sfp_power_dbm: float|int,
     *     fiber_m?: float|int|null,
     *     attenuation_db_per_km?: float|int|null,
     *     connector_count?: int|null,
     *     connector_loss_db_each?: float|int|null,
     *     splice_count?: int|null,
     *     splice_loss_db_each?: float|int|null,
     *     design_margin_db?: float|int|null,
     *     nodes?: list<array{id?: string, type: string, name?: string, tap_percent?: int, odp_splitter?: int}>,
     *     odps?: list<array{name: string, tap_percent: int, odp_splitter: int, enabled?: bool}>
     * }  $input
     * @return array{
     *     path_loss: array{
     *         fiber_db: float,
     *         connector_db: float,
     *         splice_db: float,
     *         design_margin_db: float,
     *         total_db: float,
     *         sfp_after_path_dbm: float
     *     },
     *     stages: list<array<string, mixed>>,
     *     odps: list<array<string, mixed>>,
     *     summary: array{enabled_count: int, ok: int, marginal: int, overload: int, fail: int}
     * }
     */
    public function calculateTapChain(array $input): array
    {
        $defaults = config('power_rx.defaults');

        $fiberM = (float) ($input['fiber_m'] ?? $defaults['fiber_m']);
        $attenuation = (float) ($input['attenuation_db_per_km'] ?? $defaults['attenuation_db_per_km']);
        $connectorCount = (int) ($input['connector_count'] ?? $defaults['connector_count']);
        $connectorEach = (float) ($input['connector_loss_db_each'] ?? $defaults['connector_loss_db_each']);
        $spliceCount = (int) ($input['splice_count'] ?? $defaults['splice_count']);
        $spliceEach = (float) ($input['splice_loss_db_each'] ?? $defaults['splice_loss_db_each']);
        $designMargin = (float) ($input['design_margin_db'] ?? $defaults['design_margin_db']);

        $fiberDb = ($fiberM / 1000.0) * $attenuation;
        $connectorDb = $connectorCount * $connectorEach;
        $spliceDb = $spliceCount * $spliceEach;
        $pathTotal = $fiberDb + $connectorDb + $spliceDb + $designMargin;

        $sfp = (float) $input['sfp_power_dbm'];
        $power = $sfp - $pathTotal;

        $pathLoss = [
            'fiber_db' => $fiberDb,
            'connector_db' => $connectorDb,
            'splice_db' => $spliceDb,
            'design_margin_db' => $designMargin,
            'total_db' => $pathTotal,
            'sfp_after_path_dbm' => $power,
        ];

        $nodes = $input['nodes'] ?? $this->nodesFromLegacyOdps($input['odps'] ?? []);

        $stages = [];
        $summary = [
            'enabled_count' => 0,
            'ok' => 0,
            'marginal' => 0,
            'overload' => 0,
            'fail' => 0,
        ];

        $i = 0;
        $count = count($nodes);

        while ($i < $count) {
            $node = $nodes[$i];
            $type = $node['type'] ?? '';

            if ($type === 'combo') {
                $tapPercent = (int) ($node['tap_percent'] ?? 0);
                $throughPercent = 100 - $tapPercent;
                $tapIl = $this->rasioInsertionLoss($tapPercent);
                $throughIl = $this->rasioInsertionLoss($throughPercent);
                $odpSplitter = (int) ($node['odp_splitter'] ?? 8);
                $odpIl = $this->odpSplitterInsertionLoss($odpSplitter);
                $outputTap = $power - $tapIl;
                $outputThrough = $power - $throughIl;
                $hasil = $outputTap - $odpIl;
                $status = $this->resolveStatus($hasil);

                $stages[] = [
                    'kind' => 'rasio_splitter',
                    'name' => (string) ($node['name'] ?? 'ODP'),
                    'node_ids' => [(string) ($node['id'] ?? "combo-{$i}")],
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

                $i++;
                $power = $outputThrough;
            } elseif ($type === 'rasio') {
                $next = $nodes[$i + 1] ?? null;
                $tapPercent = (int) ($node['tap_percent'] ?? 0);
                $throughPercent = 100 - $tapPercent;
                $tapIl = $this->rasioInsertionLoss($tapPercent);
                $throughIl = $this->rasioInsertionLoss($throughPercent);
                $outputTap = $power - $tapIl;
                $outputThrough = $power - $throughIl;
                $name = (string) ($node['name'] ?? 'Rasio');

                if (is_array($next) && ($next['type'] ?? '') === 'splitter') {
                    $odpSplitter = (int) ($next['odp_splitter'] ?? 8);
                    $odpIl = $this->odpSplitterInsertionLoss($odpSplitter);
                    $hasil = $outputTap - $odpIl;
                    $status = $this->resolveStatus($hasil);
                    $pairName = (string) ($next['name'] ?? $name);

                    $stages[] = [
                        'kind' => 'rasio_splitter',
                        'name' => $pairName,
                        'node_ids' => [
                            (string) ($node['id'] ?? "rasio-{$i}"),
                            (string) ($next['id'] ?? 'splitter-'.($i + 1)),
                        ],
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

                    $i += 2;
                    $power = $outputThrough;
                } else {
                    $hasil = $outputTap;
                    $status = $this->resolveStatus($hasil);

                    $stages[] = [
                        'kind' => 'rasio',
                        'name' => $name,
                        'node_ids' => [(string) ($node['id'] ?? "rasio-{$i}")],
                        'input_power_dbm' => $power,
                        'tap_percent' => $tapPercent,
                        'through_percent' => $throughPercent,
                        'tap_il_db' => $tapIl,
                        'through_il_db' => $throughIl,
                        'output_tap_dbm' => $outputTap,
                        'output_through_dbm' => $outputThrough,
                        'odp_splitter' => null,
                        'odp_splitter_il_db' => null,
                        'hasil_redaman_dbm' => $hasil,
                        'status' => $status,
                    ];

                    $i++;
                    $power = $outputThrough;
                }
            } elseif ($type === 'splitter') {
                $odpSplitter = (int) ($node['odp_splitter'] ?? 8);
                $odpIl = $this->odpSplitterInsertionLoss($odpSplitter);
                $hasil = $power - $odpIl;
                $status = $this->resolveStatus($hasil);
                $name = (string) ($node['name'] ?? 'Splitter');

                $stages[] = [
                    'kind' => 'splitter',
                    'name' => $name,
                    'node_ids' => [(string) ($node['id'] ?? "splitter-{$i}")],
                    'input_power_dbm' => $power,
                    'tap_percent' => null,
                    'through_percent' => null,
                    'tap_il_db' => null,
                    'through_il_db' => null,
                    'output_tap_dbm' => null,
                    'output_through_dbm' => $hasil,
                    'odp_splitter' => $odpSplitter,
                    'odp_splitter_il_db' => $odpIl,
                    'hasil_redaman_dbm' => $hasil,
                    'status' => $status,
                ];

                $i++;
                $power = $hasil;
            } else {
                throw new InvalidArgumentException("Tipe node tidak dikenal: {$type}");
            }

            $last = $stages[array_key_last($stages)];
            $summary['enabled_count']++;
            $summary[$last['status']]++;
        }

        // Compat: odps = stages berbentuk pasangan / hasil (untuk UI lama & tes Excel).
        $odps = array_map(function (array $stage): array {
            return [
                'name' => $stage['name'],
                'enabled' => true,
                'input_power_dbm' => $stage['input_power_dbm'],
                'tap_percent' => $stage['tap_percent'] ?? 0,
                'through_percent' => $stage['through_percent'] ?? 0,
                'tap_il_db' => $stage['tap_il_db'] ?? 0.0,
                'through_il_db' => $stage['through_il_db'] ?? 0.0,
                'output_tap_dbm' => $stage['output_tap_dbm'] ?? $stage['hasil_redaman_dbm'],
                'output_through_dbm' => $stage['output_through_dbm'] ?? $stage['hasil_redaman_dbm'],
                'odp_splitter' => $stage['odp_splitter'] ?? 0,
                'odp_splitter_il_db' => $stage['odp_splitter_il_db'] ?? 0.0,
                'hasil_redaman_dbm' => $stage['hasil_redaman_dbm'],
                'status' => $stage['status'],
            ];
        }, $stages);

        return [
            'path_loss' => $pathLoss,
            'stages' => $stages,
            'odps' => $odps,
            'summary' => $summary,
        ];
    }

    /**
     * @param  list<array{name: string, tap_percent: int, odp_splitter: int, enabled?: bool}>  $odps
     * @return list<array{id: string, type: string, name: string, tap_percent?: int, odp_splitter?: int}>
     */
    public function nodesFromLegacyOdps(array $odps): array
    {
        $nodes = [];

        foreach ($odps as $index => $odp) {
            $n = $index + 1;
            $nodes[] = [
                'id' => "legacy-combo-{$n}",
                'type' => 'combo',
                'name' => $odp['name'],
                'tap_percent' => (int) $odp['tap_percent'],
                'odp_splitter' => (int) $odp['odp_splitter'],
            ];
        }

        return $nodes;
    }

    public function rasioInsertionLoss(int $percent): float
    {
        if ($percent <= 0) {
            return 99.0;
        }

        if ($percent >= 100) {
            return 0.0;
        }

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
