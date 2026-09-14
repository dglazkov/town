// Secrets at the box: the operator's verbs by which a secret enters the
// town and is shown without its value. `type add`, `type approve`, `type
// ls`, and `type rm` over the credential types, an `oauth` type's
// registration given with `--client-id` and the client secret on stdin;
// `credential add` with the secret on stdin, refused at an `oauth` type;
// `credential connect`, the consent (src/consent.ts); `credential ls` with
// scopes and why a credential was revoked; and `credential rm`. `add` and
// `connect` take `--replace <credential>`: the new credential takes the
// old one's place under every unrevoked grant bound to it, and the old is
// revoked, `replaced by <new id>`, in one write, each grant moved printed
// on stderr. A value
// read here is sealed by the store and never printed. The admin's
// `dispatch` hands these verbs here with its parsed flags.

import { guidanceLine } from "./checklist.js";
import { UsageError, noExtra, one, type Io, type Parsed } from "./admin.js";
import { beginConsent, connect } from "./consent.js";
import { oauthRefusal, proposedRefusal, type Client, type CredentialType } from "./credentials.js";
import { table } from "./help.js";
import { isoTime } from "./notices.js";
import { StoreError, type Store } from "./store.js";

/** The most `credential add` reads from stdin. */
export const SECRET_LIMIT_BYTES = 64 * 1024;

