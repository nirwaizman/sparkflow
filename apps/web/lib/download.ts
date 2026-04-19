/**
 * Client-only helper: triggers a browser download for a Blob.
 *
 * Creates a transient object URL, clicks a synthetic `<a download>`, then
 * revokes the URL on the next tick so the browser has time to initiate
 * the download before the URL is invalidated.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("downloadBlob can only be called in the browser");
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  // Some browsers require the anchor to be in the DOM for the click to
  // take effect — append, click, then remove.
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on the next tick so the download has time to start.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
