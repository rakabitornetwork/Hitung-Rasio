import { ArrowRight } from 'lucide-react';
import { formatDb } from '@/lib/powerRx';
import type { SplitterStage } from '@/types/powerRx';

type Props = {
    sfpDbm: number;
    stages: SplitterStage[];
    odpName: string;
    rxPowerDbm?: number | null;
};

function stageLabel(stage: SplitterStage): string {
    if (stage.mode === 'ratio') {
        return `Pasif 1:${stage.ratio}`;
    }

    const percent = stage.percent ?? 10;

    return `Rasio ${percent}%`;
}

export default function CascadeFlow({ sfpDbm, stages, odpName, rxPowerDbm }: Props) {
    return (
        <div className="overflow-x-auto rounded-xl border border-line bg-paper/70 px-3 py-3">
            <div className="flex min-w-max items-center gap-2">
                <FlowNode tone="sfp" title="SFP" subtitle={`${formatDb(sfpDbm)} dBm`} />

                {stages.map((stage) => (
                    <div key={stage.id} className="flex items-center gap-2">
                        <ArrowRight className="size-4 shrink-0 text-ink-soft" />
                        <FlowNode
                            tone={stage.mode === 'ratio' ? 'passive' : 'ratio'}
                            title={stage.mode === 'ratio' ? 'Pasif' : 'Rasio'}
                            subtitle={stageLabel(stage)}
                        />
                    </div>
                ))}

                <ArrowRight className="size-4 shrink-0 text-ink-soft" />
                <FlowNode
                    tone="odp"
                    title={odpName}
                    subtitle={
                        rxPowerDbm === null || rxPowerDbm === undefined
                            ? 'Power RX'
                            : `${formatDb(rxPowerDbm)} dBm`
                    }
                />
            </div>
        </div>
    );
}

function FlowNode({
    tone,
    title,
    subtitle,
}: {
    tone: 'sfp' | 'ratio' | 'passive' | 'odp';
    title: string;
    subtitle: string;
}) {
    const styles = {
        sfp: 'border-signal/40 bg-signal/10 text-signal-deep',
        ratio: 'border-ink/20 bg-white text-ink',
        passive: 'border-sky-300 bg-sky-50 text-sky-900',
        odp: 'border-ok/30 bg-ok/10 text-ok',
    }[tone];

    return (
        <div className={`min-w-[7.5rem] rounded-lg border px-3 py-2 ${styles}`}>
            <p className="text-[10px] font-semibold tracking-wide uppercase opacity-70">
                {title}
            </p>
            <p className="font-mono text-sm font-semibold">{subtitle}</p>
        </div>
    );
}
