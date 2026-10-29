export type PowerRxStatus = 'ok' | 'marginal' | 'overload' | 'fail';

export type FlowNodeType = 'rasio' | 'splitter' | 'combo';

export type RasioNode = {
    id: string;
    type: 'rasio';
    name: string;
    tapPercent: number | null;
};

export type SplitterNode = {
    id: string;
    type: 'splitter';
    name: string;
    odpSplitter: number;
};

export type ComboNode = {
    id: string;
    type: 'combo';
    name: string;
    tapPercent: number | null;
    odpSplitter: number;
};

export type FlowNode = RasioNode | SplitterNode | ComboNode;

export type PathLossInput = {
    fiberM: number | null;
    attenuationDbPerKm: number | null;
    connectorCount: number | null;
    connectorLossDbEach: number | null;
    spliceCount: number | null;
    spliceLossDbEach: number | null;
    designMarginDb: number | null;
};

export type TapChainInput = PathLossInput & {
    sfpPowerDbm: number | null;
    nodes: FlowNode[];
};

export type PathLossResult = {
    fiberDb: number;
    connectorDb: number;
    spliceDb: number;
    designMarginDb: number;
    totalDb: number;
    sfpAfterPathDbm: number;
};

export type StageKind = 'rasio' | 'splitter' | 'rasio_splitter';

export type StageResult = {
    kind: StageKind;
    name: string;
    nodeIds: string[];
    inputPowerDbm: number;
    tapPercent: number | null;
    throughPercent: number | null;
    tapIlDb: number | null;
    throughIlDb: number | null;
    outputTapDbm: number | null;
    outputThroughDbm: number | null;
    odpSplitter: number | null;
    odpSplitterIlDb: number | null;
    hasilRedamanDbm: number;
    status: PowerRxStatus;
};

export type TapChainResult = {
    pathLoss: PathLossResult;
    stages: StageResult[];
    summary: {
        enabledCount: number;
        ok: number;
        marginal: number;
        overload: number;
        fail: number;
    };
};

export type PowerRxConfig = {
    rasio_il: Record<string, number>;
    odp_splitter_il: Record<string, number>;
    allowed_odp_splitters: number[];
    odp_count: number;
    max_nodes: number;
    defaults: {
        sfp_power_dbm: number;
        tap_percents: number[];
        odp_splitters: number[];
        fiber_m: number;
        attenuation_db_per_km: number;
        connector_count: number;
        connector_loss_db_each: number;
        splice_count: number;
        splice_loss_db_each: number;
        design_margin_db: number;
    };
    thresholds: {
        max_rx_dbm: number;
        min_ok_dbm: number;
        sensitivity_dbm: number;
    };
};
