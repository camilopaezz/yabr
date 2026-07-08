import { defineConfig, devices } from "@playwright/test";

// TODO: wire tauri-driver endpoint and capability once a built Tauri app binary is available.
export default defineConfig({
  testDir: "./.",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "tauri://localhost",
    headless: true,
  },
  projects: [
    {
      name: "tauri-webdriver",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
