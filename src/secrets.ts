// Secrets at the box: the operator's verbs by which a secret enters the
// town and is shown without its value. `type add`, `type approve`, `type
// ls`, and `type rm` over the credential types; `credential add` with the
// secret on stdin, `credential ls`, and `credential rm`. A value read here
// is sealed by the store and never printed. The admin's `dispatch` hands
// these verbs here with its parsed flags.

import { guidanceLine } from "./checklist.js";
import { proposedRefusal } from "./credentials.js";
import { UsageError, noExtra, one, type Io, type Parsed } from "./admin.js";
import { table } from "./help.js";
import { isoTime } from "./notices.js";
import { StoreError, type Store } from "./store.js";
import { ensureKey } from "./vault.js";

/** The most `credential add` reads from stdin. */
export const SECRET_LIMIT_BYTES = 64 * 1024;

/** A type or credential verb, `<noun> <verb>`, over the store; the exit code. */
export async function secretVerb(store: Store, key: string, args: string[], p: Parsed, io: Io, now: number): Promise<number> {
  switch (key) {
    case "type add": {
      noExtra(args, 1, "type add");
      const guidance = one(p, "guidance");
      const t = store.addType({ name: args[0]!, origin: one(p, "origin", true), header: one(p, "header", true), ...(guidance === undefined ? {} : { guidance }) }, now);
      io.out(`added ${t.name}\n`);
      return 0;
    }
    case "type approve": {
      noExtra(args, 1, "type approve");
      const t = store.approveType(args[0]!);
      io.out(`${t.name}: a ${t.kind} type, sent to ${t.origin} in ${t.header}\n`);
      const said = guidanceLine(t);
      if (said) io.out(`${said}\n`);
      io.out(`approved ${t.name}, proposed by ${t.proposedBy}; it is the town's\n`);
      return 0;
    }
    case "type ls":
      noExtra(args, 0, "type ls");
      io.out(
        table(
          ["name", "kind", "state", "proposer", "origin", "header", "added"],
          store.listTypes().map((t) => [t.name, t.kind, t.state, t.proposedBy ?? "-", t.origin, t.header, isoTime(t.addedAt)]),
        ),
      );
      return 0;
    case "type rm": {
      noExtra(args, 1, "type rm");
      store.removeType(args[0]!);
      io.out(`removed ${args[0]!}\n`);
      return 0;
    }

    case "credential add": {
      noExtra(args, 0, "credential add");
      const userName = one(p, "user", true);
      const type = one(p, "type", true);
      const label = one(p, "label") ?? "";
      if (!store.userByName(userName)) throw new StoreError(`user ${userName} does not exist; add it with townd admin user add ${userName}`);
      const t = store.getType(type);
      if (!t) {
        throw new StoreError(`type ${type} is not a type this town holds; write one of (${store.listTypes().map((t) => t.name).join(", ")}), or add it with townd admin type add`);
      }
      if (t.state === "proposed") throw new StoreError(proposedRefusal(t));
      // What to paste, in the words of whoever wrote the type, before the prompt reads it.
      const said = guidanceLine(t);
      if (said) io.err(`${said}\n`);
      const value = await readSecret(io);
      const c = store.addCredential({ userName, type, label, value }, ensureKey(store.dataDir), now);
      io.out(`${c.id}\n`);
      return 0;
    }
    case "credential ls": {
      noExtra(args, 0, "credential ls");
      const userName = one(p, "user");
      if (userName !== undefined && !store.userByName(userName)) throw new StoreError(`user ${userName} does not exist; townd admin user ls lists them`);
      io.out(
        table(
          ["id", "user", "type", "label", "created", "state", "grants"],
          store.listCredentials(userName).map((c) => [
            c.id,
            c.userName,
            c.type,
            c.label === "" ? "-" : c.label,
            isoTime(c.createdAt),
            c.revokedAt === null ? "active" : "revoked",
            c.grants.length ? c.grants.join(",") : "-",
          ]),
        ),
      );
      return 0;
    }
    case "credential rm": {
      noExtra(args, 1, "credential rm");
      const held = store.credentialById(args[0]!);
      const liveBefore = held ? store.liveOf(held.grants, now) : [];
      const c = store.revokeCredential(args[0]!, now);
      io.out(`revoked ${c.id}\n`);
      const stillLive = store.liveOf(liveBefore, now);
      for (const id of liveBefore.filter((g) => !stillLive.includes(g))) {
        io.out(`${id} at ${store.grantById(id)!.shop} is no longer live\n`);
      }
      return 0;
    }
  }
  throw new UsageError(`${key} is not a verb`);
}

/**
 * The whole of stdin, less one trailing newline ("\n" or "\r\n"). Never
 * an argument and never the environment: a secret there would be in a
 * shell's history or a process list.
 */
async function readSecret(io: Io): Promise<string> {
  if (!io.stdin) throw new StoreError("credential add reads the secret on stdin, and there is none; pipe the secret in");
  if (io.stdin.isTTY) io.err("townd admin: reading the secret from stdin until end of input (Ctrl-D)\n");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of io.stdin) {
    const b = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
    size += b.length;
    if (size > SECRET_LIMIT_BYTES) throw new StoreError(`credential add read more than ${SECRET_LIMIT_BYTES} bytes on stdin, more than a credential; pipe the secret alone`);
    chunks.push(b);
  }
  let value = Buffer.concat(chunks).toString("utf8");
  if (value.endsWith("\r\n")) value = value.slice(0, -2);
  else if (value.endsWith("\n")) value = value.slice(0, -1);
  if (value === "") throw new StoreError("credential add read nothing on stdin; pipe the secret in, since it is never an argument");
  return value;
}