/** A type or credential verb, `<noun> <verb>`, over the store; the exit code. */
export async function secretVerb(store: Store, key: string, args: string[], p: Parsed, io: Io, now: number): Promise<number> {
  switch (key) {
    case "type add": {
      noExtra(args, 1, "type add");
      const guidance = one(p, "guidance");
      const kind = one(p, "kind") ?? "token";
      if (kind !== "token" && kind !== "oauth") throw new UsageError(`--kind ${kind} is not a kind; write token or oauth`);
      const name = args[0]!;
      const base = { name, origin: one(p, "origin", true), header: one(p, "header", true), ...(guidance === undefined ? {} : { guidance }) };
      if (kind === "token") {
        for (const flag of ["authorize", "token", "scopes", "client-id"]) if (p.opts.has(flag)) throw new UsageError(`--${flag} is an oauth type's; write --kind oauth with it, or leave it out`);
        io.out(`added ${store.addType(base, now).name}\n`);
        return 0;
      }
      const oauth = { authorize: one(p, "authorize", true), token: one(p, "token", true), scopes: one(p, "scopes", true).split(",").map((x) => x.trim()).filter(Boolean) };
      const clientId = one(p, "client-id", true);
      if (store.getType(name)) throw new StoreError(`type ${name} already exists; townd admin type ls lists them`);
      const client = await readClient(io, clientId, "type add");
      io.out(`added ${store.addType({ ...base, oauth, client }, now, store.key.ensure()).name}\n`);
      return 0;
    }
    case "type approve": {
      noExtra(args, 1, "type approve");
      const clientId = one(p, "client-id");
      const t = store.checkApprove(args[0]!, clientId !== undefined);
      // What the operator approves, and the shop's words for what to make, before the secret is read.
      io.out(`${t.name}: ${t.kind === "oauth" ? "an" : "a"} ${t.kind} type, sent to ${t.origin} in ${t.header}\n`);
      if (t.oauth) io.out(`${t.name}: consent at ${t.oauth.authorize}, tokens from ${t.oauth.token}, scopes ${t.oauth.scopes.join(", ")}\n`);
      const said = guidanceLine(t);
      if (said) io.out(`${said}\n`);
      const registration = clientId === undefined ? undefined : { client: await readClient(io, clientId, "type approve"), key: store.key.ensure() };
      store.approveType(t.name, registration);
      io.out(`approved ${t.name}, proposed by ${t.proposedBy}; it is the town's${registration ? `, with client ${clientId} and its secret sealed` : ""}\n`);
      return 0;
    }
    case "type ls":
      noExtra(args, 0, "type ls");
      io.out(
        table(
          ["name", "kind", "state", "proposer", "origin", "header", "added", "oauth"],
          store.listTypes().map((t) => [t.name, t.kind, t.state, t.proposedBy ?? "-", t.origin, t.header, isoTime(t.addedAt), oauthText(t)]),
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
      if (t.kind === "oauth") throw new StoreError(oauthRefusal(t, userName));
      // A replacement refused writes nothing and reads nothing: before the guidance and the prompt.
      const replace = one(p, "replace");
      if (replace !== undefined) store.checkReplace(replace, userName, type);
      // What to paste, in the words of whoever wrote the type, before the prompt reads it.
      const said = guidanceLine(t);
      if (said) io.err(`${said}\n`);
      const value = await readSecret(io);
      const make = () => store.addCredential({ userName, type, label, value }, store.key.ensure(), now);
      if (replace === undefined) {
        io.out(`${make().id}\n`);
        return 0;
      }
      const { credential, moved } = store.replaceCredential(replace, make, now);
      io.out(`${credential.id}\n`);
      for (const g of moved) io.err(`${g.id} at ${g.shop} now uses ${credential.id}\n`);
      return 0;
    }
    case "credential connect": {
      noExtra(args, 0, "credential connect");
      const port = one(p, "port");
      const timeout = one(p, "timeout");
      if (port !== undefined && !/^\d{1,5}$/.test(port)) throw new UsageError(`--port ${port} is not a port; write a number from 0 to 65535, or leave it out for a free one`);
      const label = one(p, "label");
      const replace = one(p, "replace");
      if (io.consent) {
        // On the box the redirect lands at the town's own address: the consent is held for the landing, and the wire waits on it.
        if (port !== undefined) throw new UsageError("--port is a laptop's listener's; the box's landing is its own address");
        const req = { userName: one(p, "user", true), type: one(p, "type", true), ...(label === undefined ? {} : { label }), ...(replace === undefined ? {} : { replace }), ...(timeout === undefined ? {} : { timeoutMs: waitOf(timeout) }) };
        const { consent, lines } = beginConsent(store, () => store.key.ensure(), req, io.consent.redirect, (io.now ?? Date.now)());
        io.consent.hold(consent);
        for (const line of lines) io.err(`${line}\n`);
        return 0;
      }
      return connect(
        store,
        () => store.key.ensure(),
        { userName: one(p, "user", true), type: one(p, "type", true), ...(label === undefined ? {} : { label }), ...(replace === undefined ? {} : { replace }), ...(port === undefined ? {} : { port: Number(port) }), ...(timeout === undefined ? {} : { timeoutMs: waitOf(timeout) }) },
        io,
        io.now ?? Date.now,
      );
    }
    case "credential ls": {
      noExtra(args, 0, "credential ls");
      const userName = one(p, "user");
      if (userName !== undefined && !store.userByName(userName)) throw new StoreError(`user ${userName} does not exist; townd admin user ls lists them`);
      io.out(
        table(
          ["id", "user", "type", "label", "created", "state", "scopes", "grants"],
          store.listCredentials(userName).map((c) => [
            c.id,
            c.userName,
            c.type,
            c.label === "" ? "-" : c.label,
            isoTime(c.createdAt),
            c.revokedAt === null ? "active" : c.revokedWhy ? `revoked (${c.revokedWhy})` : "revoked",
            c.scopes.length ? c.scopes.join(",") : "-",
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

/** An `oauth` type's endpoints and scopes as one cell; `-` for a `token` type. */
function oauthText(t: CredentialType): string {
  return t.oauth ? `${t.oauth.authorize} ${t.oauth.token} ${t.oauth.scopes.join(",")}` : "-";
}

/** `--timeout`: `<n>m` or `<n>s`, in milliseconds. */
function waitOf(text: string): number {
  const m = /^(\d+)([ms])$/.exec(text);
  if (!m || Number(m[1]) === 0) throw new UsageError(`--timeout ${text} is not a wait; write one like 5m or 90s`);
  return Number(m[1]) * (m[2] === "m" ? 60_000 : 1000);
}

/**
 * A registration: `--client-id`, and the client secret on stdin, empty for
 * a public client. `verb` names who reads it, in the refusals. Exported for
 * `shop add`, which holds an `oauth` type the same way.
 */
export async function readClient(io: Io, id: string, verb: string): Promise<Client> {
  if (id.trim() === "") throw new UsageError("--client-id is empty; write the client id the provider gave the registration");
  return { id, secret: await readSecret(io, { verb, what: "the client secret", empty: true }) };
}

/**
 * The whole of stdin, less one trailing newline ("\n" or "\r\n"). Never
 * an argument and never the environment: a secret there would be in a
 * shell's history or a process list. Empty is refused unless `empty`.
 */
async function readSecret(io: Io, as: { verb: string; what: string; empty: boolean } = { verb: "credential add", what: "the secret", empty: false }): Promise<string> {
  if (!io.stdin) throw new StoreError(`${as.verb} reads ${as.what} on stdin, and there is none; pipe ${as.what} in`);
  if (io.stdin.isTTY) io.err(`townd admin: reading ${as.what} from stdin until end of input (Ctrl-D)\n`);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of io.stdin) {
    const b = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
    size += b.length;
    if (size > SECRET_LIMIT_BYTES) throw new StoreError(`${as.verb} read more than ${SECRET_LIMIT_BYTES} bytes on stdin, more than a credential; pipe ${as.what} alone`);
    chunks.push(b);
  }
  let value = Buffer.concat(chunks).toString("utf8");
  if (value.endsWith("\r\n")) value = value.slice(0, -2);
  else if (value.endsWith("\n")) value = value.slice(0, -1);
  if (value === "" && !as.empty) throw new StoreError(`${as.verb} read nothing on stdin; pipe ${as.what} in, since it is never an argument`);
  return value;
}
