import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

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
  models: [
    {
      id: "u2netp",
      name: "Turbo",
      file: "u2netp.onnx",
      size_bytes: 4_574_861,
      input_size: 320,
      mean: [0.485, 0.456, 0.406],
      std: [0.229, 0.224, 0.225],
      license: "Apache-2.0",
      source: "xuebinqin/U-2-Net via rembg",
      download_url: "",
      sha256: "309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8",
      bundled: true,
      downloaded: true,
    },
    {
      id: "isnet-general-use",
      name: "Balanced",
      file: "isnet-general-use.onnx",
      size_bytes: 178_000_000,
      input_size: 1024,
      mean: [0.5, 0.5, 0.5],
      std: [1.0, 1.0, 1.0],
      license: "Apache-2.0",
      source: "xuebinqin/DIS via rembg",
      download_url: "https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx",
      sha256: "0000000000000000000000000000000000000000000000000000000000000000",
      bundled: false,
      downloaded: false,
    },
    {
      id: "rmbg-1.4",
      name: "Balanced+",
      file: "rmbg-1.4.onnx",
      size_bytes: 176_000_000,
      input_size: 1024,
      mean: [0.5, 0.5, 0.5],
      std: [1.0, 1.0, 1.0],
      license: "CC BY-NC 4.0",
      source: "briaai/RMBG-1.4",
      download_url: "https://huggingface.co/briaai/RMBG-1.4/resolve/main/onnx/model.onnx",
      sha256: "0000000000000000000000000000000000000000000000000000000000000000",
      bundled: false,
      downloaded: false,
    },
    {
      id: "rmbg-2.0",
      name: "Max Quality",
      file: "rmbg-2.0.onnx",
      size_bytes: 173_000_000,
      input_size: 1024,
      mean: [0.485, 0.456, 0.406],
      std: [0.229, 0.224, 0.225],
      license: "CC BY-NC 4.0",
      source: "briaai/RMBG-2.0 via rembg",
      download_url: "https://github.com/danielgatis/rembg/releases/download/v0.0.0/bria-rmbg-2.0.onnx",
      sha256: "0000000000000000000000000000000000000000000000000000000000000000",
      bundled: false,
      downloaded: false,
    },
  ],
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
    await expect(page.getByText("Drag & drop images here")).toBeVisible();

    const inputPath = "/yabr/e2e/fixtures/sample.png";
    const expectedOutputPath = "/yabr/e2e/output/sample-nobg.png";

    await page.evaluate((path) => {
      const hook = window.__yabrInjectDrop;
      if (!hook) {
        throw new Error("E2E drop hook not available");
      }
      hook([path]);
    }, inputPath);

    // Click "Process N images" button to trigger handleProcessAll ->
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
