<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CalculateTapChainRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $maxNodes = (int) config('power_rx.max_nodes');
        $allowedSplitters = config('power_rx.allowed_odp_splitters');

        return [
            'sfp_power_dbm' => ['required', 'numeric', 'between:-10,20'],
            'fiber_m' => ['nullable', 'numeric', 'min:0', 'max:200000'],
            'attenuation_db_per_km' => ['nullable', 'numeric', 'min:0', 'max:5'],
            'connector_count' => ['nullable', 'integer', 'min:0', 'max:64'],
            'connector_loss_db_each' => ['nullable', 'numeric', 'min:0', 'max:3'],
            'splice_count' => ['nullable', 'integer', 'min:0', 'max:200'],
            'splice_loss_db_each' => ['nullable', 'numeric', 'min:0', 'max:1'],
            'design_margin_db' => ['nullable', 'numeric', 'min:0', 'max:10'],
            'nodes' => ['required', 'array', 'min:0', "max:{$maxNodes}"],
            'nodes.*.id' => ['required', 'string', 'max:64'],
            'nodes.*.type' => ['required', 'string', Rule::in(['rasio', 'splitter', 'combo'])],
            'nodes.*.name' => ['required', 'string', 'max:64'],
            'nodes.*.tap_percent' => ['nullable', 'integer', 'min:0', 'max:99'],
            'nodes.*.odp_splitter' => ['nullable', 'integer', Rule::in($allowedSplitters)],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'sfp_power_dbm.required' => 'Daya SFP wajib diisi.',
            'nodes.max' => 'Terlalu banyak komponen di kanvas.',
            'nodes.*.type.in' => 'Tipe komponen harus rasio, splitter, atau combo.',
            'nodes.*.odp_splitter.in' => 'Splitter 1:N tidak didukung.',
        ];
    }

    /**
     * @return array{
     *     sfp_power_dbm: float,
     *     fiber_m: float,
     *     attenuation_db_per_km: float,
     *     connector_count: int,
     *     connector_loss_db_each: float,
     *     splice_count: int,
     *     splice_loss_db_each: float,
     *     design_margin_db: float,
     *     nodes: list<array{id: string, type: string, name: string, tap_percent?: int, odp_splitter?: int}>
     * }
     */
    public function chainInput(): array
    {
        /** @var array<string, mixed> $data */
        $data = $this->validated();
        $defaults = config('power_rx.defaults');

        $nodes = [];

        foreach ($data['nodes'] as $node) {
            if ($node['type'] === 'rasio') {
                $nodes[] = [
                    'id' => $node['id'],
                    'type' => 'rasio',
                    'name' => $node['name'],
                    'tap_percent' => (int) ($node['tap_percent'] ?? 0),
                ];
            } elseif ($node['type'] === 'combo') {
                $nodes[] = [
                    'id' => $node['id'],
                    'type' => 'combo',
                    'name' => $node['name'],
                    'tap_percent' => (int) ($node['tap_percent'] ?? 0),
                    'odp_splitter' => (int) ($node['odp_splitter'] ?? 8),
                ];
            } else {
                $nodes[] = [
                    'id' => $node['id'],
                    'type' => 'splitter',
                    'name' => $node['name'],
                    'odp_splitter' => (int) ($node['odp_splitter'] ?? 8),
                ];
            }
        }

        return [
            'sfp_power_dbm' => (float) $data['sfp_power_dbm'],
            'fiber_m' => (float) ($data['fiber_m'] ?? $defaults['fiber_m']),
            'attenuation_db_per_km' => (float) ($data['attenuation_db_per_km'] ?? $defaults['attenuation_db_per_km']),
            'connector_count' => (int) ($data['connector_count'] ?? $defaults['connector_count']),
            'connector_loss_db_each' => (float) ($data['connector_loss_db_each'] ?? $defaults['connector_loss_db_each']),
            'splice_count' => (int) ($data['splice_count'] ?? $defaults['splice_count']),
            'splice_loss_db_each' => (float) ($data['splice_loss_db_each'] ?? $defaults['splice_loss_db_each']),
            'design_margin_db' => (float) ($data['design_margin_db'] ?? $defaults['design_margin_db']),
            'nodes' => $nodes,
        ];
    }
}
