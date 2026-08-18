import { Fragment, ReactElement, useCallback, useEffect, useRef, useState } from "react";
import { PdfViewerContainerProps } from "../typings/PdfViewerProps";
import { getDocument, GlobalWorkerOptions, PDFDocumentProxy } from "pdfjs-dist";
import { PDF_WORKER_SOURCE } from "./pdfWorkerSource";
import "./ui/PdfViewer.css";

/*
 * Olari PDF Viewer.
 *
 * Design constraints (learned the hard way from mxtechies.ViewerPdf):
 * - NEVER read or write window.pdfjsLib. This widget's pdf.js is a scoped
 *   module import; Mendix's shared pdf.js and other widgets can do whatever
 *   they want with the global without affecting us.
 * - The worker ships INSIDE this bundle (blob worker from the same npm
 *   package), so the API and worker versions can never disagree and no
 *   relative workerSrc path can 404 from deep page URLs.
 * - The PDF is streamed from the FileDocument URL (no base64 attribute).
 */

let workerInstalled = false;
function ensureOwnWorker(): void {
    if (workerInstalled) {
        return;
    }
    const blob = new Blob([PDF_WORKER_SOURCE], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    // Module worker: pdf.worker.min.mjs is ESM.
    GlobalWorkerOptions.workerPort = new Worker(url, { type: "module" });
    workerInstalled = true;
}

function base64ToBytes(b64: string): Uint8Array {
    const clean = b64.replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
    const bin = atob(clean);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
}

type LoadState = { phase: "idle" | "loading" | "ready" | "error"; message?: string };

export function PdfViewer(props: PdfViewerContainerProps): ReactElement {
    const { pdfFile, base64Fallback, viewerHeight, showToolbar, showDownload } = props;
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const docRef = useRef<PDFDocumentProxy | null>(null);
    const renderTokenRef = useRef(0);
    const pageOffsetsRef = useRef<number[]>([]);
    const [state, setState] = useState<LoadState>({ phase: "idle" });
    const [pageCount, setPageCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [scale, setScale] = useState(1.25);
    const [fitWidth, setFitWidth] = useState(true);

    // Platform-resolved file URI (cache key handled by Mendix).
    const fileValue = pdfFile && pdfFile.status === "available" ? pdfFile.value : undefined;
    const fileUrl = fileValue?.uri || undefined;
    const fileName = fileValue?.name || undefined;
    const base64 =
        !fileUrl && base64Fallback && base64Fallback.status === "available" ? base64Fallback.value : undefined;
    const dsLoading = pdfFile ? pdfFile.status === "loading" : false;

    const renderAllPages = useCallback(
        async (pdf: PDFDocumentProxy, useScale: number, useFitWidth: boolean) => {
            const token = ++renderTokenRef.current;
            const host = containerRef.current;
            if (!host) {
                return;
            }
            host.innerHTML = "";
            pageOffsetsRef.current = [];
            // Cap fit-width so pages stay letter-like in very wide panes.
            const availableWidth = Math.min(1100, Math.max(200, (scrollRef.current?.clientWidth ?? 800) - 48));
            for (let n = 1; n <= pdf.numPages; n++) {
                if (token !== renderTokenRef.current) {
                    return; // superseded by a newer render
                }
                const page = await pdf.getPage(n);
                const baseViewport = page.getViewport({ scale: 1 });
                const effectiveScale = useFitWidth ? availableWidth / baseViewport.width : useScale;
                const viewport = page.getViewport({ scale: effectiveScale });
                const dpr = window.devicePixelRatio || 1;
                const canvas = document.createElement("canvas");
                canvas.className = "olari-pdf-page";
                canvas.width = Math.floor(viewport.width * dpr);
                canvas.height = Math.floor(viewport.height * dpr);
                canvas.style.width = `${Math.floor(viewport.width)}px`;
                canvas.style.height = `${Math.floor(viewport.height)}px`;
                const wrapper = document.createElement("div");
                wrapper.className = "olari-pdf-page-wrap";
                wrapper.dataset.page = String(n);
                wrapper.appendChild(canvas);
                host.appendChild(wrapper);
                pageOffsetsRef.current.push(wrapper.offsetTop);
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    continue;
                }
                await page.render({
                    canvasContext: ctx,
                    viewport,
                    transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined
                }).promise;
            }
        },
        []
    );

    // Load the document whenever the source changes.
    useEffect(() => {
        let cancelled = false;
        async function load(): Promise<void> {
            if (!fileUrl && !base64) {
                setState({ phase: dsLoading ? "loading" : "idle" });
                return;
            }
            setState({ phase: "loading" });
            try {
                ensureOwnWorker();
                let data: Uint8Array;
                if (fileUrl) {
                    const res = await fetch(fileUrl, { credentials: "same-origin" });
                    if (!res.ok) {
                        throw new Error(`File request failed (${res.status})`);
                    }
                    data = new Uint8Array(await res.arrayBuffer());
                } else {
                    data = base64ToBytes(base64 as string);
                }
                const pdf = await getDocument({ data }).promise;
                if (cancelled) {
                    pdf.destroy();
                    return;
                }
                docRef.current?.destroy();
                docRef.current = pdf;
                setPageCount(pdf.numPages);
                setCurrentPage(1);
                setState({ phase: "ready" });
                await renderAllPages(pdf, scale, fitWidth);
            } catch (e) {
                if (!cancelled) {
                    setState({ phase: "error", message: e instanceof Error ? e.message : String(e) });
                }
            }
        }
        load();
        return () => {
            cancelled = true;
        };
        // scale/fitWidth handled by the effect below; only re-load on source change
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fileUrl, base64, dsLoading]);

    // Re-render on zoom changes without re-fetching.
    useEffect(() => {
        if (docRef.current && state.phase === "ready") {
            renderAllPages(docRef.current, scale, fitWidth);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scale, fitWidth]);

    useEffect(
        () => () => {
            docRef.current?.destroy();
        },
        []
    );

    const onScroll = useCallback(() => {
        const scroller = scrollRef.current;
        const host = containerRef.current;
        if (!scroller || !host) {
            return;
        }
        const marker = scroller.scrollTop + scroller.clientHeight * 0.3;
        let page = 1;
        const wraps = host.children;
        for (let i = 0; i < wraps.length; i++) {
            if ((wraps[i] as HTMLElement).offsetTop <= marker) {
                page = i + 1;
            }
        }
        setCurrentPage(page);
    }, []);

    const goToPage = useCallback((n: number) => {
        const host = containerRef.current;
        const scroller = scrollRef.current;
        if (!host || !scroller) {
            return;
        }
        const target = host.querySelector<HTMLElement>(`[data-page="${n}"]`);
        if (target) {
            scroller.scrollTo({ top: target.offsetTop - 8, behavior: "smooth" });
        }
    }, []);

    const download = useCallback(async () => {
        try {
            let blob: Blob;
            let name = fileName || "document.pdf";
            if (fileUrl) {
                const res = await fetch(fileUrl, { credentials: "same-origin" });
                blob = await res.blob();
                const disp = res.headers.get("content-disposition") || "";
                const m = disp.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
                if (m) {
                    name = decodeURIComponent(m[1].replace(/"/g, ""));
                }
            } else if (base64) {
                blob = new Blob([base64ToBytes(base64).buffer as ArrayBuffer], { type: "application/pdf" });
            } else {
                return;
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
        } catch (e) {
            // non-fatal
        }
    }, [fileUrl, base64, fileName]);

    const height = viewerHeight && viewerHeight.trim() ? viewerHeight.trim() : "90vh";

    return (
        <div className="olari-pdf-viewer" style={{ height }}>
            {showToolbar ? (
                <div className="olari-pdf-toolbar">
                    <div className="olari-pdf-tb-group">
                        <button
                            type="button"
                            className="olari-pdf-btn"
                            disabled={currentPage <= 1}
                            onClick={() => goToPage(currentPage - 1)}
                            title="Previous page"
                        >
                            &#8249;
                        </button>
                        <span className="olari-pdf-pageinfo">
                            {pageCount ? `${currentPage} / ${pageCount}` : "—"}
                        </span>
                        <button
                            type="button"
                            className="olari-pdf-btn"
                            disabled={currentPage >= pageCount}
                            onClick={() => goToPage(currentPage + 1)}
                            title="Next page"
                        >
                            &#8250;
                        </button>
                    </div>
                    <div className="olari-pdf-tb-group">
                        <button
                            type="button"
                            className="olari-pdf-btn"
                            onClick={() => {
                                setFitWidth(false);
                                setScale(s => Math.max(0.4, Math.round((s - 0.2) * 10) / 10));
                            }}
                            title="Zoom out"
                        >
                            −
                        </button>
                        <button
                            type="button"
                            className={`olari-pdf-btn${fitWidth ? " olari-pdf-btn--active" : ""}`}
                            onClick={() => setFitWidth(true)}
                            title="Fit width"
                        >
                            Fit
                        </button>
                        <button
                            type="button"
                            className="olari-pdf-btn"
                            onClick={() => {
                                setFitWidth(false);
                                setScale(s => Math.min(4, Math.round((s + 0.2) * 10) / 10));
                            }}
                            title="Zoom in"
                        >
                            +
                        </button>
                    </div>
                    {showDownload ? (
                        <div className="olari-pdf-tb-group">
                            <button type="button" className="olari-pdf-btn" onClick={download} title="Download PDF">
                                &#8595; Download
                            </button>
                        </div>
                    ) : (
                        <Fragment />
                    )}
                </div>
            ) : (
                <Fragment />
            )}
            <div className="olari-pdf-scroll" ref={scrollRef} onScroll={onScroll}>
                {state.phase === "loading" || dsLoading ? (
                    <div className="olari-pdf-status">Loading document…</div>
                ) : state.phase === "error" ? (
                    <div className="olari-pdf-status olari-pdf-status--error">
                        Could not display this PDF ({state.message}). Use Download to view the file.
                    </div>
                ) : state.phase === "idle" ? (
                    <div className="olari-pdf-status">No document.</div>
                ) : (
                    <Fragment />
                )}
                <div className="olari-pdf-pages" ref={containerRef} />
            </div>
        </div>
    );
}

