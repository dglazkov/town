// The stale rule, read by two: test/helpers/town.ts, which fails a command
// test that would run yesterday's build, and scripts/test.mjs, which builds
// only when this says dist/ is stale. Per file: a src/*.ts that `pnpm build`
// compiles is newer than its dist/*.js, or the .js is missing. The files not
// built are tsconfig.json's exclude, read as tsconfig.build.json inherits it.
// Plain node runs this file by stripping its types, so it holds only
// erasable syntax.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/** The files under src/ that `pnpm build` never compiles, the Worker's: tsconfig.json's exclude, read as tsconfig.build.json inherits it. */
function notBuilt(root: string): string[] {
  const text = readFileSync(path.join(root, "tsconfig.json"), "utf8").replace(/^\s*\/\/.*$/gm, "");
  return ((JSON.parse(text) as { exclude?: string[] }).exclude ?? []).filter((f) => f.startsWith("src/")).map((f) => path.basename(f));
}

/** Why dist/ under `root` is stale, naming the first file that makes it so, or null when every src/*.ts the build compiles is no newer than its dist/*.js. */
export function staleness(root: string): string | null {
  const src = path.join(root, "src");
  const skipped = notBuilt(root);
  for (const e of readdirSync(src)) {
    if (!e.endsWith(".ts") || skipped.includes(e)) continue;
    const js = path.join(root, "dist", e.replace(/\.ts$/, ".js"));
    let built: number;
    try {
      built = statSync(js).mtimeMs;
    } catch {
      return `dist/${path.basename(js)} is missing`;
    }
    if (statSync(path.join(src, e)).mtimeMs > built) return `dist is older than src/${e}`;
  }
  return null;
}
