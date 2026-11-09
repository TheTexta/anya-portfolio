import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4322",
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: [
    { command: "npx tsx tests/fixtures/backend.ts", url: "http://127.0.0.1:54329/health", reuseExistingServer: false },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 4322 --ignore-lock",
      url: "http://127.0.0.1:4322/admin",
      reuseExistingServer: false,
      env: {
        CMS_ENABLED: "true", SITE_URL: "http://127.0.0.1:4322",
        SUPABASE_URL: "http://127.0.0.1:54329", SUPABASE_ANON_KEY: "local-test-anon",
        SUPABASE_SERVICE_ROLE_KEY: "local-test-service", R2_ACCOUNT_ID: "local-test",
        R2_ACCESS_KEY_ID: "local-test", R2_SECRET_ACCESS_KEY: "local-test",
        R2_STAGING_BUCKET: "local-test-private", R2_PUBLISHED_BUCKET: "local-test-published",
        R2_PUBLIC_BASE_URL: "https://images.example.test/anya",
      },
    },
  ],
});
