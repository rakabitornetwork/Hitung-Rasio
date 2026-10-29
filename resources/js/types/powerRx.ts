export type PowerRxStatus = 'ok' | 'marginal' | 'overload' | 'fail';

export type TapOdpInput = {
    name: string;
    enabled: boolean;
    tapPercent: number | null;
    odpSplitter: number;
};

export type TapChainInput = {
    sfpPowerDbm: number | null;
    odps: TapOdpInput[];
};

export type TapOdpResult = {
    name: string;
    enabled: boolean;
    inputPowerDbm: number;
    tapPercent: number;
    throughPercent: number;
    tapIlDb: number;
    throughIlDb: number;
    outputTapDbm: number;
    outputThroughDbm: number;
    odpSplitter: number;
    odpSplitterIlDb: number;
    hasilRedamanDbm: number;
    status: PowerRxStatus;
};

export type TapChainResult = {
    odps: TapOdpResult[];
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
    defaults: {
        sfp_power_dbm: number;
        tap_percents: number[];
        odp_splitters: number[];
    };
    thresholds: {
        max_rx_dbm: number;
        min_ok_dbm: number;
        sensitivity_dbm: number;
    };
};
