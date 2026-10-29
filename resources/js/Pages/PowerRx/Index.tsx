import { FormEvent, useMemo, useRef, useState } from 'react';
import { Head } from '@inertiajs/react';
import FlowBuilder from '@/Components/FlowBuilder';
import IconPng from '@/Components/IconPng';
import PathLossPanel from '@/Components/PathLossPanel';
import UpdateButton from '@/Components/UpdateButton';
import { ACTION_BUTTON_CLASS } from '@/lib/actionButton';
import {
    buildInitialTapChain,
    calculateTapChain,
    formatDb,
    kindLabel,
    statusLabel,
} from '@/lib/powerRx';
import { downloadSaveFile, readSaveFile } from '@/lib/powerRxFile';
import type {
    PathLossResult,
    PowerRxConfig,
    PowerRxStatus,
    StageResult,
    TapChainInput,
    TapChainResult,
} from '@/types/powerRx';

type Props = {
    config: PowerRxConfig;
};

function statusClasses(status: PowerRxStatus): string {
    switch (status) {
        case 'ok':
            return 'bg-ok/15 text-ok ring-ok/25';
        case 'marginal':
            return 'bg-amber/15 text-amber ring-amber/25';
        case 'overload':
            return 'bg-danger/15 text-danger ring-danger/25';
        case 'fail':
            return 'bg-danger/20 text-danger ring-danger/30';
    }
}

function mapPathLoss(raw: {
    fiber_db: number;
    connector_db: number;
    splice_db: number;
    design_margin_db: number;
    total_db: number;
    sfp_after_path_dbm: number;
}): PathLossResult {
    return {
        fiberDb: raw.fiber_db,
        connectorDb: raw.connector_db,
        spliceDb: raw.splice_db,
        designMarginDb: raw.design_margin_db,
        totalDb: raw.total_db,
        sfpAfterPathDbm: raw.sfp_after_path_dbm,
    };
}

function mapStage(raw: {
    kind: StageResult['kind'];
    name: string;
    node_ids: string[];
    input_power_dbm: number;
    tap_percent: number | null;
    through_percent: number | null;
    tap_il_db: number | null;
    through_il_db: number | null;
    output_tap_dbm: number | null;
    output_through_dbm: number | null;
    odp_splitter: number | null;
    odp_splitter_il_db: number | null;
    hasil_redaman_dbm: number;
    status: PowerRxStatus;
    branch?: 'hasil' | 'lanjut' | null;
    parent_id?: string | null;
}): StageResult {
    return {
        kind: raw.kind,
        name: raw.name,
        nodeIds: raw.node_ids,
        inputPowerDbm: raw.input_power_dbm,
        tapPercent: raw.tap_percent,
        throughPercent: raw.through_percent,
        tapIlDb: raw.tap_il_db,
        throughIlDb: raw.through_il_db,
        outputTapDbm: raw.output_tap_dbm,
        outputThroughDbm: raw.output_through_dbm,
        odpSplitter: raw.odp_splitter,
        odpSplitterIlDb: raw.odp_splitter_il_db,
        hasilRedamanDbm: raw.hasil_redaman_dbm,
        status: raw.status,
        branch: raw.branch ?? null,
        parentId: raw.parent_id ?? null,
    };
}

function mapServerResult(raw: {
    path_loss: {
        fiber_db: number;
        connector_db: number;
        splice_db: number;
        design_margin_db: number;
        total_db: number;
        sfp_after_path_dbm: number;
    };
    stages: Array<Parameters<typeof mapStage>[0]>;
    summary: {
        enabled_count: number;
        ok: number;
        marginal: number;
        overload: number;
        fail: number;
    };
}): TapChainResult {
    return {
        pathLoss: mapPathLoss(raw.path_loss),
        stages: raw.stages.map(mapStage),
        summary: {
            enabledCount: raw.summary.enabled_count,
            ok: raw.summary.ok,
            marginal: raw.summary.marginal,
            overload: raw.summary.overload,
            fail: raw.summary.fail,
        },
    };
}

