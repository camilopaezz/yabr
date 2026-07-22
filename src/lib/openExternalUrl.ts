import { openUrl } from "@tauri-apps/plugin-opener";

/**
 * Open a URL in the system browser. Logs failures; does not throw.
 */
export async function openExternalUrl(url: string): Promise<void> {
  try {
    await openUrl(url);
  } catch (err) {
    console.error("openExternalUrl failed", url, err);
  }
}
