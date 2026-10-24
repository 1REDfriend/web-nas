"use client";

import { useEffect, useState } from "react";
import { Clock, Download, FileIcon, Link2Off, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MediaPreview } from "@/components/file-manager/MediaPreview";
import { formatDate, formatSize, formatTimeLeft } from "@/lib/file-manager/format";
import { MediaKind } from "@/lib/file-manager/media";

type PublicDrop = {
    name: string;
    size: string;
    mimeType: string | null;
    expiresAt: string;
    downloadsLeft: number | null;
    preview: MediaKind | null;
};

function dropApi(id: string, part = "") {
    return `/api/public/drops/${encodeURIComponent(id)}${part}`;
}

export function DropPage({ id }: { id: string }) {
    const [drop, setDrop] = useState<PublicDrop | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        let cancelled = false;
        fetch(dropApi(id), { cache: "no-store" })
            .then(async (res) => {
                const body = await res.json().catch(() => null);
                if (cancelled) return;
                if (res.ok && body?.drop) setDrop(body.drop);
                else setError(body?.error ?? "This link has expired or does not exist");
            })
            .catch(() => !cancelled && setError("Could not reach the server. Try again later."));
        return () => {
            cancelled = true;
        };
    }, [id]);

    // Keep "expires in ..." current while the page stays open
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 30000);
        return () => clearInterval(timer);
    }, []);

    const expired = drop !== null && new Date(drop.expiresAt).getTime() <= now;
    const usedUp = drop?.downloadsLeft === 0;

    // The browser saves the file itself; only the count shown here is updated
    function onDownload() {
        setDrop((d) => (d && d.downloadsLeft !== null ? { ...d, downloadsLeft: Math.max(0, d.downloadsLeft - 1) } : d));
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-linear-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-10 text-slate-200">
            <div className="w-full max-w-lg rounded-xl border border-white/10 bg-slate-900/70 p-6 shadow-xl">
                {!drop && !error && (
                    <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span className="text-sm">Loading…</span>
                    </div>
                )}

                {(error || expired) && (
                    <div className="flex flex-col items-center gap-3 py-10 text-center text-slate-400">
                        <Link2Off className="h-10 w-10 text-slate-600" />
                        <p className="text-sm">{error ?? "This link has expired"}</p>
                    </div>
                )}

                {drop && !error && !expired && (
                    <div className="space-y-5">
                        <div className="flex items-start gap-3">
                            <FileIcon className="mt-0.5 h-8 w-8 shrink-0 text-sky-400" />
                            <div className="min-w-0">
                                <h1 className="break-words text-lg font-semibold text-slate-100">{drop.name}</h1>
                                <p className="text-sm text-slate-400">{formatSize(drop.size)}</p>
                            </div>
                        </div>

                        {drop.preview && (
                            <MediaPreview key={drop.name} src={dropApi(id, "/raw")} name={drop.name} kind={drop.preview} />
                        )}

                        <div className="space-y-1 text-sm text-slate-400">
                            <p className="flex items-center gap-2" title={formatDate(drop.expiresAt)}>
                                <Clock className="h-4 w-4" />
                                Expires {formatTimeLeft(drop.expiresAt, now)}
                            </p>
                            {drop.downloadsLeft !== null && (
                                <p>
                                    {usedUp
                                        ? "No downloads left."
                                        : `Can be downloaded ${drop.downloadsLeft} more time${drop.downloadsLeft === 1 ? "" : "s"}.`}
                                </p>
                            )}
                        </div>

                        {usedUp ? (
                            <Button className="w-full gap-2" disabled>
                                <Download className="h-4 w-4" />
                                Download
                            </Button>
                        ) : (
                            <Button asChild className="w-full gap-2">
                                <a href={dropApi(id, "/download")} onClick={onDownload}>
                                    <Download className="h-4 w-4" />
                                    Download
                                </a>
                            </Button>
                        )}
                    </div>
                )}
            </div>
        </main>
    );
}
