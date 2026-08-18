# Olari PDF Viewer (`olari.PdfViewer`)

In-house Mendix pluggable widget that displays and scrolls a PDF **in page**, reliably.

Built to replace `mxtechies.ViewerPdf`, whose pdf.js v3 collided with Mendix's shared
pdf.js v4 on `window.pdfjsLib` (load-order race → intermittent silent "Loading document…").

## Design rules
- **No shared globals.** pdf.js is a scoped module import; `window.pdfjsLib` is never read or written.
- **Worker ships in the bundle** (blob worker generated from the *same* pdfjs-dist build),
  so API/worker versions can never mismatch and no relative `workerSrc` can 404.
- **Streams the FileDocument by URL** (`/file?guid=...`) — no base64 attribute, no
  multi-megabyte strings in client state.

## Properties
- **PDF file document** — list datasource; first item is the FileDocument to show
  (e.g. microflow `Document.DS_FormDocument_LatestPdfList`).
- **Changed date (cache key)** — optional DateTime attribute for cache busting.
- **Base64 fallback** — optional legacy string attribute, used only when no file document is wired.
- Viewer height / Show toolbar / Show download.

## Develop
```
npm install
node scripts/embed-worker.js   # after bumping pdfjs-dist
npm run build                  # dist/<version>/olari.PdfViewer.mpk
```
Copy the mpk to `Olari-main/widgets/`, F4 sync, stop + run.
