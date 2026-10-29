import { ODP_SPLITTER_IL, RASIO_IL } from '@/lib/lossTables';
import type {
    PowerRxConfig,
    PowerRxStatus,
    TapChainInput,
    TapChainResult,
    TapOdpResult,
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

export function rasioIl(percent: number, table?: Record<string, number>): number {
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

export function calculateTapChain(
    input: TapChainInput,
    config: Pick<PowerRxConfig, 'rasio_il' | 'odp_splitter_il' | 'thresholds'>,
): TapChainResult {
    let power = asNumber(input.sfpPowerDbm, 7);
    const summary = {
        enabledCount: 0,
        ok: 0,
        marginal: 0,
        overload: 0,
        fail: 0,
    };

    const odps: TapOdpResult[] = input.odps.map((odp) => {
        const tapPercent = Math.min(99, Math.max(1, Math.round(asNumber(odp.tapPercent, 4))));
        const throughPercent = 100 - tapPercent;
        const tapIlDb = rasioIl(tapPercent, config.rasio_il);
        const throughIlDb = rasioIl(throughPercent, config.rasio_il);
        const odpSplitterIlDb = odpSplitterIl(odp.odpSplitter, config.odp_splitter_il);
        const outputTapDbm = power - tapIlDb;
        const outputThroughDbm = power - throughIlDb;
        const hasilRedamanDbm = outputTapDbm - odpSplitterIlDb;
        const status = resolveStatus(hasilRedamanDbm, config.thresholds);

        const row: TapOdpResult = {
            name: odp.name,
            enabled: odp.enabled,
            inputPowerDbm: power,
            tapPercent,
            throughPercent,
            tapIlDb,
            throughIlDb,
            outputTapDbm,
            outputThroughDbm,
            odpSplitter: odp.odpSplitter,
            odpSplitterIlDb,
            hasilRedamanDbm,
            status,
        };

        if (odp.enabled) {
            summary.enabledCount++;
            summary[status]++;
        }

        power = outputThroughDbm;

        return row;
    });

    return { odps, summary };
}

export function buildInitialTapChain(config: PowerRxConfig): TapChainInput {
    const taps = config.defaults.tap_percents;
    const splitters = config.defaults.odp_splitters;

    return {
        sfpPowerDbm: config.defaults.sfp_power_dbm,
        odps: Array.from({ length: config.odp_count }, (_, index) => ({
            name: `ODP ${index + 1}`,
            enabled: true,
            tapPercent: taps[index] ?? 4,
            odpSplitter: splitters[index] ?? 8,
        })),
    };
}
