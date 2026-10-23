import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const python =
  process.env.KITAB_PYTHON ||
  (existsSync(".venv/Scripts/python.exe")
    ? ".venv/Scripts/python.exe"
    : existsSync(".venv/bin/python")
      ? ".venv/bin/python"
      : "python");
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 300000,
  expect: { timeout: 20000 },
  use: {
    baseURL: "http://127.0.0.1:8001",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 30000,
  },
  webServer: {
    command: `"${python}" -m tests.serve`,
    url: "http://127.0.0.1:8001/api/settings",
    reuseExistingServer: false,
    timeout: 90000,
  },
  reporter: "list",
});
