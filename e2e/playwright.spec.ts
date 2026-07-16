import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
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

const E2E_FIXTURE_PATH = "/swiftmask/e2e/fixtures/sample.png";

async function bootAndLoadFixture(page: Page) {
  await page.goto("/");
  await expect(page.getByText("Drop an image here")).toBeVisible();

  await page.evaluate((fixturePath) => {
    const hook = window.__swiftmaskInjectDrop;
    if (!hook) {
      throw new Error("E2E drop hook not available");
    }
    hook([fixturePath]);
  }, E2E_FIXTURE_PATH);

  await expect(page.getByRole("button", { name: /process/i })).toBeEnabled();
}

test.describe("SwiftMask", () => {
  test.beforeEach(async ({ page }) => {
    const fixtureBytes = await readFile(FIXTURE_PATH);

    await page.addInitScript(
      ({ config, fixtureArray }) => {
        localStorage.removeItem("swiftmask:nc-license-ack");
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

  test("Ctrl+Enter starts process", async ({ page }) => {
    await bootAndLoadFixture(page);

    const expectedOutputPath = "/swiftmask/e2e/output/sample-nobg-u2netp.png";

    await page.keyboard.press("Control+Enter");

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
  });

  test("Escape cancels while processing", async ({ page }) => {
    await bootAndLoadFixture(page);

    await page.keyboard.press("Control+Enter");
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible({
      timeout: 10_000,
    });

    await page.keyboard.press("Escape");

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
          return calls.some((call) => call.cmd === "cancel_inference");
        },
        { timeout: 10_000 },
      )
      .toBe(true);
  });

  test("NC license modal gates first RMBG download", async ({ page }) => {
    await page.goto("/");

    const balancedPlusRow = page
      .locator(".mode-option")
      .filter({ hasText: "Balanced+" });
    await balancedPlusRow.getByRole("button", { name: "Download" }).click();

    const ncDialog = page.getByRole("dialog", {
      name: "Non-commercial license",
    });
    await expect(ncDialog).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Downloading Balanced+" }),
    ).toHaveCount(0);

    await ncDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(ncDialog).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Downloading Balanced+" }),
    ).toHaveCount(0);

    await balancedPlusRow.getByRole("button", { name: "Download" }).click();
    await expect(ncDialog).toBeVisible();

    await ncDialog.getByRole("button", { name: "I understand" }).click();
    await expect(ncDialog).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Downloading Balanced+" }),
    ).toBeVisible();
  });
});
