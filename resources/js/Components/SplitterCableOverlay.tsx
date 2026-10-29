import type { SplitterMode, SplitterRatio } from '@/types/powerRx';
import { formatDb, insertionLossFromPercent } from '@/lib/powerRx';

type Props = {
    mode: SplitterMode;
    ratio?: SplitterRatio;
    percent?: number;
    excessLossDb?: number;
    insertionLossDb?: number | null;
    onFollowPort?: (port: 'red' | 'blue') => void;
};

type CableRole = 'input' | 'red' | 'blue' | 'equal';

function clampPercent(value: number): number {
    if (Number.isNaN(value)) {
        return 50;
    }

    return Math.min(99, Math.max(1, value));
}

function formatPercent(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

export default function SplitterCableOverlay({
    mode,
    ratio = 8,
    percent = 10,
    excessLossDb = 0.3,
    insertionLossDb = null,
    onFollowPort,
}: Props) {
    if (mode === 'ratio') {
        return <SymmetricOverlay ratio={ratio} />;
    }

    const pathPercent = clampPercent(percent);
    const complement = 100 - pathPercent;
    const highPercent = Math.max(pathPercent, complement);
    const lowPercent = Math.min(pathPercent, complement);
    const pathIsHigh = pathPercent > complement;
    const pathIsLow = pathPercent < complement;
    const pathIsEqual = pathPercent === complement;

    const pathIl =
        insertionLossDb === null
            ? insertionLossFromPercent(pathPercent, excessLossDb)
            : insertionLossDb;

    const activePort: CableRole = pathIsEqual ? 'equal' : pathIsHigh ? 'red' : 'blue';

    return (
        <div className="overflow-hidden rounded-xl border border-line bg-ink/[0.03]">
            <div className="flex items-center justify-between gap-2 border-b border-line/70 px-3 py-2">
                <p className="text-xs font-medium text-ink">Kode warna kabel fisik</p>
                <p className="font-mono text-[10px] tracking-wide text-ink-soft uppercase">
                    Putih · Merah · Biru
                </p>
            </div>

            <div className="px-3 py-4">
                <div className="relative mx-auto flex max-w-md items-center gap-2 sm:gap-3">
                    <CableEnd
                        color="white"
                        label="Input"
                        sublabel="COM"
                        detail="dari OLT / tahap sebelumnya"
                        active
                    />

                    <div className="relative flex min-w-0 flex-1 flex-col items-center">
                        <div className="h-1.5 w-full rounded-full bg-gradient-to-r from-white via-stone-300 to-stone-400 shadow-inner ring-1 ring-black/5" />
                        <div className="absolute top-1/2 left-1/2 z-10 flex size-14 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-line bg-paper shadow-md">
                            <span className="font-mono text-[10px] text-ink-soft">PLC</span>
                            <span className="font-mono text-xs font-semibold text-ink">
                                {formatPercent(lowPercent)}/
                                {formatPercent(highPercent)}
                            </span>
                        </div>
                    </div>

                    <div className="flex w-[7.5rem] flex-col gap-2 sm:w-36">
                        <CableEnd
                            color="red"
                            label={`${formatPercent(highPercent)}%`}
                            sublabel="Rasio terbesar"
                            detail="kabel merah"
                            active={activePort === 'red' || activePort === 'equal'}
                            emphasized={activePort === 'red'}
                            onClick={onFollowPort ? () => onFollowPort('red') : undefined}
                        />
                        <CableEnd
                            color="blue"
                            label={`${formatPercent(lowPercent)}%`}
                            sublabel="Rasio terkecil"
                            detail="kabel biru"
                            active={activePort === 'blue' || activePort === 'equal'}
                            emphasized={activePort === 'blue'}
                            onClick={onFollowPort ? () => onFollowPort('blue') : undefined}
                        />
                    </div>
                </div>

                <div
                    className={`mt-4 rounded-lg px-3 py-2 text-xs ring-1 ${
                        activePort === 'red'
                            ? 'bg-red-50 text-red-900 ring-red-200'
                            : activePort === 'blue'
                              ? 'bg-sky-50 text-sky-950 ring-sky-200'
                              : 'bg-amber-50 text-amber-950 ring-amber-200'
                    }`}
                >
                    {activePort === 'equal' ? (
                        <p>
                            Port seimbang 50/50%. Kedua keluaran setara; kode merah/biru
                            fisik biasanya tidak membedakan porsi.
                        </p>
                    ) : (
                        <p>
                            Jalur dihitung lewat kabel{' '}
                            <strong>{activePort === 'red' ? 'merah' : 'biru'}</strong> (
                            {formatPercent(pathPercent)}
                            %) · IL ≈ {formatDb(pathIl)} dB. Ketuk kabel merah/biru untuk
                            memilih port yang dilalui.
                        </p>
                    )}
                </div>
            </div>

            <CableLegend />
        </div>
    );
}

function SymmetricOverlay({ ratio }: { ratio: SplitterRatio }) {
    return (
        <div className="overflow-hidden rounded-xl border border-line bg-ink/[0.03]">
            <div className="flex items-center justify-between gap-2 border-b border-line/70 px-3 py-2">
                <p className="text-xs font-medium text-ink">Kode warna kabel fisik</p>
                <p className="font-mono text-[10px] tracking-wide text-ink-soft uppercase">
                    1:{ratio} simetris
                </p>
            </div>

            <div className="px-3 py-4">
                <div className="relative mx-auto flex max-w-md items-center gap-2 sm:gap-3">
                    <CableEnd
                        color="white"
                        label="Input"
                        sublabel="COM"
                        detail="kabel putih"
                        active
                    />

                    <div className="relative flex min-w-0 flex-1 flex-col items-center">
                        <div className="h-1.5 w-full rounded-full bg-gradient-to-r from-white via-stone-300 to-stone-400 ring-1 ring-black/5" />
                        <div className="absolute top-1/2 left-1/2 z-10 flex size-14 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-line bg-paper shadow-md">
                            <span className="font-mono text-[10px] text-ink-soft">PLC</span>
                            <span className="font-mono text-xs font-semibold text-ink">
                                1:{ratio}
                            </span>
                        </div>
                    </div>

                    <div className="flex w-[7.5rem] flex-col gap-1.5 sm:w-36">
                        <div className="rounded-lg border border-dashed border-line bg-white/70 px-2 py-2 text-center">
                            <p className="font-mono text-xs font-semibold text-ink">
                                {ratio} port setara
                            </p>
                            <p className="mt-0.5 text-[10px] text-ink-soft">
                                Keluaran simetris · merah/biru untuk splitter persen
                            </p>
                        </div>
                    </div>
                </div>

                <p className="mt-4 rounded-lg bg-white/70 px-3 py-2 text-xs text-ink-soft ring-1 ring-line">
                    Splitter 1:{ratio} membagi daya sama rata. Kode{' '}
                    <strong className="text-ink">putih = input</strong>; merah/biru dipakai
                    pada splitter asimetris (mode Persen).
                </p>
            </div>

            <CableLegend />
        </div>
    );
}

function CableEnd({
    color,
    label,
    sublabel,
    detail,
    active = false,
    emphasized = false,
    onClick,
}: {
    color: 'white' | 'red' | 'blue';
    label: string;
    sublabel: string;
    detail: string;
    active?: boolean;
    emphasized?: boolean;
    onClick?: () => void;
}) {
    const palette = {
        white: {
            jacket: 'bg-white ring-stone-300',
            tip: 'bg-stone-200',
            text: 'text-ink',
            glow: 'ring-stone-400/60',
        },
        red: {
            jacket: 'bg-red-600 ring-red-700',
            tip: 'bg-red-300',
            text: 'text-red-950',
            glow: 'ring-red-500/70',
        },
        blue: {
            jacket: 'bg-sky-600 ring-sky-700',
            tip: 'bg-sky-300',
            text: 'text-sky-950',
            glow: 'ring-sky-500/70',
        },
    }[color];

    const className = `w-[7.5rem] rounded-lg border px-2 py-2 text-left transition sm:w-36 ${
        emphasized
            ? `border-transparent bg-white shadow-md ring-2 ${palette.glow}`
            : active
              ? 'border-line bg-white/90'
              : 'border-transparent bg-white/40 opacity-70'
    } ${onClick ? 'cursor-pointer hover:opacity-100' : ''}`;

    const body = (
        <>
            <div className="mb-1.5 flex items-center gap-2">
                <span
                    className={`relative h-2.5 flex-1 rounded-full ring-1 ${palette.jacket}`}
                    aria-hidden
                >
                    <span
                        className={`absolute top-1/2 right-0 size-2.5 -translate-y-1/2 translate-x-1/3 rounded-full ring-1 ring-black/10 ${palette.tip}`}
                    />
                </span>
            </div>
            <p className={`font-mono text-sm font-semibold ${palette.text}`}>{label}</p>
            <p className="text-[10px] font-medium tracking-wide text-ink-soft uppercase">
                {sublabel}
            </p>
            <p className="mt-0.5 text-[10px] text-ink-soft">{detail}</p>
        </>
    );

    if (onClick) {
        return (
            <button type="button" onClick={onClick} className={className}>
                {body}
            </button>
        );
    }

    return <div className={className}>{body}</div>;
}

function CableLegend() {
    return (
        <dl className="grid grid-cols-3 gap-px border-t border-line/70 bg-line/40 text-[10px]">
            <LegendItem color="bg-white ring-stone-300" title="Putih" desc="Input / COM" />
            <LegendItem color="bg-red-600" title="Merah" desc="Porsi terbesar" />
            <LegendItem color="bg-sky-600" title="Biru" desc="Porsi terkecil" />
        </dl>
    );
}

function LegendItem({
    color,
    title,
    desc,
}: {
    color: string;
    title: string;
    desc: string;
}) {
    return (
        <div className="flex items-center gap-2 bg-paper px-2.5 py-2">
            <span className={`size-2.5 shrink-0 rounded-full ring-1 ring-black/10 ${color}`} />
            <div>
                <dt className="font-semibold text-ink">{title}</dt>
                <dd className="text-ink-soft">{desc}</dd>
            </div>
        </div>
    );
}
