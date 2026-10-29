import { ODP_SPLITTER_IL, RASIO_IL } from '@/lib/lossTables';
import type {
    BranchPort,
    BranchSplitter,
    ComboNode,
    PathLossResult,
    PowerRxConfig,
    PowerRxStatus,
    StageResult,
    TapChainInput,
    TapChainResult,
} from '@/types/powerRx';

export function formatDb(value: number, digits = 2): string {
    return value.toFixed(digits);
}

export function asNumber(value: number | null | undefined, fallback = 0): number {
    return value === null || value === undefined || Number.isNaN(value) ? fallback : value;
}

export function parseOptionalNumber(raw: string): number | null {
    if (raw.trim() === '') {
        return null;
    }

    const value = Number(raw);

    return Number.isNaN(value) ? null : value;
}

export function newNodeId(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function resolveStatus(
    rxPowerDbm: number,
    thresholds: PowerRxConfig['thresholds'],
): PowerRxStatus {
    if (rxPowerDbm > thresholds.max_rx_dbm) {
        return 'overload';
    }

    if (rxPowerDbm >= thresholds.min_ok_dbm) {
        return 'ok';
    }

    if (rxPowerDbm >= thresholds.sensitivity_dbm) {
        return 'marginal';
    }

    return 'fail';
}

export function statusLabel(status: PowerRxStatus): string {
    switch (status) {
        case 'ok':
            return 'Baik';
        case 'marginal':
            return 'Marjinal';
        case 'overload':
            return 'Overload';
        case 'fail':
            return 'Gagal';
    }
}

export function kindLabel(kind: StageResult['kind']): string {
    switch (kind) {
        case 'rasio':
            return 'Rasio saja';
        case 'splitter':
            return 'Splitter saja';
        case 'rasio_splitter':
            return 'Rasio + Splitter';
    }
}

export function rasioIl(percent: number, table?: Record<string, number>): number {
    if (percent <= 0) {
        return 99.0;
    }

    if (percent >= 100) {
        return 0.0;
    }

    const source = table ?? Object.fromEntries(
        Object.entries(RASIO_IL).map(([k, v]) => [String(k), v]),
    );
    const value = source[String(percent)] ?? RASIO_IL[percent];

    return Number(value ?? 0);
}

export function odpSplitterIl(ratio: number, table?: Record<string, number>): number {
    const source = table ?? Object.fromEntries(
        Object.entries(ODP_SPLITTER_IL).map(([k, v]) => [String(k), v]),
    );
    const value = source[String(ratio)] ?? ODP_SPLITTER_IL[ratio];

    return Number(value ?? 0);
}

export function computePathLoss(
    input: TapChainInput,
    defaults: PowerRxConfig['defaults'],
): PathLossResult {
    const fiberM = asNumber(input.fiberM, defaults.fiber_m);
    const attenuation = asNumber(input.attenuationDbPerKm, defaults.attenuation_db_per_km);
    const connectorCount = asNumber(input.connectorCount, defaults.connector_count);
    const connectorEach = asNumber(input.connectorLossDbEach, defaults.connector_loss_db_each);
    const spliceCount = asNumber(input.spliceCount, defaults.splice_count);
    const spliceEach = asNumber(input.spliceLossDbEach, defaults.splice_loss_db_each);
    const designMarginDb = asNumber(input.designMarginDb, defaults.design_margin_db);

    const fiberDb = (fiberM / 1000) * attenuation;
    const connectorDb = connectorCount * connectorEach;
    const spliceDb = spliceCount * spliceEach;
    const totalDb = fiberDb + connectorDb + spliceDb + designMarginDb;
    const sfp = asNumber(input.sfpPowerDbm, defaults.sfp_power_dbm);

    return {
        fiberDb,
        connectorDb,
        spliceDb,
        designMarginDb,
        totalDb,
        sfpAfterPathDbm: sfp - totalDb,
    };
}

function pushStage(
    stages: StageResult[],
    summary: TapChainResult['summary'],
    stage: StageResult,
): void {
    stages.push(stage);
    summary.enabledCount++;
    summary[stage.status]++;
}

function appendBranchCascade(
    branch: BranchSplitter[],
    startPower: number,
    port: BranchPort,
    parentId: string,
    config: Pick<PowerRxConfig, 'odp_splitter_il' | 'thresholds'>,
    stages: StageResult[],
    summary: TapChainResult['summary'],
): number {
    let power = startPower;

    for (const item of branch) {
        const odpSplitterIlDb = odpSplitterIl(item.odpSplitter, config.odp_splitter_il);
        const hasilRedamanDbm = power - odpSplitterIlDb;
        const status = resolveStatus(hasilRedamanDbm, config.thresholds);

        pushStage(stages, summary, {
            kind: 'splitter',
            name: item.name,
            nodeIds: [item.id],
            inputPowerDbm: power,
            tapPercent: null,
            throughPercent: null,
            tapIlDb: null,
            throughIlDb: null,
            outputTapDbm: null,
            outputThroughDbm: hasilRedamanDbm,
            odpSplitter: item.odpSplitter,
            odpSplitterIlDb,
            hasilRedamanDbm,
            status,
            branch: port,
            parentId,
        });

        power = hasilRedamanDbm;
    }

    return power;
}

function appendCombo(
    node: ComboNode,
    power: number,
    config: Pick<PowerRxConfig, 'rasio_il' | 'odp_splitter_il' | 'thresholds'>,
    stages: StageResult[],
    summary: TapChainResult['summary'],
): number {
    const tapPercent = Math.min(99, Math.max(0, Math.round(asNumber(node.tapPercent, 0))));
    const throughPercent = 100 - tapPercent;
    const tapIlDb = rasioIl(tapPercent, config.rasio_il);
    const throughIlDb = rasioIl(throughPercent, config.rasio_il);
    const odpSplitterIlDb = odpSplitterIl(node.odpSplitter, config.odp_splitter_il);
    const outputTapDbm = power - tapIlDb;
    const outputThroughDbm = power - throughIlDb;
    const hasilRedamanDbm = outputTapDbm - odpSplitterIlDb;
    const status = resolveStatus(hasilRedamanDbm, config.thresholds);

    pushStage(stages, summary, {
        kind: 'rasio_splitter',
        name: node.name,
        nodeIds: [node.id],
        inputPowerDbm: power,
        tapPercent,
        throughPercent,
        tapIlDb,
        throughIlDb,
        outputTapDbm,
        outputThroughDbm,
        odpSplitter: node.odpSplitter,
        odpSplitterIlDb,
        hasilRedamanDbm,
        status,
        branch: null,
        parentId: null,
    });

    appendBranchCascade(
        node.hasilBranch ?? [],
        hasilRedamanDbm,
        'hasil',
        node.id,
        config,
        stages,
        summary,
    );

    return appendBranchCascade(
        node.lanjutBranch ?? [],
        outputThroughDbm,
        'lanjut',
        node.id,
        config,
        stages,
        summary,
    );
}

export function calculateTapChain(
    input: TapChainInput,
    config: Pick<PowerRxConfig, 'rasio_il' | 'odp_splitter_il' | 'thresholds' | 'defaults'>,
): TapChainResult {
    const pathLoss = computePathLoss(input, config.defaults);
    let power = pathLoss.sfpAfterPathDbm;
    const stages: StageResult[] = [];
    const summary = {
        enabledCount: 0,
        ok: 0,
        marginal: 0,
        overload: 0,
        fail: 0,
    };

    const nodes = input.nodes;
    let i = 0;

    while (i < nodes.length) {
        const node = nodes[i];

        if (node.type === 'combo') {
            power = appendCombo(node, power, config, stages, summary);
            i += 1;
        } else if (node.type === 'rasio') {
            const next = nodes[i + 1];
            const tapPercent = Math.min(99, Math.max(0, Math.round(asNumber(node.tapPercent, 0))));
            const throughPercent = 100 - tapPercent;
            const tapIlDb = rasioIl(tapPercent, config.rasio_il);
            const throughIlDb = rasioIl(throughPercent, config.rasio_il);
            const outputTapDbm = power - tapIlDb;
            const outputThroughDbm = power - throughIlDb;

            if (next?.type === 'splitter') {
                const odpSplitterIlDb = odpSplitterIl(next.odpSplitter, config.odp_splitter_il);
                const hasilRedamanDbm = outputTapDbm - odpSplitterIlDb;
                const status = resolveStatus(hasilRedamanDbm, config.thresholds);

                pushStage(stages, summary, {
                    kind: 'rasio_splitter',
                    name: next.name || node.name,
                    nodeIds: [node.id, next.id],
                    inputPowerDbm: power,
                    tapPercent,
                    throughPercent,
                    tapIlDb,
                    throughIlDb,
                    outputTapDbm,
                    outputThroughDbm,
                    odpSplitter: next.odpSplitter,
                    odpSplitterIlDb,
                    hasilRedamanDbm,
                    status,
                    branch: null,
                    parentId: null,
                });

                power = outputThroughDbm;
                i += 2;
            } else {
                const hasilRedamanDbm = outputTapDbm;
                const status = resolveStatus(hasilRedamanDbm, config.thresholds);

                pushStage(stages, summary, {
                    kind: 'rasio',
                    name: node.name,
                    nodeIds: [node.id],
                    inputPowerDbm: power,
                    tapPercent,
                    throughPercent,
                    tapIlDb,
                    throughIlDb,
                    outputTapDbm,
                    outputThroughDbm,
                    odpSplitter: null,
                    odpSplitterIlDb: null,
                    hasilRedamanDbm,
                    status,
                    branch: null,
                    parentId: null,
                });

                power = outputThroughDbm;
                i += 1;
            }
        } else {
            const odpSplitterIlDb = odpSplitterIl(node.odpSplitter, config.odp_splitter_il);
            const hasilRedamanDbm = power - odpSplitterIlDb;
            const status = resolveStatus(hasilRedamanDbm, config.thresholds);

            pushStage(stages, summary, {
                kind: 'splitter',
                name: node.name,
                nodeIds: [node.id],
                inputPowerDbm: power,
                tapPercent: null,
                throughPercent: null,
                tapIlDb: null,
                throughIlDb: null,
                outputTapDbm: null,
                outputThroughDbm: hasilRedamanDbm,
                odpSplitter: node.odpSplitter,
                odpSplitterIlDb,
                hasilRedamanDbm,
                status,
                branch: null,
                parentId: null,
            });

            power = hasilRedamanDbm;
            i += 1;
        }
    }

    return { pathLoss, stages, summary };
}

/** Kanvas kosong: hanya SFP + redaman jalur default, tanpa kartu ODP. */
export function buildInitialTapChain(config: PowerRxConfig): TapChainInput {
    return {
        sfpPowerDbm: config.defaults.sfp_power_dbm,
        fiberM: config.defaults.fiber_m,
        attenuationDbPerKm: config.defaults.attenuation_db_per_km,
        connectorCount: config.defaults.connector_count,
        connectorLossDbEach: config.defaults.connector_loss_db_each,
        spliceCount: config.defaults.splice_count,
        spliceLossDbEach: config.defaults.splice_loss_db_each,
        designMarginDb: config.defaults.design_margin_db,
        nodes: [],
    };
}

/** Hasil per-node untuk highlight kartu di kanvas */
export function stageForNode(
    result: TapChainResult,
    nodeId: string,
): StageResult | undefined {
    return result.stages.find(
        (stage) => stage.nodeIds.includes(nodeId) && stage.branch === null,
    );
}

export function branchStagesFor(
    result: TapChainResult,
    parentId: string,
    port: BranchPort,
): StageResult[] {
    return result.stages.filter(
        (stage) => stage.parentId === parentId && stage.branch === port,
    );
}
