import { describe, expect, it } from "vitest";
import { MODEL_REGISTRY } from "./models.generated";
import {
  FALLBACK_DEFAULT_MODE,
  PREFERRED_DEFAULT_MODE,
  isModelReady,
  resolveMode,
  type ModelMeta,
} from "./models";

function withDownloadState(
  downloadedIds: readonly string[] = [],
): ModelMeta[] {
  return MODEL_REGISTRY.map((m) => ({
    ...m,
    downloaded: m.bundled || downloadedIds.includes(m.id),
  }));
}

describe("isModelReady", () => {
  it("treats bundled models as ready", () => {
    expect(isModelReady({ bundled: true, downloaded: false })).toBe(true);
  });

  it("treats downloaded models as ready", () => {
    expect(isModelReady({ bundled: false, downloaded: true })).toBe(true);
  });

  it("treats missing weights as not ready", () => {
    expect(isModelReady({ bundled: false, downloaded: false })).toBe(false);
  });
});

describe("resolveMode", () => {
  it("keeps the current mode when it is ready", () => {
    const models = withDownloadState(["isnet-general-use"]);
    expect(resolveMode("isnet-general-use", models)).toBe("isnet-general-use");
  });

  it("prefers Balanced+ when current is not ready and preferred is downloaded", () => {
    const models = withDownloadState(["rmbg-1.4"]);
    expect(resolveMode("rmbg-2.0", models)).toBe(PREFERRED_DEFAULT_MODE);
  });

  it("falls back to Turbo when preferred is not ready", () => {
    const models = withDownloadState();
    expect(resolveMode(PREFERRED_DEFAULT_MODE, models)).toBe(
      FALLBACK_DEFAULT_MODE,
    );
  });

  it("keeps Turbo when that is current and ready", () => {
    const models = withDownloadState(["rmbg-1.4"]);
    expect(resolveMode("u2netp", models)).toBe("u2netp");
  });

  it("falls back when the catalog is empty", () => {
    expect(resolveMode(PREFERRED_DEFAULT_MODE, [])).toBe(FALLBACK_DEFAULT_MODE);
  });

  it("selects preferred from an unresolved default when weights are ready", () => {
    const models = withDownloadState(["rmbg-1.4"]);
    expect(resolveMode(PREFERRED_DEFAULT_MODE, models)).toBe(
      PREFERRED_DEFAULT_MODE,
    );
  });

  it("uses first ready model when preferred and fallback are both unavailable", () => {
    const models = withDownloadState(["isnet-general-use"]).map((m) =>
      m.id === FALLBACK_DEFAULT_MODE || m.id === PREFERRED_DEFAULT_MODE
        ? { ...m, bundled: false, downloaded: false }
        : m,
    );
    expect(resolveMode("rmbg-2.0", models)).toBe("isnet-general-use");
  });
});
