import { useCallback, useEffect, useState } from 'react';
import IconPng from '@/Components/IconPng';
import { ACTION_BUTTON_CLASS } from '@/lib/actionButton';

type UpdateStatus = {
    enabled: boolean;
    current_sha: string | null;
    remote_sha: string | null;
    behind: number;
    ahead: number;
    dirty: boolean;
    update_available: boolean;
    branch: string;
    remote: string;
    message: string;
};

type Props = {
    className?: string;
};

export default function UpdateButton({ className = '' }: Props) {
    const [status, setStatus] = useState<UpdateStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [pulling, setPulling] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);

    const headers = useCallback((): HeadersInit => {
        const csrf = document
            .querySelector('meta[name="csrf-token"]')
            ?.getAttribute('content');

        const next: Record<string, string> = {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        };

        if (csrf) {
            next['X-CSRF-TOKEN'] = csrf;
        }

        return next;
    }, []);

    const refreshStatus = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch('/app/update/status', {
                headers: headers(),
            });
            const payload = await response.json();

            if (!response.ok) {
                throw new Error(payload.message || 'Gagal mengecek pembaruan.');
            }

            setStatus(payload.status);
            setInfo(payload.status?.message ?? null);
        } catch (e) {
            setStatus(null);
            setError(e instanceof Error ? e.message : 'Gagal mengecek pembaruan.');
        } finally {
            setLoading(false);
        }
    }, [headers]);

    useEffect(() => {
        void refreshStatus();
    }, [refreshStatus]);

    async function handlePull() {
        if (!status?.update_available || pulling) {
            return;
        }

        setPulling(true);
        setError(null);
        setInfo(null);

        try {
            const response = await fetch('/app/update/pull', {
                method: 'POST',
                headers: {
                    ...headers(),
                    'Content-Type': 'application/json',
                },
                body: '{}',
            });
            const payload = await response.json();

            if (!response.ok || payload.ok === false) {
                throw new Error(payload.message || 'Pull dari GitHub gagal.');
            }

            if (payload.status) {
                setStatus(payload.status);
            } else {
                await refreshStatus();
            }

            setInfo(payload.message || 'Pembaruan berhasil.');

            if (payload.pulled) {
                window.setTimeout(() => window.location.reload(), 1200);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Pull dari GitHub gagal.');
        } finally {
            setPulling(false);
        }
    }

    const available = !!status?.update_available;
    const upToDate = !!status && !status.update_available && status.enabled;
    const busy = loading || pulling;

    let label = 'Cek update';
    let toneClass =
        'border-line bg-slate-200 text-slate-700 hover:bg-slate-300';
    let icon: 'update' | 'update-ok' = 'update';

    if (busy) {
        label = pulling ? 'Update…' : 'Cek…';
        toneClass = 'bg-slate-400 text-white';
        icon = 'update';
    } else if (available) {
        label = `Update (${status?.behind ?? 0})`;
        toneClass = 'bg-indigo-600 text-white hover:bg-indigo-700';
        icon = 'update';
    } else if (upToDate) {
        label = 'Terbaru';
        toneClass = 'bg-teal-700 text-white hover:bg-teal-800';
        icon = 'update-ok';
    } else if (error) {
        label = 'Cek ulang';
        toneClass = 'bg-red-600 text-white hover:bg-red-700';
        icon = 'update';
    }

    const detail =
        error ??
        (status?.dirty
            ? `${info ?? 'Status update'} (ada perubahan lokal)`
            : info);

    return (
        <div className={`relative inline-flex ${className}`.trim()}>
            <button
                type="button"
                disabled={busy}
                onClick={() => {
                    if (available) {
                        void handlePull();

                        return;
                    }

                    void refreshStatus();
                }}
                title={detail ?? 'Pembaruan dari GitHub'}
                aria-label={detail ?? label}
                className={`${ACTION_BUTTON_CLASS} ${toneClass}`}
            >
                <IconPng name={icon} size={16} alt="" />
                <span>{label}</span>
            </button>
            {detail && !busy && (
                <p
                    className={`pointer-events-none absolute left-0 top-full z-10 mt-1 max-w-[14rem] truncate text-[10px] leading-tight ${
                        error ? 'text-danger' : 'text-ink-soft'
                    }`}
                >
                    {detail}
                </p>
            )}
        </div>
    );
}
