import {
    DragEvent,
    type ReactNode,
    useRef,
    useState,
} from 'react';
import { ChevronRight, GripVertical, Trash2 } from 'lucide-react';
import IconPng from '@/Components/IconPng';
import {
    asNumber,
    branchStagesFor,
    formatDb,
    kindLabel,
    newNodeId,
    parseOptionalNumber,
    stageForNode,
    statusLabel,
} from '@/lib/powerRx';
import type {
    BranchPort,
    BranchSplitter,
    ComboNode,
    FlowNode,
    PowerRxConfig,
    PowerRxStatus,
    RasioNode,
    SplitterNode,
    StageResult,
    TapChainInput,
    TapChainResult,
} from '@/types/powerRx';

type PaletteType = 'sfp' | 'rasio' | 'splitter' | 'combo';

type ActiveDrag =
    | { kind: 'palette'; type: PaletteType }
    | { kind: 'canvas-node'; index: number };

/** Payload drag andal (MIME kustom dataTransfer sering kosong di beberapa browser). */
let activeDrag: ActiveDrag | null = null;
let branchDropHandled = false;

type Props = {
    config: PowerRxConfig;
    chain: TapChainInput;
    result: TapChainResult;
    onChange: (chain: TapChainInput) => void;
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

export default function FlowBuilder({ config, chain, result, onChange }: Props) {
    const [selectedId, setSelectedId] = useState<string | null>(
        chain.nodes[0]?.id ?? null,
    );
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const canvasRef = useRef<HTMLDivElement>(null);

    const selectedIndex = selectedId
        ? chain.nodes.findIndex((n) => n.id === selectedId)
        : -1;
    const selectedNode = selectedIndex >= 0 ? chain.nodes[selectedIndex] : null;
    const selectedStage = selectedId
        ? stageForNode(result, selectedId)
        : undefined;

    const canAdd = chain.nodes.length < config.max_nodes;

    function updateSfp(value: number | null) {
        onChange({ ...chain, sfpPowerDbm: value });
    }

    function updateNode(id: string, patch: Partial<FlowNode>) {
        onChange({
            ...chain,
            nodes: chain.nodes.map((node) =>
                node.id === id ? ({ ...node, ...patch } as FlowNode) : node,
            ),
        });
    }

    function countByType(type: FlowNode['type']): number {
        return chain.nodes.filter((n) => n.type === type).length;
    }

    function addNode(type: 'rasio' | 'splitter' | 'combo', atIndex?: number) {
        if (!canAdd) {
            return;
        }

        const n = countByType(type) + 1;
        let next: FlowNode;

        if (type === 'rasio') {
            next = {
                id: newNodeId('rasio'),
                type: 'rasio',
                name: `Rasio ${n}`,
                tapPercent: 0,
            };
        } else if (type === 'combo') {
            next = {
                id: newNodeId('combo'),
                type: 'combo',
                name: `ODP ${n}`,
                tapPercent: 0,
                odpSplitter: 8,
                hasilBranch: [],
                lanjutBranch: [],
            };
        } else {
            next = {
                id: newNodeId('splitter'),
                type: 'splitter',
                name: `Splitter ${n}`,
                odpSplitter: 8,
            };
        }

        const nodes = [...chain.nodes];
        const insertAt =
            atIndex === undefined || atIndex < 0 || atIndex > nodes.length
                ? nodes.length
                : atIndex;
        nodes.splice(insertAt, 0, next);
        onChange({ ...chain, nodes });
        setSelectedId(next.id);
    }

    function removeNode(id: string) {
        const index = chain.nodes.findIndex((n) => n.id === id);
        const nodes = chain.nodes.filter((n) => n.id !== id);
        onChange({ ...chain, nodes });

        if (nodes.length === 0) {
            setSelectedId(null);

            return;
        }

        const next = nodes[Math.max(0, index - 1)] ?? nodes[0];
        setSelectedId(next.id);
    }

    function reorderNode(from: number, to: number) {
        if (from === to || from < 0 || to < 0 || to > chain.nodes.length) {
            return;
        }

        const nodes = [...chain.nodes];
        const [item] = nodes.splice(from, 1);
        const target = from < to ? to - 1 : to;
        nodes.splice(target, 0, item);
        onChange({ ...chain, nodes });
        setSelectedId(item.id);
    }

    function normalizeCombo(node: ComboNode): ComboNode {
        return {
            ...node,
            hasilBranch: node.hasilBranch ?? [],
            lanjutBranch: node.lanjutBranch ?? [],
        };
    }

    function addBranchSplitter(
        comboId: string,
        port: BranchPort,
        odpSplitter = 8,
    ) {
        onChange({
            ...chain,
            nodes: chain.nodes.map((node) => {
                if (node.id !== comboId || node.type !== 'combo') {
                    return node;
                }

                const combo = normalizeCombo(node);
                const list =
                    port === 'hasil'
                        ? [...combo.hasilBranch]
                        : [...combo.lanjutBranch];
                const item: BranchSplitter = {
                    id: newNodeId(`br-${port}`),
                    name: port === 'hasil' ? `Cabang HASIL ${list.length + 1}` : `Cabang Lanjut ${list.length + 1}`,
                    odpSplitter,
                };
                list.push(item);

                return port === 'hasil'
                    ? { ...combo, hasilBranch: list }
                    : { ...combo, lanjutBranch: list };
            }),
        });
        setSelectedId(comboId);
    }

    function attachCanvasSplitterToBranch(
        comboId: string,
        port: BranchPort,
        nodeIndex: number,
    ) {
        const source = chain.nodes[nodeIndex];
        if (!source || source.type !== 'splitter') {
            addBranchSplitter(comboId, port);

            return;
        }

        const branchItem: BranchSplitter = {
            id: source.id,
            name: source.name,
            odpSplitter: source.odpSplitter,
        };

        const without = chain.nodes.filter((_, i) => i !== nodeIndex);
        onChange({
            ...chain,
            nodes: without.map((node) => {
                if (node.id !== comboId || node.type !== 'combo') {
                    return node;
                }

                const combo = normalizeCombo(node);
                const list =
                    port === 'hasil'
                        ? [...combo.hasilBranch, branchItem]
                        : [...combo.lanjutBranch, branchItem];

                return port === 'hasil'
                    ? { ...combo, hasilBranch: list }
                    : { ...combo, lanjutBranch: list };
            }),
        });
        setSelectedId(comboId);
    }

    function handleBranchDrop(comboId: string, port: BranchPort) {
        branchDropHandled = true;
        const drag = activeDrag;
        activeDrag = null;

        if (drag?.kind === 'palette' && drag.type === 'splitter') {
            addBranchSplitter(comboId, port);

            return;
        }

        if (drag?.kind === 'canvas-node') {
            attachCanvasSplitterToBranch(comboId, port, drag.index);

            return;
        }

        // Fallback: tetap tambah splitter baru di cabang yang dipilih
        addBranchSplitter(comboId, port);
    }

    function updateBranchSplitter(
        comboId: string,
        port: BranchPort,
        branchId: string,
        patch: Partial<BranchSplitter>,
    ) {
        onChange({
            ...chain,
            nodes: chain.nodes.map((node) => {
                if (node.id !== comboId || node.type !== 'combo') {
                    return node;
                }

                const combo = normalizeCombo(node);
                const key = port === 'hasil' ? 'hasilBranch' : 'lanjutBranch';

                return {
                    ...combo,
                    [key]: combo[key].map((item) =>
                        item.id === branchId ? { ...item, ...patch } : item,
                    ),
                };
            }),
        });
    }

    function removeBranchSplitter(
        comboId: string,
        port: BranchPort,
        branchId: string,
    ) {
        onChange({
            ...chain,
            nodes: chain.nodes.map((node) => {
                if (node.id !== comboId || node.type !== 'combo') {
                    return node;
                }

                const combo = normalizeCombo(node);
                const key = port === 'hasil' ? 'hasilBranch' : 'lanjutBranch';

                return {
                    ...combo,
                    [key]: combo[key].filter((item) => item.id !== branchId),
                };
            }),
        });
    }

    function onPaletteDragStart(event: DragEvent, type: PaletteType) {
        activeDrag = { kind: 'palette', type };
        branchDropHandled = false;
        event.dataTransfer.setData('text/plain', `palette:${type}`);
        event.dataTransfer.setData('application/x-palette', type);
        event.dataTransfer.effectAllowed = 'copy';
    }

    function onNodeDragStart(event: DragEvent, index: number) {
        activeDrag = { kind: 'canvas-node', index };
        branchDropHandled = false;
        event.dataTransfer.setData('text/plain', `node:${index}`);
        event.dataTransfer.setData('application/x-node-index', String(index));
        event.dataTransfer.effectAllowed = 'move';
    }

    function clearDrag() {
        activeDrag = null;
        branchDropHandled = false;
    }

    function onCanvasDragOver(event: DragEvent) {
        event.preventDefault();
        event.dataTransfer.dropEffect =
            activeDrag?.kind === 'canvas-node' ? 'move' : 'copy';
    }

    function applyDrop(atIndex: number) {
        const drag = activeDrag;
        activeDrag = null;

        if (!drag) {
            return;
        }

        if (drag.kind === 'palette') {
            if (drag.type === 'sfp') {
                setSelectedId(null);

                return;
            }

            addNode(drag.type, atIndex);

            return;
        }

        reorderNode(drag.index, atIndex);
    }

    function onCanvasDrop(event: DragEvent) {
        event.preventDefault();
        setDragOverIndex(null);

        if (branchDropHandled) {
            branchDropHandled = false;
            activeDrag = null;

            return;
        }

        applyDrop(chain.nodes.length);
    }

    function onSlotDragOver(event: DragEvent, index: number) {
        event.preventDefault();
        event.stopPropagation();
        setDragOverIndex(index);
    }

    function onSlotDrop(event: DragEvent, index: number) {
        event.preventDefault();
        event.stopPropagation();
        setDragOverIndex(null);

        if (branchDropHandled) {
            branchDropHandled = false;
            activeDrag = null;

            return;
        }

        applyDrop(index);
    }

    return (
        <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_280px]">
            <aside className="rounded-2xl border border-line bg-white/80 p-4 shadow-sm">
                <p className="mb-3 text-xs font-semibold tracking-wide text-ink uppercase">
                    Komponen
                </p>
                <p className="mb-3 text-xs text-ink-soft">
                    Seret ke kanvas. Pakai kartu gabungan (rasio + 1:N), atau komponen
                    terpisah.
                </p>
                <div className="space-y-2">
                    <PaletteItem
                        icon={<IconPng name="sfp" size={36} alt="SFP" />}
                        title="SFP"
                        subtitle="Sumber daya TX"
                        color="bg-signal/15"
                        onDragStart={(e) => onPaletteDragStart(e, 'sfp')}
                    />
                    <PaletteItem
                        icon={<IconPng name="odp" size={36} alt="Combo" />}
                        title="Rasio + 1:N"
                        subtitle="Satu kartu gabungan"
                        color="bg-violet-100"
                        disabled={!canAdd}
                        onDragStart={(e) => onPaletteDragStart(e, 'combo')}
                    />
                    <PaletteItem
                        icon={<IconPng name="rasio" size={36} alt="Rasio" />}
                        title="Splitter rasio"
                        subtitle="Tap % / lanjut %"
                        color="bg-sky-100"
                        disabled={!canAdd}
                        onDragStart={(e) => onPaletteDragStart(e, 'rasio')}
                    />
                    <PaletteItem
                        icon={<IconPng name="splitter" size={36} alt="Splitter" />}
                        title="Splitter 1:N"
                        subtitle="Pasif ODP"
                        color="bg-emerald-100"
                        disabled={!canAdd}
                        onDragStart={(e) => onPaletteDragStart(e, 'splitter')}
                    />
                </div>
                {!canAdd && (
                    <p className="mt-2 text-[11px] text-ink-soft">
                        Maksimal {config.max_nodes} kartu.
                    </p>
                )}
            </aside>

            <section
                ref={canvasRef}
                onDragOver={onCanvasDragOver}
                onDrop={onCanvasDrop}
                className="relative min-h-[420px] overflow-x-auto rounded-2xl border border-dashed border-line bg-[radial-gradient(circle_at_1px_1px,#c5d2cb_1px,transparent_0)] bg-[length:18px_18px] bg-paper/40 p-5"
            >
                <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                        <p className="text-sm font-semibold text-ink">Kanvas jalur optik</p>
                        <p className="text-xs text-ink-soft">
                            Seret/tambah Splitter 1:N ke zona HASIL di kartu gabungan
                        </p>
                    </div>
                </div>

                <div className="relative flex min-w-max items-center gap-0 px-2 py-6">
                    <div className="relative z-10 flex flex-col items-center">
                        <button
                            type="button"
                            onClick={() => setSelectedId(null)}
                            className={`w-36 rounded-2xl border-2 bg-white p-3 text-left shadow-md transition ${
                                selectedId === null
                                    ? 'border-signal ring-2 ring-signal/30'
                                    : 'border-line hover:border-signal/50'
                            }`}
                        >
                            <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-signal/15">
                                <IconPng name="sfp" size={32} alt="SFP" />
                            </div>
                            <p className="text-[10px] font-semibold tracking-wide text-ink-soft uppercase">
                                SFP
                            </p>
                            <p className="font-mono text-lg font-semibold text-ink">
                                {formatDb(asNumber(chain.sfpPowerDbm, 7))} dBm
                            </p>
                        </button>
                        <p className="mt-2 text-center text-[10px] text-ink-soft">
                            Sumber
                            {result.pathLoss.totalDb > 0 && (
                                <>
                                    <br />
                                    −{formatDb(result.pathLoss.totalDb)} dB jalur
                                </>
                            )}
                        </p>
                    </div>

                    {chain.nodes.length > 0 && (
                        <AutoPath
                            label={
                                result.pathLoss.totalDb > 0
                                    ? `${formatDb(result.pathLoss.sfpAfterPathDbm)} dBm`
                                    : 'feeder'
                            }
                            tone="signal"
                        />
                    )}

                    <DropSlot
                        active={dragOverIndex === 0}
                        onDragOver={(e) => onSlotDragOver(e, 0)}
                        onDrop={(e) => onSlotDrop(e, 0)}
                    />

                    {chain.nodes.map((node, index) => {
                        const stage = stageForNode(result, node.id);
                        const nextNode = chain.nodes[index + 1];
                        const prevNode = chain.nodes[index - 1];
                        const paired =
                            node.type === 'rasio' && nextNode?.type === 'splitter';
                        const isTapChild =
                            node.type === 'splitter' && prevNode?.type === 'rasio';

                        return (
                            <div
                                key={node.id}
                                className="relative z-10 flex items-center"
                            >
                                {node.type === 'combo' ? (
                                    <ComboCard
                                        node={normalizeCombo(node)}
                                        stage={stage}
                                        result={result}
                                        config={config}
                                        selected={selectedId === node.id}
                                        onSelect={() => setSelectedId(node.id)}
                                        onRemove={() => removeNode(node.id)}
                                        onDropBranch={(port) =>
                                            handleBranchDrop(node.id, port)
                                        }
                                        onAddBranch={(port) =>
                                            addBranchSplitter(node.id, port)
                                        }
                                        onUpdateBranch={(port, id, patch) =>
                                            updateBranchSplitter(
                                                node.id,
                                                port,
                                                id,
                                                patch,
                                            )
                                        }
                                        onRemoveBranch={(port, id) =>
                                            removeBranchSplitter(
                                                node.id,
                                                port,
                                                id,
                                            )
                                        }
                                        dragHandleProps={{
                                            draggable: true,
                                            onDragStart: (e) =>
                                                onNodeDragStart(e, index),
                                            onDragEnd: () => {
                                                setDragOverIndex(null);
                                                clearDrag();
                                            },
                                        }}
                                    />
                                ) : (
                                    <div
                                        draggable
                                        onDragStart={(e) =>
                                            onNodeDragStart(e, index)
                                        }
                                        onDragEnd={() => {
                                            setDragOverIndex(null);
                                            clearDrag();
                                        }}
                                    >
                                        {node.type === 'rasio' ? (
                                            <RasioCard
                                                node={node}
                                                stage={stage}
                                                selected={selectedId === node.id}
                                                paired={paired}
                                                onSelect={() =>
                                                    setSelectedId(node.id)
                                                }
                                                onRemove={() =>
                                                    removeNode(node.id)
                                                }
                                            />
                                        ) : (
                                            <SplitterCard
                                                node={node}
                                                stage={stage}
                                                selected={
                                                    selectedId === node.id
                                                }
                                                fromTap={isTapChild}
                                                onSelect={() =>
                                                    setSelectedId(node.id)
                                                }
                                                onRemove={() =>
                                                    removeNode(node.id)
                                                }
                                            />
                                        )}
                                    </div>
                                )}
                                <DropSlot
                                    active={dragOverIndex === index + 1}
                                    onDragOver={(e) => onSlotDragOver(e, index + 1)}
                                    onDrop={(e) => onSlotDrop(e, index + 1)}
                                />
                                {index < chain.nodes.length - 1 && (
                                    <AutoPath
                                        label={pathLabel(
                                            node,
                                            stage,
                                            paired,
                                            node.type === 'combo'
                                                ? branchStagesFor(
                                                      result,
                                                      node.id,
                                                      'lanjut',
                                                  )
                                                : [],
                                        )}
                                        tone={paired ? 'tap' : 'thru'}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>

                {chain.nodes.length === 0 && (
                    <div className="flex h-40 items-center justify-center text-sm text-ink-soft">
                        Seret komponen dari panel kiri ke sini.
                    </div>
                )}
            </section>

            <aside className="rounded-2xl border border-line bg-white/80 p-4 shadow-sm">
                <p className="mb-3 text-xs font-semibold tracking-wide text-ink uppercase">
                    Pengaturan
                </p>

                {selectedNode === null ? (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-signal-deep">
                            <IconPng name="sfp" size={22} alt="SFP" />
                            <span className="text-sm font-semibold">SFP</span>
                        </div>
                        <label className="block text-sm font-medium text-ink">
                            Daya TX (dBm)
                        </label>
                        <input
                            type="number"
                            step={1}
                            value={chain.sfpPowerDbm ?? ''}
                            onChange={(e) =>
                                updateSfp(parseOptionalNumber(e.target.value))
                            }
                            className="w-full rounded-md border border-line bg-white px-3 py-2 font-mono outline-none focus:border-signal focus:ring-2 focus:ring-signal/20"
                        />
                        <p className="text-xs text-ink-soft">
                            Seret kartu gabungan (rasio + 1:N) atau komponen terpisah ke
                            kanvas.
                        </p>
                    </div>
                ) : selectedNode.type === 'combo' ? (
                    <ComboInspector
                        node={selectedNode}
                        stage={selectedStage}
                        config={config}
                        onChange={(patch) => updateNode(selectedNode.id, patch)}
                    />
                ) : selectedNode.type === 'rasio' ? (
                    <RasioInspector
                        node={selectedNode}
                        stage={selectedStage}
                        onChange={(patch) => updateNode(selectedNode.id, patch)}
                    />
                ) : (
                    <SplitterInspector
                        node={selectedNode}
                        stage={selectedStage}
                        config={config}
                        onChange={(patch) => updateNode(selectedNode.id, patch)}
                    />
                )}
            </aside>
        </div>
    );
}

function pathLabel(
    node: FlowNode,
    stage: StageResult | undefined,
    paired: boolean,
    lanjutBranchStages: StageResult[] = [],
): string {
    if (node.type === 'rasio' && paired) {
        return 'tap';
    }

    if (node.type === 'combo' && stage) {
        const end =
            lanjutBranchStages.length > 0
                ? lanjutBranchStages[lanjutBranchStages.length - 1].hasilRedamanDbm
                : stage.outputThroughDbm;

        if (end != null) {
            return `lanjut ${formatDb(end)}`;
        }
    }

    if (node.type === 'rasio' && stage?.outputThroughDbm != null) {
        return `lanjut ${formatDb(stage.outputThroughDbm)}`;
    }

    if (
        node.type === 'splitter' &&
        stage?.kind === 'rasio_splitter' &&
        stage.outputThroughDbm != null
    ) {
        return `lanjut ${formatDb(stage.outputThroughDbm)}`;
    }

    if (node.type === 'splitter' && stage) {
        return formatDb(stage.hasilRedamanDbm);
    }

    return '→';
}

function PaletteItem({
    icon,
    title,
    subtitle,
    color,
    disabled = false,
    onDragStart,
}: {
    icon: ReactNode;
    title: string;
    subtitle: string;
    color: string;
    disabled?: boolean;
    onDragStart: (event: DragEvent) => void;
}) {
    return (
        <div
            draggable={!disabled}
            onDragStart={onDragStart}
            onDragEnd={() => {
                // Jangan hapus jika drop cabang baru saja menandai handled
                if (!branchDropHandled) {
                    activeDrag = null;
                }
            }}
            className={`flex cursor-grab items-center gap-3 rounded-xl border border-line bg-white p-2.5 active:cursor-grabbing ${
                disabled ? 'cursor-not-allowed opacity-40' : 'hover:border-signal/40'
            }`}
        >
            <div className={`flex size-10 items-center justify-center rounded-lg ${color}`}>
                {icon}
            </div>
            <div>
                <p className="text-sm font-semibold text-ink">{title}</p>
                <p className="text-[11px] text-ink-soft">{subtitle}</p>
            </div>
        </div>
    );
}

function DropSlot({
    active,
    onDragOver,
    onDrop,
}: {
    active: boolean;
    onDragOver: (event: DragEvent) => void;
    onDrop: (event: DragEvent) => void;
}) {
    return (
        <div
            onDragOver={onDragOver}
            onDrop={onDrop}
            className={`mx-1 h-28 w-3 shrink-0 rounded-full transition ${
                active ? 'bg-signal/40 ring-2 ring-signal' : 'bg-transparent'
            }`}
        />
    );
}

function AutoPath({
    label,
    tone,
}: {
    label: string;
    tone: 'signal' | 'thru' | 'tap' | 'hasil';
}) {
    const line =
        tone === 'signal'
            ? 'bg-signal h-1.5 rounded-full'
            : tone === 'thru'
              ? 'border-t-2 border-dashed border-red-600'
              : tone === 'hasil'
                ? 'border-t-2 border-dashed border-emerald-600'
                : 'border-t-2 border-dashed border-sky-500';
    const text =
        tone === 'signal'
            ? 'text-signal-deep'
            : tone === 'thru'
              ? 'text-red-700'
              : tone === 'hasil'
                ? 'text-emerald-700'
                : 'text-sky-700';
    const arrow =
        tone === 'signal'
            ? 'text-signal'
            : tone === 'thru'
              ? 'text-red-600'
              : tone === 'hasil'
                ? 'text-emerald-600'
                : 'text-sky-600';

    return (
        <div className="mx-1 flex w-[4.5rem] shrink-0 flex-col items-center justify-center">
            <div className="flex w-full items-center">
                <div className={`min-w-0 flex-1 ${line}`} />
                <ChevronRight className={`-ml-1 size-4 shrink-0 ${arrow}`} />
            </div>
            <p className={`mt-1 max-w-[4.5rem] truncate text-center text-[9px] font-medium ${text}`}>
                {label}
            </p>
        </div>
    );
}

function ComboCard({
    node,
    stage,
    result,
    config,
    selected,
    onSelect,
    onRemove,
    onDropBranch,
    onAddBranch,
    onUpdateBranch,
    onRemoveBranch,
    dragHandleProps,
}: {
    node: ComboNode;
    stage?: StageResult;
    result: TapChainResult;
    config: PowerRxConfig;
    selected: boolean;
    onSelect: () => void;
    onRemove: () => void;
    onDropBranch: (port: BranchPort) => void;
    onAddBranch: (port: BranchPort) => void;
    onUpdateBranch: (
        port: BranchPort,
        id: string,
        patch: Partial<BranchSplitter>,
    ) => void;
    onRemoveBranch: (port: BranchPort, id: string) => void;
    dragHandleProps: {
        draggable: boolean;
        onDragStart: (event: DragEvent) => void;
        onDragEnd: () => void;
    };
}) {
    const hasilStages = branchStagesFor(result, node.id, 'hasil');
    const hasilEnd =
        hasilStages.length > 0
            ? hasilStages[hasilStages.length - 1].hasilRedamanDbm
            : stage?.hasilRedamanDbm;

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onSelect}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    onSelect();
                }
            }}
            className={`w-[240px] rounded-2xl border-2 bg-white p-3 shadow-md transition ${
                selected
                    ? 'border-violet-500 ring-2 ring-violet-200'
                    : 'border-line hover:border-violet-300'
            }`}
        >
            <CardChrome onRemove={onRemove} dragHandleProps={dragHandleProps} />
            <div className="mb-2 flex items-center gap-2">
                <div className="flex size-9 items-center justify-center rounded-lg bg-violet-100">
                    <IconPng name="odp" size={28} alt="ODP" />
                </div>
                <div>
                    <p className="text-sm font-semibold text-ink">{node.name}</p>
                    <p className="text-[10px] text-violet-800">Rasio + 1:N</p>
                </div>
            </div>
            <div className="space-y-1.5">
                <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1.5">
                    <IconPng name="rasio" size={16} alt="Rasio" />
                    <p className="font-mono text-xs font-semibold text-sky-950">
                        {asNumber(node.tapPercent, 0)}/{100 - asNumber(node.tapPercent, 0)}%
                    </p>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-line bg-paper px-2 py-1.5">
                    <IconPng name="splitter" size={16} alt="Splitter" />
                    <p className="font-mono text-xs font-semibold">1:{node.odpSplitter}</p>
                </div>
            </div>

            {stage && (
                <BranchDropZone
                    port="hasil"
                    title="HASIL"
                    baseDbm={stage.hasilRedamanDbm}
                    endDbm={hasilEnd}
                    baseStatus={stage.status}
                    items={node.hasilBranch}
                    stages={hasilStages}
                    config={config}
                    onDropSplitter={() => onDropBranch('hasil')}
                    onAddClick={() => onAddBranch('hasil')}
                    onUpdate={(id, patch) => onUpdateBranch('hasil', id, patch)}
                    onRemove={(id) => onRemoveBranch('hasil', id)}
                />
            )}

            {stage?.outputThroughDbm != null && (
                <p className="mt-2 text-center font-mono text-[10px] text-red-700">
                    Lanjut {formatDb(stage.outputThroughDbm)} dBm →
                </p>
            )}
        </div>
    );
}

function BranchDropZone({
    port,
    title,
    baseDbm,
    endDbm,
    baseStatus,
    items,
    stages,
    config,
    onDropSplitter,
    onAddClick,
    onUpdate,
    onRemove,
}: {
    port: BranchPort;
    title: string;
    baseDbm: number;
    endDbm?: number;
    baseStatus?: PowerRxStatus;
    items: BranchSplitter[];
    stages: StageResult[];
    config: PowerRxConfig;
    onDropSplitter: () => void;
    onAddClick: () => void;
    onUpdate: (id: string, patch: Partial<BranchSplitter>) => void;
    onRemove: (id: string) => void;
}) {
    const [over, setOver] = useState(false);
    const isHasil = port === 'hasil';

    function handleDragOver(event: DragEvent) {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
        setOver(true);
    }

    function handleDrop(event: DragEvent) {
        event.preventDefault();
        event.stopPropagation();
        setOver(false);
        onDropSplitter();
    }

    return (
        <div
            onDragOver={handleDragOver}
            onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOver(true);
            }}
            onDragLeave={(e) => {
                e.stopPropagation();
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setOver(false);
                }
            }}
            onDrop={handleDrop}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className={`mt-2 rounded-lg border-2 border-dashed p-2 transition ${
                over
                    ? 'border-signal bg-signal/15 ring-2 ring-signal/30'
                    : isHasil
                      ? 'border-white/30 bg-ink text-white'
                      : 'border-red-400 bg-red-50'
            }`}
        >
            <div className="flex items-center justify-between gap-2">
                <p
                    className={`text-[10px] font-semibold uppercase ${
                        isHasil ? 'text-white/60' : 'text-red-700'
                    }`}
                >
                    {title}
                </p>
                <p
                    className={`font-mono text-sm font-semibold ${
                        isHasil ? 'text-white' : 'text-red-700'
                    }`}
                >
                    {formatDb(baseDbm)} dBm
                </p>
            </div>
            {isHasil && baseStatus && items.length === 0 && (
                <span
                    className={`mt-1 inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${statusClasses(baseStatus)}`}
                >
                    {statusLabel(baseStatus)}
                </span>
            )}

            <div className="mt-2 space-y-1.5">
                {items.map((item, index) => {
                    const st = stages[index];

                    return (
                        <div
                            key={item.id}
                            className={`rounded-md border px-2 py-1.5 ${
                                isHasil
                                    ? 'border-white/20 bg-white/10'
                                    : 'border-red-200 bg-white'
                            }`}
                        >
                            <div className="mb-1 flex items-center gap-1 text-[10px] uppercase opacity-70">
                                <IconPng name="splitter" size={14} alt="1:N" />
                                Splitter 1:N
                            </div>
                            <div className="flex items-center gap-1">
                                <select
                                    value={item.odpSplitter}
                                    onChange={(e) =>
                                        onUpdate(item.id, {
                                            odpSplitter: Number(e.target.value),
                                        })
                                    }
                                    className={`min-w-0 flex-1 rounded border px-1 py-0.5 font-mono text-[11px] ${
                                        isHasil
                                            ? 'border-white/30 bg-ink text-white'
                                            : 'border-line bg-white text-ink'
                                    }`}
                                >
                                    {config.allowed_odp_splitters.map((ratio) => (
                                        <option key={ratio} value={ratio}>
                                            1:{ratio}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    onClick={() => onRemove(item.id)}
                                    className={`rounded p-0.5 ${
                                        isHasil
                                            ? 'text-white/70 hover:bg-white/10'
                                            : 'text-danger hover:bg-danger/10'
                                    }`}
                                    aria-label="Hapus splitter cabang"
                                >
                                    <Trash2 className="size-3" />
                                </button>
                            </div>
                            {st && (
                                <p
                                    className={`mt-1 font-mono text-[11px] font-semibold ${
                                        isHasil ? 'text-emerald-200' : 'text-emerald-800'
                                    }`}
                                >
                                    Out {formatDb(st.inputPowerDbm)} →{' '}
                                    {formatDb(st.hasilRedamanDbm)} dBm (
                                    {statusLabel(st.status)})
                                </p>
                            )}
                        </div>
                    );
                })}
            </div>

            {items.length > 0 && endDbm != null && (
                <p
                    className={`mt-1.5 font-mono text-[10px] ${
                        isHasil ? 'text-white/70' : 'text-red-700'
                    }`}
                >
                    Ujung {title}: {formatDb(endDbm)} dBm
                </p>
            )}

            <button
                type="button"
                onClick={onAddClick}
                className={`mt-2 flex w-full items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium ${
                    isHasil
                        ? 'bg-white/15 text-white hover:bg-white/25'
                        : 'bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-100'
                }`}
            >
                + Splitter 1:N di {title}
            </button>

            <p
                className={`mt-1 text-center text-[9px] ${
                    isHasil ? 'text-white/45' : 'text-red-600/70'
                }`}
            >
                {over
                    ? 'Lepas di sini — masuk cabang ini'
                    : 'Atau seret Splitter 1:N ke zona ini'}
            </p>
        </div>
    );
}

function RasioCard({
    node,
    stage,
    selected,
    paired,
    onSelect,
    onRemove,
}: {
    node: RasioNode;
    stage?: StageResult;
    selected: boolean;
    paired: boolean;
    onSelect: () => void;
    onRemove: () => void;
}) {
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onSelect}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    onSelect();
                }
            }}
            className={`w-[180px] rounded-2xl border-2 bg-white p-3 shadow-md transition ${
                selected
                    ? 'border-sky-500 ring-2 ring-sky-200'
                    : 'border-line hover:border-sky-300'
            }`}
        >
            <CardChrome onRemove={onRemove} />
            <div className="mb-2 flex items-center gap-2">
                <div className="flex size-9 items-center justify-center rounded-lg bg-sky-100">
                    <IconPng name="rasio" size={28} alt="Rasio" />
                </div>
                <div>
                    <p className="text-sm font-semibold text-ink">{node.name}</p>
                    <p className="text-[10px] text-sky-800">
                        {paired ? '→ ke splitter' : 'Tanpa 1:N'}
                    </p>
                </div>
            </div>
            <p className="font-mono text-sm font-semibold text-sky-950">
                {asNumber(node.tapPercent, 0)}/{100 - asNumber(node.tapPercent, 0)}%
            </p>
            {stage && (
                <p className="mt-2 font-mono text-[10px] text-red-700">
                    Lanjut {formatDb(stage.outputThroughDbm ?? 0)} dBm
                </p>
            )}
        </div>
    );
}

