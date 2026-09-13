import { defineConfig } from "vitest/config";
import { testFilesOfRing } from "./scripts/rings-reporter.js";

export default defineConfig({
  test: {
    reporters: ["default", "./scripts/rings-reporter.ts"],
    projects: [
      // The checkout and command rings, in this process; the box ring's files are the pool's.
      { test: { name: "node", include: ["test/**/*.test.ts"], exclude: testFilesOfRing(import.meta.dirname, "box") } },
      "./vitest.box.config.ts",
    ],
  },
});
