// Publishing, with two front doors. The operator's: `shop test` runs a
// shop's tests from its directory, and `shop add` copies the directory
// into the town, tests the copy with the operator's tree, and puts it in
// place with no owner. The hall's: `sendShop` writes a bundle's files to
// the same staging, tests the copy with the agent's tree, and, for a
// publish, puts it in place with the agent's user as owner. Both refuse a
// copy holding anything but plain files, and every shop in the town has
// every dependency it declares, so a shop that would break a dependent is
// refused; and both name the grants that stop being live.

import { cp, lstat, mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { Io } from "./admin.js";
import type { BundleFile } from "./bundle.js";
import { shopDir, type GateDeps } from "./gate.js";
import { bindNeeds, grantStateText } from "./grants.js";
import { HALL_NAME, type Manifest } from "./manifest.js";
import type { RunCredential } from "./runtime.js";
import { ManifestRefused, loadShop, testShop, townShops, treeOf, type TestResult } from "./shoptest.js";
import { StoreError, type Pass, type Store } from "./store.js";
import { VaultError } from "./vault.js";
import type { Wall } from "./wall.js";

/** `shop add`'s words for a manifest named as the town's own shop; `runtime: town` is the validator's refusal. */
const HALL_REFUSAL = `${HALL_NAME} is the town's own shop, in every town from its first open; name the shop under another namespace`;

/** Whose credentials a shop's tests run on: `--user`, read when it is needed, and the `--credential` ids picked. */
export interface Picked {
  user: () => string | undefined;
  credentials: readonly string[];
}

/** The shops in the town, other than `name`, that declare a dependency on it. */
export function dependentsOf(store: Store, name: string): Array<{ name: string; commands: string[] }> {
  return store
    .listShops()
    .filter((s) => s.name !== name)
    .flatMap((s) => (s.manifest.depends ?? []).filter((d) => d.shop === name).map((d) => ({ name: s.name, commands: d.commands })));
}

/**
 * Why adding `manifest` would break the rule that every shop in the town
 * has every dependency it declares: a loop through the town's shops back
 * to it, or a command a dependent declares of it that it no longer has.
 * Null when neither.
 */
export function breaksDependents(store: Store, manifest: Manifest): string | null {
  const name = manifest.name;
  const byName = new Map(store.listShops().map((s) => [s.name, s.manifest]));
  byName.set(name, manifest);
  const walk = (at: string, trail: string[]): string[] | null => {
    for (const d of byName.get(at)?.depends ?? []) {
      if (d.shop === name) return [...trail, name];
      if (trail.includes(d.shop)) continue;
      const found = walk(d.shop, [...trail, d.shop]);
      if (found) return found;
    }
    return null;
  };
  const loop = walk(name, [name]);
  if (loop) {
    return `${name} would close a loop, ${loop.join(" -> ")}; a shop cannot depend on a shop that depends on it, so take ${loop[1]} out of its depends`;
  }
  const commands = manifest.commands.map((c) => c.name);
  const dropped = dependentsOf(store, name).map((d) => ({ ...d, missing: d.commands.filter((c) => !commands.includes(c)) })).filter((d) => d.missing.length);
  if (dropped.length) {
    const said = dropped.map((d) => `${d.name} calls ${d.missing.join(", ")}`).join("; ");
    return `${name} would not have every command its dependents declare of it: ${said}; keep ${dropped.length === 1 && dropped[0]!.missing.length === 1 ? "it" : "them"} in ${name}, or add ${dropped.map((d) => d.name).join(", ")} again without ${dropped.length === 1 && dropped[0]!.missing.length === 1 ? "it" : "them"} first`;
  }
  return null;
}

/**
 * `shop test <dir> [--user <name>]`: the shop's tests, one line each. With
 * no data directory, a manifest with needs or dependencies is refused
 * naming --data. With one, needs are checked against the town's types and
 * dependencies against its shops, and each need of the tree, the shop's
 * and its dependencies', is met by the user's one live credential of the
 * type, opened for the run and handed to the runtime, which opens a teller
 * per need. The tree runs over the dependencies' code in the town.
 */
export async function shopTest(town: { store: Store; key: Buffer | null } | null, dir: string, picked: Picked, io: Io, wall: Wall): Promise<number> {
  const refuse = (line: string) => {
    io.err(`townd admin: shop test refused: ${line}\n`);
    return 1;
  };
  try {
    if (!town) return report(await testShop(dir, { wall }), io);
    const { store, key } = town;
    const types = store.listTypes().map((t) => t.name);
    const shops = townShops(store);
    const manifest = await loadShop(dir, types, shops);
    const met = meetNeeds(store, key, manifest.name, treeOf(manifest, store).needs, picked.user(), picked.credentials);
    if (typeof met === "string") return refuse(met);
    return report(await testShop(dir, { types, shops, store, credentials: met, wall }), io);
  } catch (err) {
    if (err instanceof ManifestRefused) {
      for (const line of err.refusals) io.err(`${line}\n`);
      return 1;
    }
    throw err;
  }
}

function report(results: Array<{ name: string; ok: boolean; why?: string }>, io: Io): number {
  for (const r of results) io.out(r.ok ? `ok ${r.name}\n` : `not ok ${r.name}: ${r.why}\n`);
  return results.every((r) => r.ok) ? 0 : 1;
}

/** The credentials that meet `needs` on `userName`'s behalf (bindNeeds), opened; or the line refusing. */
function meetNeeds(store: Store, key: Buffer | null, shop: string, needs: string[], userName: string | undefined, picked: readonly string[]): RunCredential[] | string {
  if (needs.length === 0) {
    if (userName !== undefined) return `${shop} has no credentials to meet; leave out --user`;
    return picked.length ? `${shop} has no credentials to meet, so --credential binds nothing; leave it out` : [];
  }
  if (userName === undefined) {
    return `${shop} needs ${needs.join(", ")}; write --user <name> for whose credential${needs.length === 1 ? "" : "s"} its tests run on`;
  }
  const user = store.userByName(userName);
  if (!user) return `user ${userName} does not exist; townd admin user ls lists them`;
  const bound = bindNeeds(store, user, shop, needs, picked);
  if (typeof bound === "string") return bound;
  const out: RunCredential[] = [];
  for (const type of needs) {
    const t = store.getType(type)!;
    if (!key) throw new VaultError(`the vault's key is missing and credential ${bound[type]!} is sealed by it`);
    out.push({ type, origin: t.origin, header: t.header, token: store.openCredential(bound[type]!, key) });
  }
  return out;
}

/**
 * Anything in a shop directory that is not a plain file or a directory:
 * a symbolic link could reach outside the shop once copied, so it is
 * refused, and so is a socket or a pipe. Paths relative to `root`.
 */
export async function strangeEntries(root: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const st = await lstat(full);
      if (st.isDirectory()) await walk(full);
      else if (!st.isFile()) out.push(path.relative(root, full));
    }
  };
  await walk(root);
  return out;
}

