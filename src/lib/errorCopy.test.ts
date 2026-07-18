import { describe, expect, it } from "vitest";
import {
  formatError,
  formatFallbackNotice,
  sanitizeTechnicalMessage,
} from "./errorCopy";

describe("formatError", () => {
  it("maps known codes to titles", () => {
    expect(formatError("network", "request failed: timeout").title).toBe(
      "Network error",
    );
    expect(formatError("model_corrupt", "SHA-256 mismatch").body).toMatch(
      /download/i,
    );
    expect(formatError("oom", "CUDA out of memory").title).toBe(
      "Out of memory",
    );
  });

  it("falls back to sanitized technical message", () => {
    expect(formatError("custom_code", "model error: weird boom").title).toBe(
      "weird boom",
    );
  });

  it("handles cancelled without treating as failure chrome", () => {
    expect(formatError("cancelled", "cancelled").title).toBe("Cancelled");
  });
});

describe("sanitizeTechnicalMessage", () => {
  it("strips known prefixes", () => {
    expect(sanitizeTechnicalMessage("inference error: boom")).toBe("boom");
    expect(sanitizeTechnicalMessage("  image io error: bad  ")).toBe("bad");
  });
});

describe("formatFallbackNotice", () => {
  it("mentions CPU finish and Settings EP", () => {
    const copy = formatFallbackNotice("directml", "cpu");
    expect(copy.title).toMatch(/CPU/i);
    expect(copy.body).toMatch(/Settings/i);
    expect(copy.body).toMatch(/DirectML/i);
  });
});
