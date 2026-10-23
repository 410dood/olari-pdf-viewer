import type * as PdfjsApi from "pdfjs-dist";

/*
 * One pinned pdf.js for every Olari PDF widget.
 *
 * The app serves a single copy from theme/web/resources/pdfjs/<version>/ and both
 * olari.PdfViewer and mendix.PdfTemplateDesigner import that same URL. A module import
 * is cached per URL by the browser, so both widgets share one instance, one worker
 * setting and one download, and the API and worker versions can never disagree.
 *
 * Bumping pdf.js: copy node_modules/pdfjs-dist/build/pdf.min.mjs and pdf.worker.min.mjs
 * into a NEW versioned folder (scripts/sync-shared-pdfjs.js) and change PDFJS_VERSION
 * here and in the designer. The versioned path also busts browser caches.
 */
export const PDFJS_VERSION = "4.10.38";

export type Pdfjs = typeof PdfjsApi;

function appRoot(): string {
    const remote = (window as any).mx?.remoteUrl as string | undefined;
    const root = remote || `${window.location.origin}/`;
    return root.endsWith("/") ? root : `${root}/`;
}

export function sharedPdfjsUrls(): { script: string; worker: string } {
    const base = `${appRoot()}resources/pdfjs/${PDFJS_VERSION}/`;
    return { script: `${base}pdf.min.mjs`, worker: `${base}pdf.worker.min.mjs` };
}

// Rollup turns a literal import() into an AMD require, which cannot load an ES module
// by URL. The app CSP allows 'unsafe-eval', so a Function-wrapped import() stays native.
function importEsModule(url: string): Promise<any> {
    // eslint-disable-next-line no-new-func
    return new Function("u", "return import(u)")(url);
}

let loader: Promise<Pdfjs> | undefined;

export function loadSharedPdfjs(): Promise<Pdfjs> {
    if (loader) {
        return loader;
    }
    const { script, worker } = sharedPdfjsUrls();
    const previousGlobal = (window as any).pdfjsLib;
    loader = importEsModule(script)
        .then((mod: any) => {
            const lib = (typeof mod?.getDocument === "function" ? mod : mod?.default) as Pdfjs | undefined;
            if (!lib || typeof lib.getDocument !== "function") {
                throw new Error(`PDF.js module at ${script} did not export getDocument.`);
            }
            // pdf.min.mjs assigns globalThis.pdfjsLib on import. Never leave ours there:
            // put back whatever another widget (e.g. the Mendix DocumentViewer) had.
            if ((window as any).pdfjsLib !== previousGlobal) {
                if (previousGlobal === undefined) {
                    delete (window as any).pdfjsLib;
                } else {
                    (window as any).pdfjsLib = previousGlobal;
                }
            }
            lib.GlobalWorkerOptions.workerSrc = worker;
            return lib;
        })
        .catch((error: unknown) => {
            loader = undefined;
            throw error instanceof Error ? error : new Error(`Failed to load PDF.js from ${script}.`);
        });
    return loader;
}
