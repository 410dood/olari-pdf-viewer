# Olari PDF Viewer (`olari.PdfViewer`)

In-house Mendix pluggable widget that displays and scrolls a PDF **in page**, reliably.

Built to replace `mxtechies.ViewerPdf`, whose pdf.js v3 collided with Mendix's shared
pdf.js v4 on `window.pdfjsLib` (load-order race → intermittent silent "Loading document…").

## Design rules
- **One pinned pdf.js for the whole app (1.2.0).** pdf.js is not bundled. The widget imports
  `/resources/pdfjs/<version>/pdf.min.mjs` as a module (see `src/sharedPdfjs.ts`), the same
  file `mendix.PdfTemplateDesigner` uses, and points the worker at the absolute URL from the
  same folder, so API and worker versions can never mismatch and no relative `workerSrc` can 404.
- **No shared globals.** The `window.pdfjsLib` that pdf.min.mjs assigns on import is put back
  to whatever was there before; the widget never reads it.
- **Streams the FileDocument by URL** (`/file?guid=...`) — no base64 attribute, no
  multi-megabyte strings in client state.

## Properties
- **PDF file** — file property (`DynamicValue<FileValue>`); the platform provides the URI.
- **Base64 fallback** — optional legacy string attribute, used only when no file document is wired.
- Viewer height / Show toolbar / Show download.

## Develop
```
npm install
npm run sync-pdfjs   # copies pdfjs-dist build into <projectPath>/theme/web/resources/pdfjs/<version>/
npm run release      # dist/<version>/olari.PdfViewer.mpk
```
Copy the mpk to `Olari-main/widgets/`, F4 sync, stop + run.
