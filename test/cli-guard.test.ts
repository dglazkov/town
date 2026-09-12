// ring: checkout
// The agent's binary knows nothing: no shop, command, or argument name,
// and nothing of the operator's, in src/cli.ts.

import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

it("src/cli.ts names no shop, command, argument, or operator verb", () => {
  const source = readFileSync(path.resolve(import.meta.dirname, "../src/cli.ts"), "utf8");
  for (const word of ["memory", "remember", "recall", "forget", "--key", "--prefix", "serve", "admin", "spec"]) {
    expect(source, word).not.toContain(word);
  }
});
