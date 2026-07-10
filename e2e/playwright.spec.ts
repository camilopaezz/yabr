import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { MODEL_REGISTRY } from "../src/lib/models";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, "fixtures", "sample.png");

const DEFAULT_CONFIG = {
  config: {
    execution_provider: "CPUExecutionProvider",
    model_id: "u2netp",
    output_dir: "/yabr/e2e/output",
    platform: "linux",
  },
  gpuInfo: {
    vendor: "NVIDIA",
    vram_bytes: 4_000_000_000,
    available_eps: ["CUDAExecutionProvider", "CPUExecutionProvider"],
  },
  benchmarkResult: {
    ep_latencies: [
      { ep: "CPUExecutionProvider", seconds: 0.5 },
      { ep: "CUDAExecutionProvider", seconds: 0.1 },
    ],
    winner_ep: "CPUExecutionProvider",
  },
  models: MODEL_REGISTRY.map((m) => ({
    ...m,
    downloaded: m.bundled,
  })),
};

test.describe("yabr", () => {
  test.beforeEach(async ({ page }) => {
    const fixtureBytes = await readFile(FIXTURE_PATH);

    await page.addInitScript(
      ({ config, fixtureArray }) => {
        window.__YABR_MOCK__ = {
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
    await expect(page.getByText("Drag & drop an image here")).toBeVisible();

    const inputPath = "/yabr/e2e/fixtures/sample.png";
    const expectedOutputPath = "/yabr/e2e/output/sample-nobg-u2netp.png";

    await page.evaluate((path) => {
      const hook = window.__yabrInjectDrop;
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
            const state = window.__YABR_MOCK__;
            if (!state) {
              throw new Error("YABR mock state not available");
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

    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible();
    const size = await canvas.evaluate((el) => ({
      width: (el as HTMLCanvasElement).width,
      height: (el as HTMLCanvasElement).height,
    }));
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);
  });
});