export default function Index({ config }: Props) {
    const [chain, setChain] = useState<TapChainInput>(() => buildInitialTapChain(config));
    const [serverResult, setServerResult] = useState<TapChainResult | null>(null);
    const [serverError, setServerError] = useState<string | null>(null);
    const [fileMessage, setFileMessage] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const liveResult = useMemo(
        () =>
            calculateTapChain(chain, {
                rasio_il: config.rasio_il,
                odp_splitter_il: config.odp_splitter_il,
                thresholds: config.thresholds,
                defaults: config.defaults,
            }),
        [chain, config],
    );

    const displayed = serverResult ?? liveResult;

    function handleChainChange(next: TapChainInput) {
        setServerResult(null);
        setServerError(null);
        setChain(next);
    }

    function handlePathPatch(patch: Partial<TapChainInput>) {
        handleChainChange({ ...chain, ...patch });
    }

    function resetForm() {
        setChain(buildInitialTapChain(config));
        setServerResult(null);
        setServerError(null);
        setFileMessage(null);
    }

    function saveToFile() {
        downloadSaveFile(chain);
        setFileMessage('File berhasil disimpan.');
        setServerError(null);
    }

    async function loadFromFile(file: File | null) {
        if (!file) {
            return;
        }

        try {
            const loaded = await readSaveFile(file);
            handleChainChange(loaded);
            setFileMessage(`File dimuat: ${file.name}`);
            setServerError(null);
        } catch (error) {
            setFileMessage(null);
            setServerError(
                error instanceof Error ? error.message : 'Gagal memuat file.',
            );
        } finally {
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
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
                    sfp_power_dbm: chain.sfpPowerDbm ?? 0,
                    fiber_m: chain.fiberM ?? 0,
                    attenuation_db_per_km: chain.attenuationDbPerKm ?? 0.35,
                    connector_count: chain.connectorCount ?? 0,
                    connector_loss_db_each: chain.connectorLossDbEach ?? 0.3,
                    splice_count: chain.spliceCount ?? 0,
                    splice_loss_db_each: chain.spliceLossDbEach ?? 0.1,
                    design_margin_db: chain.designMarginDb ?? 0,
                    nodes: chain.nodes.map((node) => {
                        if (node.type === 'rasio') {
                            return {
                                id: node.id,
                                type: 'rasio',
                                name: node.name,
                                tap_percent: node.tapPercent ?? 0,
                            };
                        }

                        if (node.type === 'combo') {
                            return {
                                id: node.id,
                                type: 'combo',
                                name: node.name,
                                tap_percent: node.tapPercent ?? 0,
                                odp_splitter: node.odpSplitter,
                                hasil_branch: node.hasilBranch.map((item) => ({
                                    id: item.id,
                                    name: item.name,
                                    odp_splitter: item.odpSplitter,
                                })),
                                lanjut_branch: node.lanjutBranch.map((item) => ({
                                    id: item.id,
                                    name: item.name,
                                    odp_splitter: item.odpSplitter,
                                })),
                            };
                        }

                        return {
                            id: node.id,
                            type: 'splitter',
                            name: node.name,
                            odp_splitter: node.odpSplitter,
                        };
                    }),
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

            setServerResult(mapServerResult(payload.result));
        } catch {
            setServerError('Tidak dapat menghubungi server. Hasil live tetap ditampilkan.');
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <>
            <Head title="Perhitungan Rasio Splitter" />

            <div className="mx-auto min-h-screen max-w-[1500px] px-3 py-6 sm:px-6">
                <header className="mb-5 max-w-3xl">
                    <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                        Aplikasi Perhitungan Rasio Splitter
                    </h1>
                    <p className="mt-2 text-sm text-ink-soft sm:text-base">
                        Bongkar-pasang kartu rasio dan splitter 1:N secara terpisah. Pasangkan
                        berurutan untuk model ODP lengkap, atau pakai salah satunya saja.
                    </p>
                </header>

                <form onSubmit={handleOfficialCalculate} className="space-y-4">
                    <PathLossPanel
                        chain={chain}
                        pathLoss={displayed.pathLoss}
                        onChange={handlePathPatch}
                    />

                    <FlowBuilder
                        config={config}
                        chain={chain}
                        result={displayed}
                        onChange={handleChainChange}
                    />

                    <div className="overflow-x-auto rounded-xl border border-line bg-white/80 shadow-sm">
                        <table className="min-w-full text-left text-sm">
                            <thead className="bg-ink text-white">
                                <tr>
                                    <th className="px-3 py-2 font-medium">Tahap</th>
                                    <th className="px-3 py-2 font-medium">Model</th>
                                    <th className="px-3 py-2 font-medium">Input</th>
                                    <th className="px-3 py-2 font-medium">Rasio</th>
                                    <th className="px-3 py-2 font-medium">Splitter</th>
                                    <th className="px-3 py-2 font-medium">Hasil</th>
                                    <th className="px-3 py-2 font-medium">Status</th>
                                    <th className="px-3 py-2 font-medium">Lanjut</th>
                                </tr>
                            </thead>
                            <tbody>
                                {displayed.stages.map((stage) => (
                                    <tr
                                        key={`${stage.nodeIds.join('-')}-${stage.branch ?? 'main'}`}
                                        className="border-t border-line"
                                    >
                                        <td className="px-3 py-2 font-medium text-ink">
                                            {stage.name}
                                            {stage.branch && (
                                                <span className="ml-1 text-[10px] font-normal text-ink-soft">
                                                    ({stage.branch})
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-xs text-ink-soft">
                                            {kindLabel(stage.kind)}
                                        </td>
                                        <td className="px-3 py-2 font-mono">
                                            {formatDb(stage.inputPowerDbm)}
                                        </td>
                                        <td className="px-3 py-2 font-mono text-sky-800">
                                            {stage.tapPercent != null
                                                ? `${stage.tapPercent}/${stage.throughPercent}%`
                                                : '—'}
                                        </td>
                                        <td className="px-3 py-2 font-mono">
                                            {stage.odpSplitter != null
                                                ? `1:${stage.odpSplitter}`
                                                : '—'}
                                        </td>
                                        <td className="px-3 py-2 font-mono font-semibold">
                                            {formatDb(stage.hasilRedamanDbm)}
                                        </td>
                                        <td className="px-3 py-2">
                                            <span
                                                className={`inline-flex rounded px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusClasses(stage.status)}`}
                                            >
                                                {statusLabel(stage.status)}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 font-mono text-red-700">
                                            {stage.kind !== 'splitter' &&
                                            stage.outputThroughDbm != null
                                                ? formatDb(stage.outputThroughDbm)
                                                : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className={`${ACTION_BUTTON_CLASS} bg-signal hover:bg-signal-deep`}
                            >
                                <IconPng name="hitung" size={16} alt="" />
                                <span>
                                    {isSubmitting ? 'Menghitung…' : 'Hitung'}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={saveToFile}
                                className={`${ACTION_BUTTON_CLASS} bg-sky-600 hover:bg-sky-700`}
                            >
                                <IconPng name="simpan" size={16} alt="" />
                                <span>Simpan</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className={`${ACTION_BUTTON_CLASS} bg-emerald-600 hover:bg-emerald-700`}
                            >
                                <IconPng name="muat" size={16} alt="" />
                                <span>Muat</span>
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="application/json,.json"
                                className="hidden"
                                onChange={(e) =>
                                    void loadFromFile(
                                        e.target.files?.[0] ?? null,
                                    )
                                }
                            />
                            <button
                                type="button"
                                onClick={resetForm}
                                className={`${ACTION_BUTTON_CLASS} border-amber-600/40 bg-amber-500 hover:bg-amber-600`}
                            >
                                <IconPng name="reset" size={16} alt="" />
                                <span>Reset</span>
                            </button>
                            <UpdateButton />
                        </div>
                        {(fileMessage || serverError) && (
                            <div className="flex flex-wrap gap-3 text-sm">
                                {fileMessage && (
                                    <p className="text-ok">{fileMessage}</p>
                                )}
                                {serverError && (
                                    <p className="text-danger">{serverError}</p>
                                )}
                            </div>
                        )}
                    </div>
                </form>
            </div>
        </>
    );
}
