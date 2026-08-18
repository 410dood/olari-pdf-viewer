import { ReactElement } from "react";

export function preview(): ReactElement {
    return (
        <div
            style={{
                border: "1px dashed #9ab1d8",
                borderRadius: 8,
                padding: 24,
                textAlign: "center",
                color: "#3c4c66",
                background: "#f5f8fd"
            }}
        >
            PDF Viewer (Olari) — renders the configured FileDocument at runtime
        </div>
    );
}

export function getPreviewCss(): string {
    return "";
}
