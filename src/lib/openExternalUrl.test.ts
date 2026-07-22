import { afterEach, describe, expect, it, vi } from "vitest";
import { openExternalUrl } from "./openExternalUrl";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

import { openUrl } from "@tauri-apps/plugin-opener";

const openUrlMock = vi.mocked(openUrl);

describe("openExternalUrl", () => {
  afterEach(() => {
    openUrlMock.mockReset();
    vi.restoreAllMocks();
  });

  it("calls openUrl with the given URL", async () => {
    openUrlMock.mockResolvedValue(undefined);
    await openExternalUrl("https://example.com");
    expect(openUrlMock).toHaveBeenCalledWith("https://example.com");
  });

  it("logs and swallows failures", async () => {
    const err = new Error("denied");
    openUrlMock.mockRejectedValue(err);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await expect(
      openExternalUrl("https://example.com/fail"),
    ).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      "openExternalUrl failed",
      "https://example.com/fail",
      err,
    );
  });
});
