import { FormEvent, type ReactNode, useMemo, useState } from 'react';
import { Head } from '@inertiajs/react';
import { Antenna, Cable, MapPin, RotateCcw, Zap } from 'lucide-react';
import CascadeFlow from '@/Components/CascadeFlow';
import SplitterStageEditor from '@/Components/SplitterStageEditor';
import {
    asNumber,
    buildInitialNetworkInput,
    calculateOdpNetwork,
    formatDb,
    parseOptionalNumber,
    serializeStages,
    statusLabel,
} from '@/lib/powerRx';
import type {
    OdpBranch,
    OdpNetworkInput,
    OdpNetworkResult,
    PowerRxConfig,
    PowerRxStatus,
} from '@/types/powerRx';

type Props = {
    config: PowerRxConfig;
};

function statusClasses(status: PowerRxStatus): string {
    switch (status) {
        case 'ok':
            return 'bg-ok/10 text-ok ring-ok/30';
        case 'marginal':
            return 'bg-amber/10 text-amber ring-amber/30';
        case 'overload':
            return 'bg-danger/10 text-danger ring-danger/30';
        case 'fail':
            return 'bg-danger/15 text-danger ring-danger/40';
    }
}

function mapServerNetworkResult(raw: {
    shared_loss_db: number;
    odps: Array<{
        key: string;
        name: string;
        enabled: boolean;
        result: null | {
            total_loss_db: number;
            rx_power_dbm: number;
            effective_ratio: number | null;
            has_percent_stages: boolean;
            breakdown: {
                fiber_db: number;
                connector_db: number;
                splice_db: number;
                splitter_db: number;
                other_db: number;
                design_margin_db: number;
            };
            stage_losses: Array<{
                mode: 'ratio' | 'percent';
                ratio: number | null;
                percent: number | null;
                excess_loss_db: number | null;
                insertion_loss_db: number;
                label: string;
            }>;
            status: PowerRxStatus;
        };
    }>;
    summary: {
        enabled_count: number;
        ok: number;
        marginal: number;
        overload: number;
        fail: number;
    };
}): OdpNetworkResult {
    return {
        sharedLossDb: raw.shared_loss_db,
        summary: {
            enabledCount: raw.summary.enabled_count,
            ok: raw.summary.ok,
            marginal: raw.summary.marginal,
            overload: raw.summary.overload,
            fail: raw.summary.fail,
        },
        odps: raw.odps.map((odp) => ({
            key: odp.key,
            name: odp.name,
            enabled: odp.enabled,
            result: odp.result
                ? {
                      totalLossDb: odp.result.total_loss_db,
                      rxPowerDbm: odp.result.rx_power_dbm,
                      effectiveRatio: odp.result.effective_ratio,
                      hasPercentStages: odp.result.has_percent_stages,
                      breakdown: {
                          fiberDb: odp.result.breakdown.fiber_db,
                          connectorDb: odp.result.breakdown.connector_db,
                          spliceDb: odp.result.breakdown.splice_db,
                          splitterDb: odp.result.breakdown.splitter_db,
                          otherDb: odp.result.breakdown.other_db,
                          designMarginDb: odp.result.breakdown.design_margin_db,
                      },
                      stageLosses: odp.result.stage_losses.map((stage) => ({
                          mode: stage.mode,
                          ratio: stage.ratio,
                          percent: stage.percent,
                          excessLossDb: stage.excess_loss_db,
                          insertionLossDb: stage.insertion_loss_db,
                          label: stage.label,
                      })),
                      status: odp.result.status,
                  }
                : null,
        })),
    };
}

