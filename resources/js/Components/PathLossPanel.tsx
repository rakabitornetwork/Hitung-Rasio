import { useEffect, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import IconPng from '@/Components/IconPng';
import { formatDb, parseOptionalNumber } from '@/lib/powerRx';
import type { PathLossResult, TapChainInput } from '@/types/powerRx';

const STORAGE_KEY = 'power-rx-path-loss-open';

type Props = {
    chain: TapChainInput;
    pathLoss: PathLossResult;
    onChange: (patch: Partial<TapChainInput>) => void;
};

export default function PathLossPanel({ chain, pathLoss, onChange }: Props) {
    const [open, setOpen] = useState(() => {
        if (typeof window === 'undefined') {
            return true;
        }

        const stored = window.localStorage.getItem(STORAGE_KEY);

        if (stored === null) {
            return true;
        }

        return stored === '1';
    });

    useEffect(() => {
        window.localStorage.setItem(STORAGE_KEY, open ? '1' : '0');
    }, [open]);

    return (
        <section className="rounded-2xl border border-line bg-white/80 p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-ink">
                        Redaman jalur (sebelum splitter)
                    </h2>
                    <p className="mt-1 text-xs text-ink-soft">
                        Dikurangi dari daya SFP sekali, lalu masuk ke rantai ODP.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-sm text-ink">
                        Total −{formatDb(pathLoss.totalDb)} dB → masuk ODP1{' '}
                        <span className="font-semibold">
                            {formatDb(pathLoss.sfpAfterPathDbm)} dBm
                        </span>
                    </p>
                    <button
                        type="button"
                        onClick={() => setOpen((value) => !value)}
                        aria-expanded={open}
                        aria-controls="path-loss-fields"
                        className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-medium leading-none text-white shadow-sm transition-colors duration-200 ${
                            open
                                ? 'border-slate-500/40 bg-slate-600 hover:bg-slate-700'
                                : 'border-signal/40 bg-signal hover:bg-signal-deep'
                        }`}
                    >
                        <IconPng
                            name={open ? 'sembunyikan' : 'tampilkan'}
                            size={16}
                            alt=""
                        />
                        <span>{open ? 'Sembunyikan' : 'Tampilkan'}</span>
                    </button>
                </div>
            </div>

            <div
                className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
                    open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                }`}
            >
                <div className="min-h-0 overflow-hidden">
                    <div
                        id="path-loss-fields"
                        aria-hidden={!open}
                        inert={!open ? true : undefined}
                        className={`mt-3 grid gap-3 transition-[opacity,transform] duration-300 ease-in-out sm:grid-cols-2 xl:grid-cols-4 ${
                            open
                                ? 'translate-y-0 opacity-100'
                                : '-translate-y-1 opacity-0'
                        }`}
                    >
                        <FieldGroup
                            icon={<IconPng name="fiber" size={28} alt="Fiber" />}
                            title="Fiber"
                            hint="Panjang (m) × atenuasi (dB/km) ÷ 1000"
                        >
                            <NumberField
                                label="Panjang (m)"
                                value={chain.fiberM}
                                step={1}
                                onChange={(v) => onChange({ fiberM: v })}
                            />
                            <NumberField
                                label="Atenuasi (dB/km)"
                                value={chain.attenuationDbPerKm}
                                step={0.01}
                                onChange={(v) =>
                                    onChange({ attenuationDbPerKm: v })
                                }
                            />
                            <p className="text-[11px] text-ink-soft">
                                Fiber: {formatDb(pathLoss.fiberDb)} dB
                            </p>
                        </FieldGroup>

                        <FieldGroup
                            icon={
                                <IconPng
                                    name="connector"
                                    size={28}
                                    alt="Konektor"
                                />
                            }
                            title="Konektor"
                            hint="SC/LC mechanical — biasanya ~0,3 dB/buah"
                        >
                            <NumberField
                                label="Jumlah"
                                value={chain.connectorCount}
                                step={1}
                                onChange={(v) =>
                                    onChange({ connectorCount: v })
                                }
                            />
                            <NumberField
                                label="Loss tiap (dB)"
                                value={chain.connectorLossDbEach}
                                step={0.05}
                                onChange={(v) =>
                                    onChange({ connectorLossDbEach: v })
                                }
                            />
                            <p className="text-[11px] text-ink-soft">
                                Konektor: {formatDb(pathLoss.connectorDb)} dB
                            </p>
                        </FieldGroup>

                        <FieldGroup
                            icon={
                                <IconPng name="splice" size={28} alt="Splice" />
                            }
                            title="Splice / las"
                            hint="Fusion splice — biasanya ~0,05–0,1 dB/titik"
                        >
                            <NumberField
                                label="Jumlah"
                                value={chain.spliceCount}
                                step={1}
                                onChange={(v) => onChange({ spliceCount: v })}
                            />
                            <NumberField
                                label="Loss tiap (dB)"
                                value={chain.spliceLossDbEach}
                                step={0.01}
                                onChange={(v) =>
                                    onChange({ spliceLossDbEach: v })
                                }
                            />
                            <p className="text-[11px] text-ink-soft">
                                Splice: {formatDb(pathLoss.spliceDb)} dB
                            </p>
                        </FieldGroup>

                        <FieldGroup
                            icon={
                                <IconPng name="hasil" size={28} alt="Margin" />
                            }
                            title="Margin desain"
                            hint="Opsional — boleh dibiarkan 0"
                        >
                            <NumberField
                                label="Cadangan (dB)"
                                value={chain.designMarginDb}
                                step={0.1}
                                onChange={(v) =>
                                    onChange({ designMarginDb: v })
                                }
                            />
                            <div className="mt-1 flex gap-2 rounded-lg bg-paper/80 p-2 text-[11px] text-ink-soft">
                                <Info className="mt-0.5 size-3.5 shrink-0 text-signal-deep" />
                                <p>
                                    <span className="font-medium text-ink">
                                        Bukan komponen fisik.
                                    </span>{' '}
                                    Cadangan keamanan untuk kotoran konektor,
                                    penuaan, suhu, atau ketidakpastian ukur —
                                    agar ONT tetap aman di lapangan. Isi 0 jika
                                    ingin hasil “apa adanya”.
                                </p>
                            </div>
                        </FieldGroup>
                    </div>
                </div>
            </div>
        </section>
    );
}

function FieldGroup({
    icon,
    title,
    hint,
    children,
}: {
    icon: ReactNode;
    title: string;
    hint: string;
    children: ReactNode;
}) {
    return (
        <div className="rounded-xl border border-line bg-paper/40 p-3">
            <div className="mb-2 flex items-center gap-2 text-ink">
                <span className="shrink-0">{icon}</span>
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide">
                        {title}
                    </p>
                    <p className="text-[11px] text-ink-soft">{hint}</p>
                </div>
            </div>
            <div className="space-y-2">{children}</div>
        </div>
    );
}

function NumberField({
    label,
    value,
    step,
    onChange,
}: {
    label: string;
    value: number | null;
    step: number;
    onChange: (value: number | null) => void;
}) {
    return (
        <label className="block text-xs text-ink">
            <span className="mb-1 block font-medium">{label}</span>
            <input
                type="number"
                step={step}
                min={0}
                value={value ?? ''}
                onChange={(e) => onChange(parseOptionalNumber(e.target.value))}
                className="w-full rounded-md border border-line bg-white px-2.5 py-1.5 font-mono text-sm outline-none focus:border-signal focus:ring-2 focus:ring-signal/20"
            />
        </label>
    );
}
