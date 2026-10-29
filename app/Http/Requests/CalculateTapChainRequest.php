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
        $odpCount = (int) config('power_rx.odp_count');
        $allowedSplitters = config('power_rx.allowed_odp_splitters');

        return [
            'sfp_power_dbm' => ['required', 'numeric', 'between:-10,20'],
            'odps' => ['required', 'array', "size:{$odpCount}"],
            'odps.*.name' => ['required', 'string', 'max:64'],
            'odps.*.enabled' => ['required', 'boolean'],
            'odps.*.tap_percent' => ['required', 'integer', 'min:1', 'max:99'],
            'odps.*.odp_splitter' => ['required', 'integer', Rule::in($allowedSplitters)],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'sfp_power_dbm.required' => 'Daya SFP wajib diisi.',
            'odps.size' => 'Simulasi membutuhkan tepat 8 ODP.',
            'odps.*.tap_percent.min' => 'Rasio tap minimal 1%.',
            'odps.*.odp_splitter.in' => 'Splitter ODP tidak didukung.',
        ];
    }

    /**
     * @return array{
     *     sfp_power_dbm: float,
     *     odps: list<array{name: string, enabled: bool, tap_percent: int, odp_splitter: int}>
     * }
     */
    public function chainInput(): array
    {
        /** @var array<string, mixed> $data */
        $data = $this->validated();

        return [
            'sfp_power_dbm' => (float) $data['sfp_power_dbm'],
            'odps' => array_map(fn (array $odp): array => [
                'name' => $odp['name'],
                'enabled' => (bool) $odp['enabled'],
                'tap_percent' => (int) $odp['tap_percent'],
                'odp_splitter' => (int) $odp['odp_splitter'],
            ], $data['odps']),
        ];
    }
}
