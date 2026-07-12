import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { MODEL_REGISTRY } from "../src/lib/models";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, "fixtures", "sample.png");

const DEFAULT_CONFIG = {
  config: {
    execution_provider: "cpu",
    model_id: "u2netp",
    output_dir: "/swiftmask/e2e/output",
    platform: "linux",
  },
  gpuInfo: {
    vendor: "NVIDIA",
    vram_bytes: 4_000_000_000,
    available_eps: ["cuda", "cpu"],
    optimization: "Level1 (<4 GiB)",
  },
  benchmarkResult: {
    ep_latencies: [
      { ep: "cpu", seconds: 0.5 },
      { ep: "cuda", seconds: 0.1 },
    ],
    winner_ep: "cpu",
  },
  models: MODEL_REGISTRY.map((m) => ({
    ...m,
    downloaded: m.bundled,
  })),
};

test.describe("SwiftMask", () => {
  test.beforeEach(async ({ page }) => {
    const fixtureBytes = await readFile(FIXTURE_PATH);

    await page.addInitScript(
      ({ config, fixtureArray }) => {
        window.__SWIFTMASK_MOCK__ = {
          config,
          listeners: {},
          calls: [],
          fixtureBytes: new Uint8Array(fixtureArray),
        };
      },
      {
        config: DEFAULT_CONFIG,
        fixtureArray: Array.from(fixtureBytes),
      },
    );
  });

  test("end-to-end mocked flow", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Drop an image here")).toBeVisible();

    const inputPath = "/swiftmask/e2e/fixtures/sample.png";
    const expectedOutputPath = "/swiftmask/e2e/output/sample-nobg-u2netp.png";

    await page.evaluate((path) => {
      const hook = window.__swiftmaskInjectDrop;
      if (!hook) {
        throw new Error("E2E drop hook not available");
      }
      hook([path]);
    }, inputPath);

    // Click "Process" button to trigger handleProcess ->
    // invokeRemoveImageBackground -> tauriInvoke("remove_image_background")
    await page.getByRole("button", { name: /process/i }).click();

    await expect
      .poll(
        async () => {
          const calls = await page.evaluate(() => {
            const state = window.__SWIFTMASK_MOCK__;
            if (!state) {
              throw new Error("SwiftMask mock state not available");
            }
            return state.calls;
          });
          return calls.some(
            (call) =>
              call.cmd === "remove_image_background" &&
              JSON.stringify(call.args).includes(expectedOutputPath),
          );
        },
        { timeout: 10_000 },
      )
      .toBe(true);

    await expect(page.getByText("Done")).toBeVisible();

    // Done state shows before/after comparison (img layers or slider).
    const previewImg = page.locator(".app-preview img").first();
    await expect(previewImg).toBeVisible();
    const size = await previewImg.evaluate((el) => ({
      width: (el as HTMLImageElement).naturalWidth,
      height: (el as HTMLImageElement).naturalHeight,
    }));
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);
  });
});