function SplitterCard({
    node,
    stage,
    selected,
    fromTap,
    onSelect,
    onRemove,
}: {
    node: SplitterNode;
    stage?: StageResult;
    selected: boolean;
    fromTap: boolean;
    onSelect: () => void;
    onRemove: () => void;
}) {
    const sourceLabel = fromTap ? 'Dari tap rasio' : 'Standalone';

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onSelect}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    onSelect();
                }
            }}
            className={`w-[180px] rounded-2xl border-2 bg-white p-3 shadow-md transition ${
                selected
                    ? 'border-emerald-500 ring-2 ring-emerald-200'
                    : 'border-line hover:border-emerald-300'
            }`}
        >
            <CardChrome onRemove={onRemove} />
            <div className="mb-2 flex items-center gap-2">
                <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-100">
                    <IconPng name="splitter" size={28} alt="Splitter" />
                </div>
                <div>
                    <p className="text-sm font-semibold text-ink">{node.name}</p>
                    <p className="text-[10px] text-emerald-800">{sourceLabel}</p>
                </div>
            </div>
            <p className="font-mono text-sm font-semibold text-ink">1:{node.odpSplitter}</p>
            {stage && (
                <div className="mt-2 rounded-lg bg-ink px-2 py-1.5 text-white">
                    <p className="text-[10px] text-white/60 uppercase">Hasil</p>
                    <p className="font-mono text-base font-semibold">
                        {formatDb(stage.hasilRedamanDbm)}
                    </p>
                    <span
                        className={`mt-1 inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${statusClasses(stage.status)}`}
                    >
                        {statusLabel(stage.status)}
                    </span>
                </div>
            )}
        </div>
    );
}

