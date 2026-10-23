// Copies the pinned pdf.js build into the Mendix project's theme so the app serves ONE
// copy at /resources/pdfjs/<version>/ for olari.PdfViewer and mendix.PdfTemplateDesigner.
// Run after bumping pdfjs-dist; keep PDFJS_VERSION in src/sharedPdfjs.ts (and the
// designer) in step with the installed version.
const fs = require("fs");
const path = require("path");

const pkg = require("../package.json");
const version = require("pdfjs-dist/package.json").version;
const source = path.join(path.dirname(require.resolve("pdfjs-dist/package.json")), "build");
const target = path.join(pkg.config.projectPath, "theme", "web", "resources", "pdfjs", version);

const shared = fs.readFileSync(path.join(__dirname, "..", "src", "sharedPdfjs.ts"), "utf8");
if (!shared.includes(`PDFJS_VERSION = "${version}"`)) {
    throw new Error(`src/sharedPdfjs.ts PDFJS_VERSION does not match installed pdfjs-dist ${version}`);
}

fs.mkdirSync(target, { recursive: true });
for (const file of ["pdf.min.mjs", "pdf.worker.min.mjs"]) {
    fs.copyFileSync(path.join(source, file), path.join(target, file));
}
console.log(`pdf.js ${version} -> ${target}`);