/**
 * `shop add <dir> [--user <name>]`: refuse links, validate the manifest,
 * meet its needs with the user's credentials as `shop test` does, copy the
 * directory to a staging place under the data directory, run the shop's
 * tests against the copy (the code that will run), then put the copy in
 * place and upsert the row. Latest only: a second add replaces the first,
 * and when it adds a need, the grants that stop being live are named.
 */
export async function shopAdd(store: Store, key: Buffer | null, dir: string, picked: Picked, io: Io, now: number, wall: Wall): Promise<number> {
  const src = path.resolve(dir);
  const refuse = (line: string) => {
    io.err(`townd admin: shop add refused: ${line}\n`);
    return 1;
  };
  const st = await lstat(src).catch(() => null);
  if (!st?.isDirectory()) return refuse(`${dir} is not a directory; write the path of a shop's directory`);
  const strange = await strangeEntries(src);
  if (strange.length) {
    return refuse(`${strange.map((s) => path.join(dir, s)).join(", ")} ${strange.length === 1 ? "is" : "are"} not a plain file; a shop is copied whole into the town, so put the file itself there instead of a link`);
  }
  const types = store.listTypes().map((t) => t.name);
  const shops = townShops(store);
  let needs: string[];
  let credentials: RunCredential[];
  try {
    const manifest = await loadShop(src, types, shops);
    if (manifest.name === HALL_NAME) return refuse(HALL_REFUSAL);
    const broken = breaksDependents(store, manifest);
    if (broken) return refuse(broken);
    needs = treeOf(manifest, store).needs;
    const met = meetNeeds(store, key, manifest.name, needs, picked.user(), picked.credentials);
    if (typeof met === "string") return refuse(met);
    credentials = met;
  } catch (err) {
    if (err instanceof ManifestRefused) {
      for (const line of err.refusals) io.err(`${line}\n`);
      return refuse(`the manifest has ${err.refusals.length === 1 ? "a mistake" : `${err.refusals.length} mistakes`}, above`);
    }
    throw err;
  }

  const staging = await newStaging(store);
  try {
    await cp(src, staging, {
      recursive: true,
      verbatimSymlinks: true,
      filter: async (from) => {
        const s = await lstat(from);
        if (!s.isDirectory() && !s.isFile()) throw new StoreError(`${from} became something other than a plain file while it was copied`);
        return true;
      },
    });
    const manifest = await checkCopy(store, staging, types, shops);
    if (typeof manifest === "string") return refuse(manifest);
    if (treeOf(manifest, store).needs.join(",") !== needs.join(",")) return refuse(`${manifest.name} changed its needs while it was copied`);
    const results = await testShop(staging, { types, shops, store, wall, ...(credentials.length ? { credentials } : {}) });
    for (const r of results) io.out(r.ok ? `ok ${r.name}\n` : `not ok ${r.name}: ${r.why}\n`);
    const failing = results.filter((r) => !r.ok);
    if (failing.length) {
      return refuse(`${manifest.name}'s test${failing.length === 1 ? "" : "s"} ${failing.map((r) => `'${r.name}'`).join(", ")} failed; fix the shop and add it again`);
    }
    const stopped = await putInPlace(store, staging, manifest, null, now);
    io.out(`added ${manifest.name} ${manifest.version}\n`);
    for (const line of stopped) io.out(`${line}\n`);
    return 0;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

/** A new staging directory under the town's shops, mode 700, for one shop's copy. */
async function newStaging(store: Store): Promise<string> {
  await mkdir(store.shopsDir, { recursive: true });
  const staging = path.join(store.shopsDir, `.staging-${randomBytes(6).toString("hex")}`);
  await mkdir(staging, { mode: 0o700 });
  return staging;
}

/**
 * The checks of a shop's copy, both doors': nothing in it but plain files
 * and directories, its manifest read from the copy against the town's
 * types and shops (ManifestRefused thrown), not named as the town's own,
 * and breaking no dependent. The manifest, or the line refusing.
 */
async function checkCopy(store: Store, staging: string, types: readonly string[], shops: ReturnType<typeof townShops>): Promise<Manifest | string> {
  const late = await strangeEntries(staging);
  if (late.length) return `${late.join(", ")} is not a plain file in the copy`;
  const manifest = await loadShop(staging, types, shops);
  if (manifest.name === HALL_NAME) return HALL_REFUSAL;
  return breaksDependents(store, manifest) ?? manifest;
}

/**
 * The copy put in place, both doors': the shop's directory moved aside,
 * the copy moved in, the row upserted with `owner`, the old directory
 * removed. Then the grants at the shop live before and not after, one line
 * each, and a line on what to do when one binds no credential.
 */
async function putInPlace(store: Store, staging: string, manifest: Manifest, owner: string | null, now: number): Promise<string[]> {
  const final = shopDir(store, manifest.name);
  const old = `${staging}-old`;
  const had = await lstat(final).then(() => true, () => false);
  const liveBefore = store.liveGrantsAt(manifest.name, now).map((g) => g.id);
  if (had) await rename(final, old);
  await rename(staging, final);
  store.upsertShop(manifest, now, owner);
  if (had) await rm(old, { recursive: true, force: true });
  const stillLive = store.liveOf(liveBefore, now);
  const states = liveBefore.filter((id) => !stillLive.includes(id)).map((id) => ({ id, state: store.grantState(id, now)! }));
  const lines = states.map(({ id, state }) => {
    const why = state.kind === "lacks" ? `${grantStateText(store, store.grantById(id)!, state, now).replace(/^not live: /, "")}, a dependency the shop gained` : "it binds no credential for a need the shop gained";
    return `${id} at ${manifest.name} is no longer live: ${why}`;
  });
  if (states.some((x) => x.state.kind === "unmet")) lines.push("a grant made again with townd admin grant new binds a credential for each need");
  return lines;
}

/** What the hall's door did with a sent shop: its tests' results, and for a publish whose tests all passed, the lines naming the grants that stopped being live; `kept` false otherwise. */
export type Sent = { manifest: Manifest; results: TestResult[]; kept: boolean; stopped: string[] } | { refused: string[] };

/**
 * The hall's front door, publishing steps 6 to 8: the bundle's files
 * written to a staging directory under the town's shops, mode 700, and
 * read back as a shop, the manifest read from the copy the one used from
 * here; its tests run from the copy as the agent's pass, each in a scratch
 * state root of its own, every call below decided and recorded by `deps`
 * under `parent`; and, when `keep` and every test passed, the copy moved
 * into place with the pass's user as owner. The staging is removed on
 * every path, and the shop already in the town is untouched until the move.
 */
export async function sendShop(deps: GateDeps, req: { pass: Pass; files: ReadonlyMap<string, BundleFile>; parent: string; keep: boolean }, now: number): Promise<Sent> {
  const { store } = deps;
  const types = store.listTypes().map((t) => t.name);
  const shops = townShops(store);
  const staging = await newStaging(store);
  try {
    for (const [rel, file] of req.files) {
      const to = path.resolve(staging, rel);
      if (!to.startsWith(staging + path.sep)) return { refused: [`${JSON.stringify(rel)}: is outside the shop in the copy`] };
      await mkdir(path.dirname(to), { recursive: true, mode: 0o700 });
      await writeFile(to, file.content, { mode: file.mode & 0o100 ? 0o700 : 0o600, flag: "wx" });
    }
    let manifest: Manifest | string;
    try {
      manifest = await checkCopy(store, staging, types, shops);
    } catch (err) {
      if (err instanceof ManifestRefused) return { refused: err.refusals };
      throw err;
    }
    if (typeof manifest === "string") return { refused: [manifest] };
    const timeout = deps.timeoutMs === undefined ? {} : { timeoutMs: deps.timeoutMs };
    const results = await testShop(staging, { types, shops, store, ...timeout, wall: deps.wall, agent: { deps, pass: req.pass, parent: req.parent } });
    if (!req.keep || results.some((r) => !r.ok)) return { manifest, results, kept: false, stopped: [] };
    const stopped = await putInPlace(store, staging, manifest, req.pass.userId, now);
    return { manifest, results, kept: true, stopped };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
