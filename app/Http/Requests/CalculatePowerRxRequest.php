<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class CalculatePowerRxRequest extends FormRequest
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
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            /** @var list<array<string, mixed>>|null $stages */
            $stages = $this->input('stages');

            if (! is_array($stages)) {
                return;
            }

            foreach ($stages as $index => $stage) {
                $mode = $stage['mode'] ?? null;

                if ($mode === 'ratio' && empty($stage['ratio'])) {
                    $validator->errors()->add(
                        "stages.{$index}.ratio",
                        'Rasio splitter wajib diisi untuk mode rasio.',
                    );
                }

                if ($mode === 'percent' && (! array_key_exists('percent', $stage) || $stage['percent'] === null || $stage['percent'] === '')) {
                    $validator->errors()->add(
                        "stages.{$index}.percent",
                        'Persen splitter wajib diisi untuk mode persen.',
                    );
                }
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
            'connector_count.min' => 'Jumlah konektor tidak boleh negatif.',
            'splice_count.min' => 'Jumlah splice tidak boleh negatif.',
            'stages.*.mode.in' => 'Mode tahap splitter tidak didukung.',
            'stages.*.ratio.in' => 'Rasio splitter tidak didukung.',
            'stages.*.percent.min' => 'Persen splitter terlalu kecil.',
            'stages.*.percent.max' => 'Persen splitter terlalu besar.',
        ];
    }

    /**
     * @return array{
     *     tx_power_dbm: float,
     *     fiber_length_km: float,
     *     attenuation_db_per_km: float,
     *     connector_count: int,
     *     connector_loss_db_each: float,
     *     splice_count: int,
     *     splice_loss_db_each: float,
     *     other_loss_db: float,
     *     design_margin_db: float,
     *     stages: list<array{
     *         mode: 'ratio'|'percent',
     *         ratio: int|null,
     *         percent: float|null,
     *         excess_loss_db: float|null,
     *         insertion_loss_db: float|null
     *     }>
     * }
     */
    public function calculatorInput(): array
    {
        /** @var array<string, mixed> $data */
        $data = $this->validated();

        $stages = [];

        foreach ($data['stages'] as $stage) {
            $mode = $stage['mode'];

            $stages[] = [
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
            'stages' => $stages,
        ];
    }
}
