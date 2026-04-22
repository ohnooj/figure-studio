export async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": text,
        }),
      ]);
      return;
    } catch {
      // Fall through to the next clipboard path.
    }
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the legacy selection-based path.
    }
  }

  throw new Error("Clipboard copy was blocked.");
}
