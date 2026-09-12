// townd, the operator's binary. This build holds `spec` and
// `admin shop test <dir>`, neither of which reads a data directory; every
// other verb comes with gate phase 1.

import { SPEC } from "./spec.js";
import { ManifestRefused, testShop } from "./shoptest.js";

const USAGE = "usage: townd spec | townd admin shop test <dir>";

export async function main(argv: readonly string[]): Promise<number> {
  const [verb, ...rest] = argv;
  if (verb === "spec" && rest.length === 0) {
    process.stdout.write(SPEC);
    return 0;
  }
  if (verb === "admin" && rest[0] === "shop" && rest[1] === "test") {
    if (rest.length !== 3) {
      process.stderr.write(`${USAGE}\n`);
      return 1;
    }
    return shopTest(rest[2]!);
  }
  const what = [verb, ...rest.slice(0, verb === "admin" ? 2 : 0)].filter(Boolean).join(" ");
  process.stderr.write(`townd: ${what ? `${what} is not in this build yet` : "no verb given"}\n${USAGE}\n`);
  return 1;
}

async function shopTest(dir: string): Promise<number> {
  try {
    const results = await testShop(dir);
    for (const r of results) {
      process.stdout.write(r.ok ? `ok ${r.name}\n` : `not ok ${r.name}: ${r.why}\n`);
    }
    return results.every((r) => r.ok) ? 0 : 1;
  } catch (err) {
    if (err instanceof ManifestRefused) {
      for (const line of err.refusals) process.stderr.write(`${line}\n`);
      return 1;
    }
    throw err;
  }
}
