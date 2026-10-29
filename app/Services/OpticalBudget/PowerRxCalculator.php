<?php

namespace App\Services\OpticalBudget;

use InvalidArgumentException;

class PowerRxCalculator
{
    /**
     * Rantai modular:
     * SFP − redaman jalur → [combo | rasio | splitter] …
     *
     * Combo menghasilkan HASIL (tap→1:N) dan Lanjut (through).
     * Opsional: splitter 1:N di cabang hasil dan/atau cabang lanjut.
     * Daya ke node berikutnya di rantai utama = ujung cabang lanjut (atau through mentah).
     *
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
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
                $power = $this->appendComboStages($node, $power, $stages, $summary);
                $i++;
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

                    $this->pushStage($stages, $summary, [
                        'kind' => 'rasio_splitter',
                        'name' => (string) ($next['name'] ?? $name),
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
                        'branch' => null,
                        'parent_id' => null,
                    ]);

                    $i += 2;
                    $power = $outputThrough;
                } else {
                    $hasil = $outputTap;
                    $status = $this->resolveStatus($hasil);

                    $this->pushStage($stages, $summary, [
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
                        'branch' => null,
                        'parent_id' => null,
                    ]);

                    $i++;
                    $power = $outputThrough;
                }
            } elseif ($type === 'splitter') {
                $odpSplitter = (int) ($node['odp_splitter'] ?? 8);
                $odpIl = $this->odpSplitterInsertionLoss($odpSplitter);
                $hasil = $power - $odpIl;
                $status = $this->resolveStatus($hasil);

                $this->pushStage($stages, $summary, [
                    'kind' => 'splitter',
                    'name' => (string) ($node['name'] ?? 'Splitter'),
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
                    'branch' => null,
                    'parent_id' => null,
                ]);

                $i++;
                $power = $hasil;
            } else {
                throw new InvalidArgumentException("Tipe node tidak dikenal: {$type}");
            }
        }

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
        }, array_values(array_filter(
            $stages,
            fn (array $s): bool => ($s['branch'] ?? null) === null,
        )));

        return [
            'path_loss' => $pathLoss,
            'stages' => $stages,
            'odps' => $odps,
            'summary' => $summary,
        ];
    }

    /**
     * @param  array<string, mixed>  $node
     * @param  list<array<string, mixed>>  $stages
     * @param  array<string, int>  $summary
     */
    private function appendComboStages(array $node, float $power, array &$stages, array &$summary): float
    {
        $parentId = (string) ($node['id'] ?? 'combo');
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

        $this->pushStage($stages, $summary, [
            'kind' => 'rasio_splitter',
            'name' => (string) ($node['name'] ?? 'ODP'),
            'node_ids' => [$parentId],
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
            'branch' => null,
            'parent_id' => null,
        ]);

        $hasilPower = $hasil;
        foreach ($node['hasil_branch'] ?? [] as $branchNode) {
            $hasilPower = $this->appendBranchSplitter(
                $branchNode,
                $hasilPower,
                'hasil',
                $parentId,
                $stages,
                $summary,
            );
        }

        $lanjutPower = $outputThrough;
        foreach ($node['lanjut_branch'] ?? [] as $branchNode) {
            $lanjutPower = $this->appendBranchSplitter(
                $branchNode,
                $lanjutPower,
                'lanjut',
                $parentId,
                $stages,
                $summary,
            );
        }

        // Rantai utama berikutnya selalu dari jalur lanjut (setelah cascade lanjut bila ada).
        return $lanjutPower;
    }

    /**
     * @param  array<string, mixed>  $branchNode
     * @param  list<array<string, mixed>>  $stages
     * @param  array<string, int>  $summary
     */
    private function appendBranchSplitter(
        array $branchNode,
        float $power,
        string $branch,
        string $parentId,
        array &$stages,
        array &$summary,
    ): float {
        $odpSplitter = (int) ($branchNode['odp_splitter'] ?? 8);
        $odpIl = $this->odpSplitterInsertionLoss($odpSplitter);
        $hasil = $power - $odpIl;
        $status = $this->resolveStatus($hasil);

        $this->pushStage($stages, $summary, [
            'kind' => 'splitter',
            'name' => (string) ($branchNode['name'] ?? 'Splitter'),
            'node_ids' => [(string) ($branchNode['id'] ?? uniqid('br-'))],
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
            'branch' => $branch,
            'parent_id' => $parentId,
        ]);

        return $hasil;
    }

    /**
     * @param  list<array<string, mixed>>  $stages
     * @param  array<string, int>  $summary
     * @param  array<string, mixed>  $stage
     */
    private function pushStage(array &$stages, array &$summary, array $stage): void
    {
        $stages[] = $stage;
        $summary['enabled_count']++;
        $summary[$stage['status']]++;
    }

    /**
     * @param  list<array{name: string, tap_percent: int, odp_splitter: int, enabled?: bool}>  $odps
     * @return list<array<string, mixed>>
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
                'hasil_branch' => [],
                'lanjut_branch' => [],
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