function CardChrome({
    onRemove,
    dragHandleProps,
}: {
    onRemove: () => void;
    dragHandleProps?: {
        draggable: boolean;
        onDragStart: (event: DragEvent) => void;
        onDragEnd: () => void;
    };
}) {
    return (
        <div className="mb-2 flex items-center justify-between gap-2">
            <div
                className="flex cursor-grab items-center gap-1 text-ink-soft active:cursor-grabbing"
                {...dragHandleProps}
            >
                <GripVertical className="size-4" />
                <span className="text-[10px] font-semibold tracking-wide uppercase">
                    Seret
                </span>
            </div>
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                }}
                className="rounded p-1 text-danger hover:bg-danger/10"
                aria-label="Hapus"
            >
                <Trash2 className="size-3.5" />
            </button>
        </div>
    );
}

function ComboInspector({
    node,
    stage,
    config,
    onChange,
}: {
    node: ComboNode;
    stage?: StageResult;
    config: PowerRxConfig;
    onChange: (patch: Partial<ComboNode>) => void;
}) {
    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 text-violet-800">
                <IconPng name="odp" size={22} alt="ODP" />
                <span className="text-sm font-semibold">{node.name}</span>
            </div>
            <label className="block text-sm font-medium text-ink">Nama</label>
            <input
                type="text"
                value={node.name}
                onChange={(e) => onChange({ name: e.target.value })}
                className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-signal focus:ring-2 focus:ring-signal/20"
            />
            <label className="block text-sm font-medium text-ink">Tap %</label>
            <input
                type="number"
                step={1}
                min={0}
                max={99}
                value={node.tapPercent ?? ''}
                onChange={(e) =>
                    onChange({ tapPercent: parseOptionalNumber(e.target.value) })
                }
                className="w-full rounded-md border border-sky-200 bg-white px-3 py-2 font-mono outline-none focus:border-signal"
            />
            <p className="text-[11px] text-sky-900/70">
                Lanjut otomatis: {100 - asNumber(node.tapPercent, 0)}%
            </p>
            <label className="block text-sm font-medium text-ink">Splitter 1:N</label>
            <select
                value={node.odpSplitter}
                onChange={(e) => onChange({ odpSplitter: Number(e.target.value) })}
                className="w-full rounded-md border border-line bg-white px-3 py-2 font-mono outline-none focus:border-signal"
            >
                {config.allowed_odp_splitters.map((ratio) => (
                    <option key={ratio} value={ratio}>
                        1:{ratio}
                    </option>
                ))}
            </select>
            {stage && <ResultBox stage={stage} />}
        </div>
    );
}

