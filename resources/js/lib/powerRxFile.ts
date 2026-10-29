import { newNodeId } from '@/lib/powerRx';
import type {
    BranchSplitter,
    ComboNode,
    FlowNode,
    TapChainInput,
} from '@/types/powerRx';

export const POWER_RX_FILE_VERSION = 1;
export const POWER_RX_FILE_APP = 'power-rx-olt';

export type PowerRxSaveFile = {
    version: number;
    app: string;
    savedAt: string;
    chain: TapChainInput;
};

function asBranchList(raw: unknown): BranchSplitter[] {
    if (!Array.isArray(raw)) {
        return [];
    }

    return raw
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((item, index) => ({
            id: typeof item.id === 'string' ? item.id : newNodeId(`br-${index}`),
            name: typeof item.name === 'string' ? item.name : `Splitter ${index + 1}`,
            odpSplitter: Number(item.odpSplitter ?? item.odp_splitter ?? 8),
        }));
}

function normalizeNode(raw: Record<string, unknown>, index: number): FlowNode | null {
    const type = raw.type;

    if (type === 'rasio') {
        return {
            id: typeof raw.id === 'string' ? raw.id : newNodeId(`rasio-${index}`),
            type: 'rasio',
            name: typeof raw.name === 'string' ? raw.name : `Rasio ${index + 1}`,
            tapPercent:
                raw.tapPercent === null || raw.tapPercent === undefined
                    ? null
                    : Number(raw.tapPercent ?? raw.tap_percent ?? 0),
        };
    }

    if (type === 'splitter') {
        return {
            id: typeof raw.id === 'string' ? raw.id : newNodeId(`splitter-${index}`),
            type: 'splitter',
            name: typeof raw.name === 'string' ? raw.name : `Splitter ${index + 1}`,
            odpSplitter: Number(raw.odpSplitter ?? raw.odp_splitter ?? 8),
        };
    }

    if (type === 'combo') {
        const combo: ComboNode = {
            id: typeof raw.id === 'string' ? raw.id : newNodeId(`combo-${index}`),
            type: 'combo',
            name: typeof raw.name === 'string' ? raw.name : `ODP ${index + 1}`,
            tapPercent:
                raw.tapPercent === null || raw.tapPercent === undefined
                    ? null
                    : Number(raw.tapPercent ?? raw.tap_percent ?? 0),
            odpSplitter: Number(raw.odpSplitter ?? raw.odp_splitter ?? 8),
            hasilBranch: asBranchList(raw.hasilBranch ?? raw.hasil_branch),
            lanjutBranch: asBranchList(raw.lanjutBranch ?? raw.lanjut_branch),
        };

        return combo;
    }

    return null;
}

export function buildSaveFile(chain: TapChainInput): PowerRxSaveFile {
    return {
        version: POWER_RX_FILE_VERSION,
        app: POWER_RX_FILE_APP,
        savedAt: new Date().toISOString(),
        chain,
    };
}

export function parseSaveFile(raw: unknown): TapChainInput {
    if (!raw || typeof raw !== 'object') {
        throw new Error('File tidak valid.');
    }

    const data = raw as Record<string, unknown>;
    const chainRaw = (data.chain ?? data) as Record<string, unknown>;

    if (!chainRaw || typeof chainRaw !== 'object') {
        throw new Error('Isi file tidak berisi data rantai.');
    }

    const nodesRaw = Array.isArray(chainRaw.nodes) ? chainRaw.nodes : [];
    const nodes = nodesRaw
        .map((item, index) =>
            item && typeof item === 'object'
                ? normalizeNode(item as Record<string, unknown>, index)
                : null,
        )
        .filter((node): node is FlowNode => node !== null);

    return {
        sfpPowerDbm:
            chainRaw.sfpPowerDbm === null || chainRaw.sfpPowerDbm === undefined
                ? null
                : Number(chainRaw.sfpPowerDbm ?? chainRaw.sfp_power_dbm ?? 7),
        fiberM:
            chainRaw.fiberM === null || chainRaw.fiberM === undefined
                ? null
                : Number(chainRaw.fiberM ?? chainRaw.fiber_m ?? 0),
        attenuationDbPerKm:
            chainRaw.attenuationDbPerKm === null ||
            chainRaw.attenuationDbPerKm === undefined
                ? null
                : Number(
                      chainRaw.attenuationDbPerKm ??
                          chainRaw.attenuation_db_per_km ??
                          0.35,
                  ),
        connectorCount:
            chainRaw.connectorCount === null || chainRaw.connectorCount === undefined
                ? null
                : Number(chainRaw.connectorCount ?? chainRaw.connector_count ?? 0),
        connectorLossDbEach:
            chainRaw.connectorLossDbEach === null ||
            chainRaw.connectorLossDbEach === undefined
                ? null
                : Number(
                      chainRaw.connectorLossDbEach ??
                          chainRaw.connector_loss_db_each ??
                          0.3,
                  ),
        spliceCount:
            chainRaw.spliceCount === null || chainRaw.spliceCount === undefined
                ? null
                : Number(chainRaw.spliceCount ?? chainRaw.splice_count ?? 0),
        spliceLossDbEach:
            chainRaw.spliceLossDbEach === null ||
            chainRaw.spliceLossDbEach === undefined
                ? null
                : Number(
                      chainRaw.spliceLossDbEach ?? chainRaw.splice_loss_db_each ?? 0.1,
                  ),
        designMarginDb:
            chainRaw.designMarginDb === null || chainRaw.designMarginDb === undefined
                ? null
                : Number(chainRaw.designMarginDb ?? chainRaw.design_margin_db ?? 0),
        nodes,
    };
}

export function downloadSaveFile(chain: TapChainInput, filename?: string): void {
    const payload = buildSaveFile(chain);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const link = document.createElement('a');
    link.href = url;
    link.download = filename ?? `power-rx-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

export async function readSaveFile(file: File): Promise<TapChainInput> {
    const text = await file.text();
    let parsed: unknown;

    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error('File bukan JSON yang valid.');
    }

    return parseSaveFile(parsed);
}
