// ring: checkout
// Help renders for the grant, never the manifest: for every subset of
// memory's four commands, the whole of `town --help` and of
// `town memory --help` names exactly that subset and no constraint on a
// command outside it. Nothing is stripped before reading: the summary
// and guidance name no command, since the validator refuses prose that does.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Constraints } from "../src/constraints.js";
import { constraintWords, helpForGrant, helpForPass } from "../src/help.js";
import { parseManifest } from "../src/manifest.js";
import { loadShop } from "../src/shoptest.js";
import { openStore, type Store } from "../src/store.js";

const MEMORY = parseManifest(readFileSync(path.resolve(import.meta.dirname, "../shops/memory/manifest.yaml"), "utf8")).manifest!;
const NAMES = MEMORY.commands.map((c) => c.name);

/** A constraint on every constrainable argument of every command, by its first kind. */
const ALL_CONSTRAINTS: Constraints = Object.fromEntries(
  MEMORY.commands.flatMap((c) => (c.args ?? []).filter((a) => a.constrainable?.length).map((a) => [`${c.name}.${a.name}`, { prefix: `${c.name}-only/` }])),
);

function subsets(): string[][] {
  const out: string[][] = [];
  for (let mask = 1; mask < 1 << NAMES.length; mask++) out.push(NAMES.filter((_, i) => mask & (1 << i)));
  return out;
}

function constraintsFor(commands: string[]): Constraints {
  return Object.fromEntries(Object.entries(ALL_CONSTRAINTS).filter(([t]) => commands.includes(t.split(".")[0]!)));
}

/** Whether `name` appears in `text` as a whole word, in any case, as the validator reads prose. */
const mentioned = (text: string, name: string) => new RegExp(`(?<![A-Za-z0-9_-])${name}(?![A-Za-z0-9_-])`, "i").test(text);

let dir: string;
let store: Store;

beforeAll(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "town-help-test-"));
  store = openStore(dir);
  store.upsertShop(MEMORY);
  store.addUser("dimitri");
});

afterAll(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("town memory --help, for every subset of memory's commands", () => {
  it.each(subsets().map((s) => [s.join(",")]))("%s", (joined) => {
    const commands = joined.split(",");
    const text = helpForGrant(MEMORY, { commands, constraints: constraintsFor(commands), label: "a label", expiresAt: null }, "memory");
    expect(text).toContain(MEMORY.summary);
    expect(text).toContain(MEMORY.guidance!.trimEnd());
    const commandLines = text.split("\n").filter((l) => l.startsWith("  town memory "));
    expect(commandLines.map((l) => l.split(" ")[4])).toEqual(commands);
    for (const name of NAMES) expect(mentioned(text, name), `${name} in help for ${joined}`).toBe(commands.includes(name));
    for (const target of Object.keys(ALL_CONSTRAINTS)) {
      const command = target.split(".")[0]!;
      expect(text.includes(`\`${command}-only/\``), target).toBe(commands.includes(command));
    }
  });
});

describe("town --help, for every subset of memory's commands", () => {
  it.each(subsets().map((s) => [s.join(",")]))("%s", (joined) => {
    const commands = joined.split(",");
    const { pass, token } = store.newPass("dimitri", `subset ${joined}`, null);
    store.newGrant({ passId: pass.id, shop: "town/memory", commands, constraints: {}, expiresAt: null });
    const text = helpForPass(store, pass);
    const lines = text.split("\n").filter((l) => l.startsWith("town/memory"));
    expect(lines).toEqual([`town/memory  ${MEMORY.summary} [${commands.join(", ")}]`]);
    for (const name of NAMES) expect(mentioned(text, name), `${name} in pass help for ${joined}`).toBe(commands.includes(name));
    for (const secret of [token, pass.id, "dimitri", "subset", "127.0.0.1"]) expect(text).not.toContain(secret);
  });
});

describe("the grant in words", () => {
  it("renders the label, the expiry, and each constraint as a sentence from the argument and the kind", () => {
    const text = helpForGrant(
      MEMORY,
      { commands: ["remember", "recall", "list"], constraints: { "remember.key": { prefix: "notes/" }, "recall.key": { prefix: "notes/" } }, label: "research assistant", expiresAt: Date.UTC(2026, 9, 12) },
      "memory",
    );
    expect(text).toContain("this grant: research assistant; expires 2026-10-12T00:00:00Z");
    expect(text).toContain("constraints:\n  remember --key: keys under `notes/` only\n  recall --key: keys under `notes/` only\n");
  });

  it("says when there are none", () => {
    expect(helpForGrant(MEMORY, { commands: ["list"], constraints: {}, label: "x", expiresAt: null })).toContain("constraints: none");
  });

  it("has a sentence for each kind, from the argument's name", () => {
    expect(constraintWords("key", "prefix", "notes/")).toBe("keys under `notes/` only");
    expect(constraintWords("key", "equals", "a")).toBe("key `a` only");
    expect(constraintWords("mode", "one_of", ["fast", "slow", "off"])).toBe("modes `fast`, `slow` or `off` only");
    expect(constraintWords("prefix", "regex", "[a-z]+/")).toBe("prefixes matching the JavaScript pattern `[a-z]+/` as a whole only");
    expect(constraintWords("query", "max_length", 40)).toBe("queries of at most 40 characters only");
  });

  it("renders args, docs, and effects from the manifest", () => {
    const text = helpForGrant(MEMORY, { commands: ["remember"], constraints: {}, label: "x", expiresAt: null }, "memory");
    expect(text).toContain("  town memory remember --key <string> [--value <string>]\n      Store a value under a key. (write)\n");
    expect(text).toContain("--key <string>    A path-like key. Required.");
    expect(text).toContain("--value <string>  The value. Reads stdin if omitted.");
  });

  it("leaves out a shop whose grant is not live: its credential removed, or a need it does not meet, and says nothing about either", async () => {
    store.addType({ name: "test-origin", origin: "http://127.0.0.1:9", header: "Authorization: Bearer {token}" });
    const teller = await loadShop(path.resolve(import.meta.dirname, "fixtures/teller-shop"), ["test-origin"]);
    store.upsertShop(teller);
    const c = store.addCredential({ userName: "dimitri", type: "test-origin", label: "the label", value: "the value" }, Buffer.alloc(32, 7));
    const { pass } = store.newPass("dimitri", "bound", null);
    store.newGrant({ passId: pass.id, shop: "town/memory", commands: ["recall"], constraints: {}, expiresAt: null });
    store.newGrant({ passId: pass.id, shop: "test/teller", commands: ["get"], constraints: {}, expiresAt: null, credentials: { "test-origin": c.id } });
    const live = helpForPass(store, pass);
    expect(live.split("\n").filter((l) => /^\S+\/\S+\s/.test(l)).map((l) => l.split(" ")[0])).toEqual(["test/teller", "town/memory"]);
    for (const word of ["credential", "test-origin", c.id, "the label", "the value", "token"]) expect(live, word).not.toContain(word);

    store.revokeCredential(c.id);
    const dead = helpForPass(store, pass);
    expect(dead).not.toContain("test/teller");
    expect(dead).toContain("town/memory");

    const unmet = store.newPass("dimitri", "unbound", null).pass;
    store.newGrant({ passId: unmet.id, shop: "test/teller", commands: ["get"], constraints: {}, expiresAt: null });
    expect(helpForPass(store, unmet)).toBe("This pass holds no grants.\n");
  });

  it("lists no grants for a pass that holds none", () => {
    const { pass } = store.newPass("dimitri", "nothing", null);
    expect(helpForPass(store, pass)).toBe("This pass holds no grants.\n");
  });
});