export default function Index({ config }: Props) {
    const [network, setNetwork] = useState<OdpNetworkInput>(() =>
        buildInitialNetworkInput(config),
    );
    const [activeOdpKey, setActiveOdpKey] = useState('odp-1');
    const [showExtraLoss, setShowExtraLoss] = useState(false);
    const [serverResult, setServerResult] = useState<OdpNetworkResult | null>(null);
    const [serverError, setServerError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const liveResult = useMemo(
        () =>
            calculateOdpNetwork(network, {
                splitter_il: config.splitter_il,
                thresholds: config.thresholds,
                percent: config.percent,
            }),
        [network, config],
    );

    const displayed = serverResult ?? liveResult;
    const activeOdp =
        network.odps.find((odp) => odp.key === activeOdpKey) ?? network.odps[0];
    const activeResult =
        displayed.odps.find((odp) => odp.key === activeOdp?.key)?.result ?? null;
    const sfpDbm = asNumber(network.txPowerDbm, 7);

    function touch() {
        setServerResult(null);
        setServerError(null);
    }

    function updateSfp(value: number | null) {
        touch();
        setNetwork((prev) => ({ ...prev, txPowerDbm: value }));
    }

    function updateOdp(key: string, patch: Partial<OdpBranch>) {
        touch();
        setNetwork((prev) => ({
            ...prev,
            odps: prev.odps.map((odp) => (odp.key === key ? { ...odp, ...patch } : odp)),
        }));
    }

    function resetForm() {
        setNetwork(buildInitialNetworkInput(config));
        setActiveOdpKey('odp-1');
        setShowExtraLoss(false);
        setServerResult(null);
        setServerError(null);
    }

    async function handleOfficialCalculate(event: FormEvent) {
        event.preventDefault();
        setIsSubmitting(true);
        setServerError(null);

        try {
            const csrf = document
                .querySelector('meta[name="csrf-token"]')
                ?.getAttribute('content');

            const response = await fetch('/power-rx/hitung-odp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': csrf ?? '',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: JSON.stringify({
                    tx_power_dbm: network.txPowerDbm ?? 0,
                    fiber_length_km: 0,
                    attenuation_db_per_km: config.defaults.attenuation_db_per_km,
                    connector_count: 0,
                    connector_loss_db_each: config.defaults.connector_loss_db_each,
                    splice_count: 0,
                    splice_loss_db_each: config.defaults.splice_loss_db_each,
                    other_loss_db: 0,
                    design_margin_db: 0,
                    stages: [],
                    odps: network.odps.map((odp) => ({
                        key: odp.key,
                        name: odp.name,
                        enabled: odp.enabled,
                        fiber_length_km: 0,
                        connector_count: 0,
                        connector_loss_db_each: config.defaults.connector_loss_db_each,
                        splice_count: 0,
                        splice_loss_db_each: config.defaults.splice_loss_db_each,
                        other_loss_db: odp.otherLossDb ?? 0,
                        stages: serializeStages(odp.stages),
                    })),
                }),
            });

            const payload = await response.json();

            if (!response.ok) {
                const message =
                    payload.message ||
                    (payload.errors
                        ? Object.values(payload.errors).flat().join(' ')
                        : 'Perhitungan server gagal.');
                setServerError(String(message));
                setServerResult(null);

                return;
            }

            setServerResult(mapServerNetworkResult(payload.result));
        } catch {
            setServerError('Tidak dapat menghubungi server. Hasil live tetap ditampilkan.');
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <>
            <Head title="Simulasi 8 ODP · Power RX" />

            <div className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                <header className="mb-8 max-w-3xl">
                    <p className="mb-2 font-mono text-xs tracking-[0.2em] text-signal uppercase">
                        SFP → Splitter → ODP
                    </p>
                    <h1 className="text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
                        Power RX OLT
                    </h1>
                    <p className="mt-3 text-base text-ink-soft sm:text-lg">
                        Susun urutan splitter setelah SFP, lalu lihat Power RX di 8 ODP.
                        Contoh: <strong className="font-medium text-ink">SFP → pasif → rasio</strong>{' '}
                        atau{' '}
                        <strong className="font-medium text-ink">
                            SFP → rasio → pasif → rasio
                        </strong>
                        .
                    </p>
                </header>

                <form
                    onSubmit={handleOfficialCalculate}
                    className="grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]"
                >
                    <section className="space-y-6">
                        <Panel title="1. Nilai SFP" icon={<Zap className="size-4" />}>
                            <div className="max-w-xs">
                                <label className="mb-1.5 block text-sm font-medium text-ink">
                                    Daya SFP / TX (dBm)
                                </label>
                                <input
                                    type="number"
                                    step={1}
                                    value={network.txPowerDbm ?? ''}
                                    onChange={(e) =>
                                        updateSfp(parseOptionalNumber(e.target.value))
                                    }
                                    className="w-full rounded-md border border-line bg-white px-3 py-2.5 font-mono text-lg outline-none focus:border-signal focus:ring-2 focus:ring-signal/20"
                                />
                                <p className="mt-2 text-xs text-ink-soft">
                                    Ini titik awal perhitungan. Semua ODP memakai nilai SFP
                                    yang sama.
                                </p>
                            </div>
                        </Panel>

                        <Panel title="2. Cascade per ODP" icon={<MapPin className="size-4" />}>
                            <div className="mb-4 flex flex-wrap gap-2">
                                {network.odps.map((odp) => {
                                    const row = displayed.odps.find(
                                        (item) => item.key === odp.key,
                                    );
                                    const status = row?.result?.status;

                                    return (
                                        <button
                                            key={odp.key}
                                            type="button"
                                            onClick={() => setActiveOdpKey(odp.key)}
                                            className={`rounded-md px-3 py-1.5 text-xs font-medium ring-1 transition ${
                                                activeOdpKey === odp.key
                                                    ? 'bg-ink text-white ring-ink'
                                                    : odp.enabled
                                                      ? 'bg-white text-ink ring-line hover:bg-paper'
                                                      : 'bg-paper-deep/50 text-ink-soft ring-line line-through'
                                            }`}
                                        >
                                            {odp.name}
                                            {status && odp.enabled ? (
                                                <span className="ml-1 opacity-70">
                                                    · {statusLabel(status)}
                                                </span>
                                            ) : null}
                                        </button>
                                    );
                                })}
                            </div>

                            {activeOdp && (
                                <div className="space-y-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <label className="flex items-center gap-2 text-sm font-medium text-ink">
                                            <input
                                                type="checkbox"
                                                checked={activeOdp.enabled}
                                                onChange={(e) =>
                                                    updateOdp(activeOdp.key, {
                                                        enabled: e.target.checked,
                                                    })
                                                }
                                                className="size-4 rounded border-line text-signal focus:ring-signal"
                                            />
                                            Aktifkan {activeOdp.name}
                                        </label>
                                        <input
                                            type="text"
                                            value={activeOdp.name}
                                            onChange={(e) =>
                                                updateOdp(activeOdp.key, {
                                                    name: e.target.value,
                                                })
                                            }
                                            className="rounded-md border border-line bg-white px-3 py-1.5 text-sm outline-none focus:border-signal focus:ring-2 focus:ring-signal/20"
                                        />
                                    </div>

                                    <CascadeFlow
                                        sfpDbm={sfpDbm}
                                        stages={activeOdp.stages}
                                        odpName={activeOdp.name}
                                        rxPowerDbm={activeResult?.rxPowerDbm}
                                    />

                                    <SplitterStageEditor
                                        config={config}
                                        stages={activeOdp.stages}
                                        onChange={(stages) =>
                                            updateOdp(activeOdp.key, { stages })
                                        }
                                        emptyText="Belum ada splitter. Tambah Passive splitter atau Rasio splitter sesuai urutan di lapangan."
                                    />

                                    <div>
                                        <button
                                            type="button"
                                            onClick={() => setShowExtraLoss((v) => !v)}
                                            className="text-xs font-medium text-signal hover:underline"
                                        >
                                            {showExtraLoss
                                                ? 'Sembunyikan loss ekstra'
                                                : 'Opsional: loss ekstra (fiber/konektor/dll.)'}
                                        </button>
                                        {showExtraLoss && (
                                            <div className="mt-2 max-w-xs">
                                                <label className="mb-1.5 block text-sm font-medium text-ink">
                                                    Loss ekstra ke {activeOdp.name} (dB)
                                                </label>
                                                <input
                                                    type="number"
                                                    step={1}
                                                    min={0}
                                                    value={activeOdp.otherLossDb ?? ''}
                                                    onChange={(e) =>
                                                        updateOdp(activeOdp.key, {
                                                            otherLossDb:
                                                                parseOptionalNumber(
                                                                    e.target.value,
                                                                ),
                                                        })
                                                    }
                                                    className="w-full rounded-md border border-line bg-white px-3 py-2 font-mono text-sm outline-none focus:border-signal focus:ring-2 focus:ring-signal/20"
                                                />
                                                <p className="mt-1 text-xs text-ink-soft">
                                                    Gabungan loss non-splitter (boleh
                                                    dikosongkan).
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </Panel>

                        <div className="flex flex-wrap gap-3">
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-white transition hover:bg-ink/90 disabled:opacity-60"
                            >
                                <Cable className="size-4" />
                                {isSubmitting ? 'Menghitung…' : 'Hitung resmi (server)'}
                            </button>
                            <button
                                type="button"
                                onClick={resetForm}
                                className="inline-flex items-center gap-2 rounded-md border border-line bg-white/80 px-4 py-2.5 text-sm font-medium text-ink-soft transition hover:bg-white"
                            >
                                <RotateCcw className="size-4" />
                                Reset contoh
                            </button>
                        </div>
                        {serverError && (
                            <p className="text-sm text-danger">{serverError}</p>
                        )}
                    </section>

                    <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
                        <div className="overflow-hidden rounded-2xl border border-line bg-ink text-white shadow-lg shadow-ink/10">
                            <div className="border-b border-white/10 px-5 py-4">
                                <div className="flex items-center gap-2 text-sm text-white/70">
                                    <Antenna className="size-4" />
                                    Hasil 8 ODP
                                    <span className="ml-auto font-mono text-[10px] tracking-wider uppercase text-white/40">
                                        {serverResult ? 'Server' : 'Live'}
                                    </span>
                                </div>
                                <p className="mt-2 font-mono text-sm text-white/70">
                                    SFP {formatDb(sfpDbm)} dBm
                                </p>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="min-w-full text-left text-sm">
                                    <thead className="bg-white/5 text-[10px] tracking-wider text-white/50 uppercase">
                                        <tr>
                                            <th className="px-4 py-2 font-medium">ODP</th>
                                            <th className="px-4 py-2 font-medium">Alur</th>
                                            <th className="px-4 py-2 font-medium">P_rx</th>
                                            <th className="px-4 py-2 font-medium">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {displayed.odps.map((odp) => {
                                            const source = network.odps.find(
                                                (item) => item.key === odp.key,
                                            );
                                            const flow =
                                                source?.stages
                                                    .map((stage) =>
                                                        stage.mode === 'ratio'
                                                            ? `Pasif 1:${stage.ratio}`
                                                            : `Rasio ${stage.percent ?? '?'}%`,
                                                    )
                                                    .join(' → ') || 'langsung';

                                            return (
                                                <tr
                                                    key={odp.key}
                                                    className={`border-t border-white/10 ${
                                                        activeOdpKey === odp.key
                                                            ? 'bg-white/10'
                                                            : ''
                                                    }`}
                                                >
                                                    <td className="px-4 py-2.5">
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setActiveOdpKey(odp.key)
                                                            }
                                                            className="text-left hover:underline"
                                                        >
                                                            {odp.name}
                                                        </button>
                                                    </td>
                                                    <td className="max-w-[9rem] truncate px-4 py-2.5 font-mono text-xs text-white/60">
                                                        {flow}
                                                    </td>
                                                    <td className="px-4 py-2.5 font-mono">
                                                        {odp.enabled && odp.result
                                                            ? `${formatDb(odp.result.rxPowerDbm)}`
                                                            : '—'}
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        {odp.enabled && odp.result ? (
                                                            <span
                                                                className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusClasses(odp.result.status)}`}
                                                            >
                                                                {statusLabel(
                                                                    odp.result.status,
                                                                )}
                                                            </span>
                                                        ) : (
                                                            <span className="text-white/40">
                                                                Off
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="rounded-xl border border-line bg-white/70 px-4 py-3 text-xs leading-relaxed text-ink-soft">
                            <p className="font-medium text-ink">Cara pakai singkat</p>
                            <ol className="mt-2 list-decimal space-y-1 pl-4">
                                <li>Isi daya SFP (misalnya 7).</li>
                                <li>Pilih ODP-1 … ODP-8.</li>
                                <li>
                                    Tambah splitter berurutan: Passive atau Rasio, sesuai
                                    urutan di lapangan.
                                </li>
                                <li>Lihat Power RX di tabel kanan (langsung berubah).</li>
                            </ol>
                        </div>
                    </aside>
                </form>
            </div>
        </>
    );
}

function Panel({
    title,
    icon,
    children,
}: {
    title: string;
    icon: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="rounded-2xl border border-line bg-white/75 p-5 shadow-sm shadow-ink/5 backdrop-blur">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-wide text-ink uppercase">
                <span className="flex size-7 items-center justify-center rounded-md bg-paper-deep text-signal">
                    {icon}
                </span>
                {title}
            </h2>
            {children}
        </div>
    );
}