function RasioInspector({
    node,
    stage,
    onChange,
}: {
    node: RasioNode;
    stage?: StageResult;
    onChange: (patch: Partial<RasioNode>) => void;
}) {
    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 text-sky-800">
                <IconPng name="rasio" size={22} alt="Rasio" />
                <span className="text-sm font-semibold">{node.name}</span>
            </div>
            <label className="block text-sm font-medium text-ink">Nama</label>
            <input
                type="text"
                value={node.name}
                onChange={(e) => onChange({ name: e.target.value })}
                className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-signal focus:ring-2 focus:ring-signal/20"
            />
            <label className="block text-sm font-medium text-ink">Tap %</label>
            <input
                type="number"
                step={1}
                min={0}
                max={99}
                value={node.tapPercent ?? ''}
                onChange={(e) =>
                    onChange({ tapPercent: parseOptionalNumber(e.target.value) })
                }
                className="w-full rounded-md border border-sky-200 bg-white px-3 py-2 font-mono outline-none focus:border-signal"
            />
            <p className="text-[11px] text-sky-900/70">
                Lanjut otomatis: {100 - asNumber(node.tapPercent, 0)}%
            </p>
            {stage && (
                <ResultBox stage={stage} />
            )}
        </div>
    );
}

function SplitterInspector({
    node,
    stage,
    config,
    onChange,
}: {
    node: SplitterNode;
    stage?: StageResult;
    config: PowerRxConfig;
    onChange: (patch: Partial<SplitterNode>) => void;
}) {
    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 text-emerald-800">
                <IconPng name="splitter" size={22} alt="Splitter" />
                <span className="text-sm font-semibold">{node.name}</span>
            </div>
            <label className="block text-sm font-medium text-ink">Nama</label>
            <input
                type="text"
                value={node.name}
                onChange={(e) => onChange({ name: e.target.value })}
                className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-signal focus:ring-2 focus:ring-signal/20"
            />
            <label className="block text-sm font-medium text-ink">Rasio 1:N</label>
            <select
                value={node.odpSplitter}
                onChange={(e) => onChange({ odpSplitter: Number(e.target.value) })}
                className="w-full rounded-md border border-line bg-white px-3 py-2 font-mono outline-none focus:border-signal"
            >
                {config.allowed_odp_splitters.map((ratio) => (
                    <option key={ratio} value={ratio}>
                        1:{ratio}
                    </option>
                ))}
            </select>
            {stage && <ResultBox stage={stage} />}
        </div>
    );
}

