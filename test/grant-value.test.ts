// ring: command
// Road's journey 2, an operator hands a grant as a value, steps 1 to 4
// against a town on a free port with a data directory made and deleted
// here. The agent's `town` runs from an empty directory with a HOME of its
// own, TOWN_GRANT set to what each step names: the JSON `pass new` printed,
// a path, or what yields no grant: a value beginning with `{` that is not
// one, a bare token, a path to no grant file, or nothing. Two passes
// tell the grants apart by their help: one holds a grant at memory, the
// other none. The refusal's bad values hold a token or a path holding a
// secret, and their bytes are asserted absent from both streams, with and
// without --json; a path typed to --grant, or found walking up, is still named.

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MEMORY, TOWN, assertBuilt, cleanEnv, cleanup, serve, tmp, type Ran, type Town } from "./helpers/town.js";

const BAD_VALUE = 'error: $TOWN_GRANT holds no grant of the form { "town": <url>, "token": <token> }, nor the path of a file holding one';
const NO_GRANT = "error: no grant file: this command reads --grant <path>, $TOWN_GRANT as a grant or a path to one, .town/grant here or in a directory above, or ~/.town/grant";
const NO_GRANTS = "This pass holds no grants.\n";

const made: string[] = [];
let town: Town;
/** The JSON `pass new` printed for the pass with a grant at memory, and for the pass with none. */
let held: string;
let bare: string;
/** Each of those written to a grant file of its own. */
let heldFile: string;
let bareFile: string;

function track(p: string): string {
  made.push(p);
  return p;
}

/** `town` from `cwd` (an empty directory unless named) with a HOME of its own, stdin closed, and TOWN_GRANT as given or unset. */
function agentTown(args: string[], opts: { grant?: string; cwd?: string; home?: string } = {}): Ran {
  const home = opts.home ?? track(tmp("grant-value-home"));
  const cwd = opts.cwd ?? track(tmp("grant-value-agent"));
  // cleanEnv deletes TOWN_GRANT after adding what it is given, so the value is set on what it returns.
  const env = cleanEnv(home);
  if (opts.grant !== undefined) env.TOWN_GRANT = opts.grant;
  const r = spawnSync(process.execPath, [TOWN, ...args], { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 });
  return { stdout: r.stdout, stderr: r.stderr, exit: r.status ?? -1 };
}

/** A directory holding `.town/grant` with `contents`. */
function withGrantFile(contents: string): string {
  const dir = track(tmp("grant-value-walk"));
  mkdirSync(path.join(dir, ".town"));
  writeFileSync(path.join(dir, ".town", "grant"), contents);
  return dir;
}

function passNew(label: string): { grant: string; id: string } {
  const r = town.admin("pass", "new", "--user", "u", "--label", label);
  expect(r.exit, r.stderr).toBe(0);
  return { grant: r.stdout, id: r.stderr.trim() };
}

beforeAll(async () => {
  assertBuilt();
  const root = track(tmp("grant-value"));
  town = await serve(path.join(root, "town"));
  const user = town.admin("user", "add", "u");
  expect(user.exit, user.stderr).toBe(0);
  const shop = town.admin("shop", "add", MEMORY);
  expect(shop.exit, shop.stderr).toBe(0);
  const withGrant = passNew("held");
  held = withGrant.grant;
  bare = passNew("bare").grant;
  const grant = town.admin("grant", "new", "--pass", withGrant.id, "--shop", "town/memory");
  expect(grant.exit, grant.stderr).toBe(0);
  heldFile = path.join(root, "held.grant");
  bareFile = path.join(root, "bare.grant");
  writeFileSync(heldFile, held);
  writeFileSync(bareFile, bare);
}, 120_000);

afterAll(async () => {
  await town?.stop();
  cleanup(...made, ...(town ? [town.env.HOME!] : []));
});

/** Help for the pass with a grant at memory: exit 0, memory named, and not the bare pass's line. */
function expectHeldHelp(r: Ran): void {
  expect([r.exit, r.stderr], r.stderr).toEqual([0, ""]);
  expect(r.stdout).toContain("memory");
  expect(r.stdout).not.toBe(NO_GRANTS);
}

