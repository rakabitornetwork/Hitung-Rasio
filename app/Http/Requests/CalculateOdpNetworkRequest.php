<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class CalculateOdpNetworkRequest extends FormRequest
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
        $allowedRatios = config('power_rx.allowed_ratios');
        $percentMin = config('power_rx.percent.min');
        $percentMax = config('power_rx.percent.max');
        $odpCount = (int) config('power_rx.odp.count');

        return [
            'tx_power_dbm' => ['required', 'numeric', 'between:-10,20'],
            'fiber_length_km' => ['required', 'numeric', 'min:0', 'max:100'],
            'attenuation_db_per_km' => ['required', 'numeric', 'min:0', 'max:2'],
            'connector_count' => ['required', 'integer', 'min:0', 'max:100'],
            'connector_loss_db_each' => ['required', 'numeric', 'min:0', 'max:5'],
            'splice_count' => ['required', 'integer', 'min:0', 'max:200'],
            'splice_loss_db_each' => ['required', 'numeric', 'min:0', 'max:5'],
            'other_loss_db' => ['required', 'numeric', 'min:0', 'max:50'],
            'design_margin_db' => ['required', 'numeric', 'min:0', 'max:20'],
            'stages' => ['present', 'array', 'max:10'],
            'stages.*.mode' => ['required', Rule::in(['ratio', 'percent'])],
            'stages.*.ratio' => ['nullable', 'integer', Rule::in($allowedRatios)],
            'stages.*.percent' => ['nullable', 'numeric', "min:{$percentMin}", "max:{$percentMax}"],
            'stages.*.excess_loss_db' => ['nullable', 'numeric', 'min:0', 'max:5'],
            'stages.*.insertion_loss_db' => ['nullable', 'numeric', 'min:0', 'max:40'],
            'odps' => ['required', 'array', "size:{$odpCount}"],
            'odps.*.key' => ['required', 'string', 'max:32'],
            'odps.*.name' => ['required', 'string', 'max:64'],
            'odps.*.enabled' => ['required', 'boolean'],
            'odps.*.fiber_length_km' => ['required', 'numeric', 'min:0', 'max:100'],
            'odps.*.connector_count' => ['required', 'integer', 'min:0', 'max:100'],
            'odps.*.connector_loss_db_each' => ['required', 'numeric', 'min:0', 'max:5'],
            'odps.*.splice_count' => ['required', 'integer', 'min:0', 'max:200'],
            'odps.*.splice_loss_db_each' => ['required', 'numeric', 'min:0', 'max:5'],
            'odps.*.other_loss_db' => ['required', 'numeric', 'min:0', 'max:50'],
            'odps.*.stages' => ['present', 'array', 'max:10'],
            'odps.*.stages.*.mode' => ['required', Rule::in(['ratio', 'percent'])],
            'odps.*.stages.*.ratio' => ['nullable', 'integer', Rule::in($allowedRatios)],
            'odps.*.stages.*.percent' => ['nullable', 'numeric', "min:{$percentMin}", "max:{$percentMax}"],
            'odps.*.stages.*.excess_loss_db' => ['nullable', 'numeric', 'min:0', 'max:5'],
            'odps.*.stages.*.insertion_loss_db' => ['nullable', 'numeric', 'min:0', 'max:40'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $this->validateStageGroup($validator, 'stages', $this->input('stages'));

            /** @var list<array<string, mixed>>|null $odps */
            $odps = $this->input('odps');

            if (! is_array($odps)) {
                return;
            }

            foreach ($odps as $odpIndex => $odp) {
                $this->validateStageGroup(
                    $validator,
                    "odps.{$odpIndex}.stages",
                    $odp['stages'] ?? null,
                );
            }
        });
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'tx_power_dbm.required' => 'Daya TX OLT wajib diisi.',
            'fiber_length_km.min' => 'Panjang fiber tidak boleh negatif.',
            'odps.size' => 'Simulasi membutuhkan tepat 8 titik ODP.',
            'stages.*.mode.in' => 'Mode tahap splitter tidak didukung.',
            'stages.*.ratio.in' => 'Rasio splitter tidak didukung.',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function networkInput(): array
    {
        /** @var array<string, mixed> $data */
        $data = $this->validated();

        return [
            'tx_power_dbm' => (float) $data['tx_power_dbm'],
            'fiber_length_km' => (float) $data['fiber_length_km'],
            'attenuation_db_per_km' => (float) $data['attenuation_db_per_km'],
            'connector_count' => (int) $data['connector_count'],
            'connector_loss_db_each' => (float) $data['connector_loss_db_each'],
            'splice_count' => (int) $data['splice_count'],
            'splice_loss_db_each' => (float) $data['splice_loss_db_each'],
            'other_loss_db' => (float) $data['other_loss_db'],
            'design_margin_db' => (float) $data['design_margin_db'],
            'stages' => $this->mapStages($data['stages']),
            'odps' => array_map(function (array $odp): array {
                return [
                    'key' => $odp['key'],
                    'name' => $odp['name'],
                    'enabled' => (bool) $odp['enabled'],
                    'fiber_length_km' => (float) $odp['fiber_length_km'],
                    'connector_count' => (int) $odp['connector_count'],
                    'connector_loss_db_each' => (float) $odp['connector_loss_db_each'],
                    'splice_count' => (int) $odp['splice_count'],
                    'splice_loss_db_each' => (float) $odp['splice_loss_db_each'],
                    'other_loss_db' => (float) $odp['other_loss_db'],
                    'stages' => $this->mapStages($odp['stages']),
                ];
            }, $data['odps']),
        ];
    }

    /**
     * @param  list<array<string, mixed>>|null  $stages
     */
    private function validateStageGroup(Validator $validator, string $prefix, mixed $stages): void
    {
        if (! is_array($stages)) {
            return;
        }

        foreach ($stages as $index => $stage) {
            $mode = $stage['mode'] ?? null;

            if ($mode === 'ratio' && empty($stage['ratio'])) {
                $validator->errors()->add(
                    "{$prefix}.{$index}.ratio",
                    'Rasio splitter wajib diisi untuk mode rasio.',
                );
            }

            if ($mode === 'percent' && (! array_key_exists('percent', $stage) || $stage['percent'] === null || $stage['percent'] === '')) {
                $validator->errors()->add(
                    "{$prefix}.{$index}.percent",
                    'Persen splitter wajib diisi untuk mode persen.',
                );
            }
        }
    }

    /**
     * @param  list<array<string, mixed>>  $stages
     * @return list<array{
     *     mode: 'ratio'|'percent',
     *     ratio: int|null,
     *     percent: float|null,
     *     excess_loss_db: float|null,
     *     insertion_loss_db: float|null
     * }>
     */
    private function mapStages(array $stages): array
    {
        $mapped = [];

        foreach ($stages as $stage) {
            $mode = $stage['mode'];

            $mapped[] = [
                'mode' => $mode,
                'ratio' => $mode === 'ratio' ? (int) $stage['ratio'] : null,
                'percent' => $mode === 'percent' ? (float) $stage['percent'] : null,
                'excess_loss_db' => $mode === 'percent' && array_key_exists('excess_loss_db', $stage) && $stage['excess_loss_db'] !== null
                    ? (float) $stage['excess_loss_db']
                    : null,
                'insertion_loss_db' => array_key_exists('insertion_loss_db', $stage) && $stage['insertion_loss_db'] !== null
                    ? (float) $stage['insertion_loss_db']
                    : null,
            ];
        }

        return $mapped;
    }
}
