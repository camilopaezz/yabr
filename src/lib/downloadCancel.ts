/** Matches backend `AppError::Cancelled` serialized for Tauri invoke. */
export function isDownloadCancelled(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  return message === "cancelled";
}