function expectBareHelp(r: Ran): void {
  expect([r.exit, r.stdout, r.stderr]).toEqual([0, NO_GRANTS, ""]);
}

describe("road's journey 2: an operator hands a grant as a value", () => {
  it("step 1: TOWN_GRANT holding what pass new printed, from a directory with no grant file above it and none at home, prints help for the pass's grants, exit 0", () => {
    expect(held.trimStart().startsWith("{")).toBe(true);
    expectHeldHelp(agentTown(["--help"], { grant: held }));
    // White space before the `{` is still a value, as a shell's quoting or a secret store may leave it.
    expectHeldHelp(agentTown(["--help"], { grant: `\n  ${held.trim()}` }));
    expectBareHelp(agentTown(["--help"], { grant: bare }));
  });

  it("step 2: TOWN_GRANT holding a path names a grant file; --grant wins over TOWN_GRANT; TOWN_GRANT, value or path, wins over a grant file found by walking up", () => {
    // A path, as today.
    expectHeldHelp(agentTown(["--help"], { grant: heldFile }));
    expectBareHelp(agentTown(["--help"], { grant: bareFile }));

    // --grant <path> over TOWN_GRANT, as a value and as a path.
    expectBareHelp(agentTown(["--grant", bareFile, "--help"], { grant: held }));
    expectBareHelp(agentTown([`--grant=${bareFile}`, "--help"], { grant: heldFile }));
    // --grant wins even over a TOWN_GRANT value that is not a grant: the value is never read.
    expectBareHelp(agentTown(["--grant", bareFile, "--help"], { grant: "{ not a grant" }));

    // TOWN_GRANT over .town/grant here, over one in a directory above, and over ~/.town/grant.
    const walked = withGrantFile(bare);
    expectHeldHelp(agentTown(["--help"], { grant: held, cwd: walked }));
    expectHeldHelp(agentTown(["--help"], { grant: heldFile, cwd: walked }));
    const below = path.join(walked, "a", "b");
    mkdirSync(below, { recursive: true });
    expectHeldHelp(agentTown(["--help"], { grant: held, cwd: below }));
    const home = withGrantFile(bare);
    expectHeldHelp(agentTown(["--help"], { grant: held, home }));
    // And with TOWN_GRANT unset, the walk up finds what it found before.
    expectBareHelp(agentTown(["--help"], { cwd: below }));
  });

  describe("step 3: TOWN_GRANT that yields no grant, a `{` value that is not one or a path that names no grant file, is refused, exit 3, in one line that prints none of what it holds", () => {
    const SECRET = "sekrit-abc-7f3e91d2";
    const realToken = () => (JSON.parse(held) as { token: string }).token;
    /** A file under a fresh directory whose name holds a secret, so a line naming the path would print it. */
    const secretPath = (contents?: string) => {
      const file = path.join(track(tmp("grant-value-path")), `grant-${SECRET}`);
      if (contents !== undefined) writeFileSync(file, contents);
      return file;
    };
    /** Each case: its name, and what TOWN_GRANT holds with the texts that must appear on neither stream. */
    const cases: Array<[string, () => { value: string; hidden: string[] }]> = [
      ["a JSON syntax error", () => ({ value: `{"town":"http://127.0.0.1:1","token":"${SECRET}"}x`, hidden: [SECRET] })],
      ["a grant missing its token", () => ({ value: `{"town":"http://127.0.0.1:1","tokn":"${SECRET}"}`, hidden: [SECRET] })],
      ["an empty token beside a secret", () => ({ value: `{"town":"http://127.0.0.1:1","token":"","note":"${SECRET}"}`, hidden: [SECRET] })],
      ["a town that is not a URL", () => ({ value: `{"town":"${SECRET}","token":"${SECRET}"}`, hidden: [SECRET] })],
      // A real pass's grant cut short: the token the town would honour is what must not be printed.
      ["a real grant cut short", () => ({ value: held.trim().slice(0, -1), hidden: [realToken()] })],
      // Not a `{` value, so read as a path: a token pasted where the grant was meant names no file.
      ["a bare token", () => ({ value: "sk-live-abc123", hidden: ["sk-live-abc123"] })],
      ["a real pass's bare token", () => ({ value: realToken(), hidden: [realToken()] })],
      ["a path to a missing file", () => {
        const file = secretPath();
        return { value: file, hidden: [file, SECRET] };
      }],
      ["a path to a file that is not a grant", () => {
        const file = secretPath(`token=${realToken()}\n`);
        return { value: file, hidden: [file, SECRET, realToken()] };
      }],
      ["a path to a directory", () => {
        const dir = track(tmp(`grant-value-${SECRET}`));
        return { value: dir, hidden: [dir, SECRET] };
      }],
      ["an empty TOWN_GRANT", () => ({ value: "", hidden: [] })],
    ];

    function expectHidden(r: Ran, hidden: string[]): void {
      for (const h of hidden) {
        expect(r.stdout).not.toContain(h);
        expect(r.stderr).not.toContain(h);
      }
    }

    it.each(cases)("%s, on stderr", (_name, make) => {
      const { value, hidden } = make();
      const r = agentTown(["--help"], { grant: value });
      expectHidden(r, hidden);
      expect(r.exit).toBe(3);
      expect(r.stdout).toBe("");
      expect(r.stderr).toBe(`${BAD_VALUE}\n`);
    });

    it.each(cases)("%s, with --json, the same line in the envelope", (_name, make) => {
      const { value, hidden } = make();
      const r = agentTown(["--json", "--help"], { grant: value });
      expectHidden(r, hidden);
      expect(r.exit).toBe(3);
      expect(r.stderr).toBe("");
      expect(JSON.parse(r.stdout)).toEqual({ ok: false, output: "", notices: [], exit: 3, error: BAD_VALUE });
    });

    it("a path typed to --grant, or found by the walk up, that names no grant file is still named, with and without --json", () => {
      const missing = secretPath();
      const named = `error: ${missing} is not a grant file of the form { "town": <url>, "token": <token> }`;
      expect(agentTown(["--grant", missing, "--help"])).toEqual({ exit: 3, stdout: "", stderr: `${named}\n` });
      const j = agentTown(["--json", "--grant", missing, "--help"]);
      expect([j.exit, j.stderr]).toEqual([3, ""]);
      expect(JSON.parse(j.stdout)).toEqual({ ok: false, output: "", notices: [], exit: 3, error: named });
      // --grant wins over TOWN_GRANT, so its own path is what the line names.
      expect(agentTown(["--grant", missing, "--help"], { grant: held }).stderr).toBe(`${named}\n`);
      const walked = withGrantFile("not a grant");
      // The walked file is named as the binary resolves it, so the line is matched by its tail and the refusal's words.
      const w = agentTown(["--help"], { cwd: walked });
      expect([w.exit, w.stdout]).toEqual([3, ""]);
      expect(w.stderr).toMatch(/^error: \/\S+\/\.town\/grant is not a grant file of the form \{ "town": <url>, "token": <token> \}\n$/);
      expect(w.stderr).toContain(path.basename(walked));
    });
  });

  it("step 4: with no grant anywhere, the one line says TOWN_GRANT is read as a grant or a path to one, exit 3, and with --json in the envelope", () => {
    const r = agentTown(["--help"]);
    expect([r.exit, r.stdout, r.stderr]).toEqual([3, "", `${NO_GRANT}\n`]);
    expect(r.stderr).toContain("$TOWN_GRANT as a grant or a path to one");
    const j = agentTown(["--json", "--help"]);
    expect([j.exit, j.stderr]).toEqual([3, ""]);
    expect(JSON.parse(j.stdout)).toEqual({ ok: false, output: "", notices: [], exit: 3, error: NO_GRANT });
  });
});
