import { type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import SplitterCableOverlay from '@/Components/SplitterCableOverlay';
import {
    asNumber,
    createDefaultStage,
    defaultIlForRatio,
    formatDb,
    insertionLossFromPercent,
    parseOptionalNumber,
} from '@/lib/powerRx';
import type { PowerRxConfig, SplitterRatio, SplitterStage } from '@/types/powerRx';

const RATIOS: SplitterRatio[] = [2, 4, 8, 16, 32, 64, 128];

type Props = {
    config: PowerRxConfig;
    stages: SplitterStage[];
    onChange: (stages: SplitterStage[]) => void;
    emptyText?: string;
};

export default function SplitterStageEditor({
    config,
    stages,
    onChange,
    emptyText = 'Belum ada tahap splitter pada jalur ini.',
}: Props) {
    function updateStage(id: string, patch: Partial<SplitterStage>) {
        onChange(
            stages.map((stage) => (stage.id === id ? { ...stage, ...patch } : stage)),
        );
    }

    function removeStage(id: string) {
        onChange(stages.filter((stage) => stage.id !== id));
    }

    function addStage() {
        onChange([...stages, createDefaultStage(config)]);
    }

    return (
        <div className="space-y-3">
            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={addStage}
                    className="rounded-md bg-signal px-3 py-1.5 text-xs font-medium text-white hover:bg-signal-deep"
                >
                    + Tambah splitter
                </button>
            </div>

            <p className="text-xs text-ink-soft">
                Urutan dari atas ke bawah = urutan sinyal setelah SFP. Contoh:{' '}
                <span className="font-medium text-ink">SFP → pasif → rasio</span> atau{' '}
                <span className="font-medium text-ink">SFP → rasio → pasif → rasio</span>.
            </p>

            {stages.length === 0 ? (
                <p className="text-sm text-ink-soft">{emptyText}</p>
            ) : (
                <ul className="space-y-3">
                    {stages.map((stage, index) => {
                        const catalogIl = defaultIlForRatio(stage.ratio, config.splitter_il);
                        const resolvedPercent = asNumber(
                            stage.percent,
                            config.percent.default_percent,
                        );
                        const resolvedExcess = asNumber(
                            stage.excessLossDb,
                            config.percent.default_excess_loss_db,
                        );
                        const percentIl = insertionLossFromPercent(
                            resolvedPercent,
                            resolvedExcess,
                        );
                        const autoIl = stage.mode === 'percent' ? percentIl : catalogIl;
                        const highPercent = Math.max(resolvedPercent, 100 - resolvedPercent);
                        const lowPercent = Math.min(resolvedPercent, 100 - resolvedPercent);

                        return (
                            <li
                                key={stage.id}
                                className="space-y-3 rounded-lg border border-line bg-white/70 p-3"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-mono text-xs tracking-wide text-ink-soft uppercase">
                                        Tahap {index + 1}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => removeStage(stage.id)}
                                        className="inline-flex items-center gap-1 text-sm text-danger hover:underline"
                                    >
                                        <Trash2 className="size-3.5" />
                                        Hapus
                                    </button>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <ModeButton
                                        active={stage.mode === 'ratio'}
                                        onClick={() =>
                                            updateStage(stage.id, {
                                                mode: 'ratio',
                                                insertionLossDb: null,
                                            })
                                        }
                                    >
                                        Passive splitter
                                    </ModeButton>
                                    <ModeButton
                                        active={stage.mode === 'percent'}
                                        onClick={() =>
                                            updateStage(stage.id, {
                                                mode: 'percent',
                                                insertionLossDb: null,
                                            })
                                        }
                                    >
                                        Rasio splitter
                                    </ModeButton>
                                </div>

                                <SplitterCableOverlay
                                    mode={stage.mode}
                                    ratio={stage.ratio}
                                    percent={resolvedPercent}
                                    excessLossDb={resolvedExcess}
                                    insertionLossDb={stage.insertionLossDb}
                                    onFollowPort={
                                        stage.mode === 'percent'
                                            ? (port) =>
                                                  updateStage(stage.id, {
                                                      percent:
                                                          port === 'red'
                                                              ? highPercent
                                                              : lowPercent,
                                                      insertionLossDb: null,
                                                  })
                                            : undefined
                                    }
                                />

                                {stage.mode === 'ratio' ? (
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <div>
                                            <label className="mb-1 block text-xs font-medium text-ink-soft">
                                                Passive (1:N)
                                            </label>
                                            <select
                                                value={stage.ratio}
                                                onChange={(e) =>
                                                    updateStage(stage.id, {
                                                        ratio: Number(
                                                            e.target.value,
                                                        ) as SplitterRatio,
                                                        insertionLossDb: null,
                                                    })
                                                }
                                                className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-signal focus:ring-2 focus:ring-signal/20"
                                            >
                                                {RATIOS.map((ratio) => (
                                                    <option key={ratio} value={ratio}>
                                                        1:{ratio} (IL katalog{' '}
                                                        {formatDb(
                                                            defaultIlForRatio(
                                                                ratio,
                                                                config.splitter_il,
                                                            ),
                                                        )}{' '}
                                                        dB)
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <OverrideField
                                            autoIl={catalogIl}
                                            value={stage.insertionLossDb}
                                            onChange={(value) =>
                                                updateStage(stage.id, {
                                                    insertionLossDb: value,
                                                })
                                            }
                                        />
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <div>
                                            <label className="mb-1 block text-xs font-medium text-ink-soft">
                                                Rasio port yang dilalui (%)
                                            </label>
                                            <div className="mb-2 flex flex-wrap gap-1.5">
                                                {config.percent.presets.map((preset) => (
                                                    <button
                                                        key={preset}
                                                        type="button"
                                                        onClick={() =>
                                                            updateStage(stage.id, {
                                                                percent: preset,
                                                                insertionLossDb: null,
                                                            })
                                                        }
                                                        className={`rounded-md px-2 py-1 font-mono text-xs ring-1 transition ${
                                                            stage.percent === preset
                                                                ? 'bg-signal text-white ring-signal'
                                                                : 'bg-white text-ink-soft ring-line hover:bg-paper'
                                                        }`}
                                                    >
                                                        {preset}%
                                                    </button>
                                                ))}
                                            </div>
                                            <input
                                                type="number"
                                                step={1}
                                                min={config.percent.min}
                                                max={config.percent.max}
                                                value={stage.percent ?? ''}
                                                onChange={(e) =>
                                                    updateStage(stage.id, {
                                                        percent: parseOptionalNumber(
                                                            e.target.value,
                                                        ),
                                                        insertionLossDb: null,
                                                    })
                                                }
                                                className="w-full rounded-md border border-line bg-white px-3 py-2 font-mono text-sm outline-none focus:border-signal focus:ring-2 focus:ring-signal/20"
                                            />
                                            <p className="mt-1 text-xs text-ink-soft">
                                                IL otomatis ≈ {formatDb(percentIl)} dB
                                            </p>
                                        </div>
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <div>
                                                <label className="mb-1.5 block text-sm font-medium text-ink">
                                                    Excess loss (dB)
                                                </label>
                                                <input
                                                    type="number"
                                                    step={1}
                                                    min={0}
                                                    value={stage.excessLossDb ?? ''}
                                                    onChange={(e) =>
                                                        updateStage(stage.id, {
                                                            excessLossDb:
                                                                parseOptionalNumber(
                                                                    e.target.value,
                                                                ),
                                                            insertionLossDb: null,
                                                        })
                                                    }
                                                    className="w-full rounded-md border border-line bg-white/80 px-3 py-2 font-mono text-sm outline-none focus:border-signal focus:ring-2 focus:ring-signal/20"
                                                />
                                            </div>
                                            <OverrideField
                                                autoIl={autoIl}
                                                value={stage.insertionLossDb}
                                                onChange={(value) =>
                                                    updateStage(stage.id, {
                                                        insertionLossDb: value,
                                                    })
                                                }
                                                hint="kosong = rumus persen"
                                            />
                                        </div>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

function ModeButton({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ring-1 transition ${
                active
                    ? 'bg-ink text-white ring-ink'
                    : 'bg-white text-ink-soft ring-line hover:bg-paper'
            }`}
        >
            {children}
        </button>
    );
}

function OverrideField({
    autoIl,
    value,
    onChange,
    hint = 'kosong = katalog',
}: {
    autoIl: number;
    value: number | null;
    onChange: (value: number | null) => void;
    hint?: string;
}) {
    return (
        <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">
                IL override (dB) — {hint}
            </label>
            <input
                type="number"
                step={1}
                min={0}
                placeholder={formatDb(autoIl)}
                value={value ?? ''}
                onChange={(e) => onChange(parseOptionalNumber(e.target.value))}
                className="w-full rounded-md border border-line bg-white px-3 py-2 font-mono text-sm outline-none focus:border-signal focus:ring-2 focus:ring-signal/20"
            />
        </div>
    );
}