function ResultBox({ stage }: { stage: StageResult }) {
    return (
        <div className="rounded-xl border border-line bg-ink p-3 text-white">
            <div className="mb-1 flex items-center gap-2 text-white/70">
                <IconPng name="hasil" size={18} alt="Hasil" />
                <span className="text-xs uppercase">Hasil Redaman</span>
            </div>
            <p className="text-[11px] text-white/55">{kindLabel(stage.kind)}</p>
            <p className="font-mono text-2xl font-semibold">
                {formatDb(stage.hasilRedamanDbm)} dBm
            </p>
            <span
                className={`mt-2 inline-flex rounded px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusClasses(stage.status)}`}
            >
                {statusLabel(stage.status)}
            </span>
            <dl className="mt-3 space-y-1 text-[11px] text-white/65">
                <div className="flex justify-between">
                    <dt>Input</dt>
                    <dd className="font-mono">{formatDb(stage.inputPowerDbm)} dBm</dd>
                </div>
                {stage.outputTapDbm != null && (
                    <div className="flex justify-between">
                        <dt>Output tap</dt>
                        <dd className="font-mono">{formatDb(stage.outputTapDbm)} dBm</dd>
                    </div>
                )}
                {stage.outputThroughDbm != null && stage.kind !== 'splitter' && (
                    <div className="flex justify-between">
                        <dt>Daya lanjut</dt>
                        <dd className="font-mono">
                            {formatDb(stage.outputThroughDbm)} dBm
                        </dd>
                    </div>
                )}
            </dl>
        </div>
    );
}
