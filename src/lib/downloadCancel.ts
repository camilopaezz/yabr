import { isCancelledError } from "./parseAppError";

/** True when a download invoke failed because the user cancelled. */
export function isDownloadCancelled(err: unknown): boolean {
  return isCancelledError(err);
}
