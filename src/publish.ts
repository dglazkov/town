// Publishing, the operator's front door: `shop test` runs a shop's tests
// from its directory, and `shop add` copies the directory into the town,
// tests the copy, and puts it in place. Every shop in the town has every
// dependency it declares, so an add that would break a dependent is
// refused, and the grants that stop being live are named.

import { cp, lstat, mkdir, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { Io } from "./admin.js";
import { shopDir } from "./gate.js";
import { bindNeeds, grantStateText } from "./grants.js";
import { HALL_NAME, type Manifest } from "./manifest.js";
import type { RunCredential } from "./runtime.js";
import { ManifestRefused, loadShop, testShop, townShops, treeOf } from "./shoptest.js";
import { StoreError, type Store } from "./store.js";
import { VaultError } from "./vault.js";

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
function breaksDependents(store: Store, manifest: Manifest): string | null {
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
export async function shopTest(town: { store: Store; key: Buffer | null } | null, dir: string, picked: Picked, io: Io): Promise<number> {
  const refuse = (line: string) => {
    io.err(`townd admin: shop test refused: ${line}\n`);
    return 1;
  };
  try {
    if (!town) return report(await testShop(dir), io);
    const { store, key } = town;
    const types = store.listTypes().map((t) => t.name);
    const shops = townShops(store);
    const manifest = await loadShop(dir, types, shops);
    const met = meetNeeds(store, key, manifest.name, treeOf(manifest, store).needs, picked.user(), picked.credentials);
    if (typeof met === "string") return refuse(met);
    return report(await testShop(dir, { types, shops, store, credentials: met }), io);
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
export async function shopAdd(store: Store, key: Buffer | null, dir: string, picked: Picked, io: Io, now: number): Promise<number> {
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

  await mkdir(store.shopsDir, { recursive: true });
  const staging = path.join(store.shopsDir, `.staging-${randomBytes(6).toString("hex")}`);
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
    const late = await strangeEntries(staging);
    if (late.length) return refuse(`${late.join(", ")} is not a plain file in the copy`);
    const manifest = await loadShop(staging, types, shops);
    if (manifest.name === HALL_NAME) return refuse(HALL_REFUSAL);
    if (treeOf(manifest, store).needs.join(",") !== needs.join(",")) return refuse(`${manifest.name} changed its needs while it was copied`);
    const brokenInCopy = breaksDependents(store, manifest);
    if (brokenInCopy) return refuse(brokenInCopy);
    const results = await testShop(staging, { types, shops, store, ...(credentials.length ? { credentials } : {}) });
    for (const r of results) io.out(r.ok ? `ok ${r.name}\n` : `not ok ${r.name}: ${r.why}\n`);
    const failing = results.filter((r) => !r.ok);
    if (failing.length) {
      return refuse(`${manifest.name}'s test${failing.length === 1 ? "" : "s"} ${failing.map((r) => `'${r.name}'`).join(", ")} failed; fix the shop and add it again`);
    }
    const final = shopDir(store, manifest.name);
    const old = `${staging}-old`;
    const had = await lstat(final).then(() => true, () => false);
    const liveBefore = store.liveGrantsAt(manifest.name, now).map((g) => g.id);
    if (had) await rename(final, old);
    await rename(staging, final);
    store.upsertShop(manifest, now);
    if (had) await rm(old, { recursive: true, force: true });
    io.out(`added ${manifest.name} ${manifest.version}\n`);
    const stillLive = store.liveOf(liveBefore, now);
    const stopped = liveBefore.filter((id) => !stillLive.includes(id));
    if (stopped.length) {
      const states = stopped.map((id) => ({ id, state: store.grantState(id, now)! }));
      for (const { id, state } of states) {
        const why = state.kind === "lacks" ? `${grantStateText(store, store.grantById(id)!, state, now).replace(/^not live: /, "")}, a dependency the shop gained` : "it binds no credential for a need the shop gained";
        io.out(`${id} at ${manifest.name} is no longer live: ${why}\n`);
      }
      if (states.some((x) => x.state.kind === "unmet")) io.out(`a grant made again with townd admin grant new binds a credential for each need\n`);
    }
    return 0;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
