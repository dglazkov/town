// The box ring: the test files whose header says `ring: box`, run in
// workerd through the vitest pool over wrangler.jsonc. The loader is bound
// as pen binds it, in wrangler.jsonc and again as miniflare's
// `workerLoaders`. The fake origin sits behind the Worker's own `fetch` as
// miniflare's `outboundService` (test/helpers/box-origin.ts), so the ring
// needs no account and no network.

import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";
import { testFilesOfRing } from "./scripts/rings-reporter.js";
import { fakeOrigin } from "./test/helpers/box-origin.js";

// Wrangler would read the checkout's .env into the Worker's env as secrets; the box under test holds none of the operator's.
process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = "false";

export default defineConfig({
  test: { name: "box", include: testFilesOfRing(import.meta.dirname, "box"), testTimeout: 30_000 },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: { workerLoaders: { LOADER: {} }, outboundService: fakeOrigin },
    }),
  ],
});
