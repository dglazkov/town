# Box — the design

**13 September 2026.** Design. Nothing built. The project's status lives
in [journey.md](journey.md)'s front matter. The journeys are the
acceptance suite, this doc is the argument, and [phases.md](phases.md)
is the walk. It is cut from the draft's §14, §13, and §5 in
[../../drafts/town-design-doc.md](../../drafts/town-design-doc.md), and
built on what [gate](../gate/design.md), [wall](../wall/design.md), and
[consent](../consent/design.md) left: the runtime contract, the wall
behind a seam, the store, the admin's verbs over it, and a consent
whose shape was built for the split. Earlier docs call this the hosted
box and the box project; it is named here for the thing it adds.
Measured before this doc was written, in
[../../spikes/box/](../../spikes/box/README.md). Where this doc refines
the draft, it says so and why, and the draft stays as it was.

The thesis in one line: **the town leaves the laptop as one Worker, and
nothing an agent or a shop meets changes but where the process is. A
shop on the box runs in an isolate loaded for the call whose only way
out is the window the town opened for it; its state is a directory,
made before the call from rows and kept after; the store is the
object's own SQLite, sealed under a key the platform holds; the
operator types the same verbs at their own terminal with a token of
their own, and they run in the object; a consent lands at the town's
own address; and `town` does not change a byte.**

Six projects built the town on one laptop, and each said what that
cost. The town listens on loopback, so an agent must share the box
with it, and the data directory's safety is a rule about directories.
Consent's `connect` waits on loopback, so a person not at the box has
no way to connect a credential and a provider that refuses loopback
has no way in. And a sheep in a cell on Cloudflare cannot reach a
laptop at all, which is what the next project needs. The draft's §14
has the hosted town as one binary, Postgres, object storage, and a
container runtime on a machine somebody keeps up, and wall left a seam
for the Linux mechanism that would enclose a process there. This
project fills neither. It bets that the box is a Worker: one object
holding the store, a shop run in a fresh isolate with exactly the
bindings its manifest earns, and nothing native, nothing to patch, and
nothing to keep up. The bet is the draft's own §13.3 delivered: the
trust model holds when the sandbox enforces the manifest, and the
post-pilot answer there is a component whose imports are the manifest.
The Worker Loader is that today: an isolate whose `env` is what the
town puts in it and whose `fetch` goes where the town says or nowhere.
The reversal path is kept whole: `runtime: subprocess` on a laptop is
unchanged, the wall's seam is unmoved, and pen's container is a tier
beside the isolate for the day a shop needs a process on the box.

## The names

| Word | What it is | Where it lives |
| --- | --- | --- |
| the box | the town as one Worker on the operator's Cloudflare account, and the object in it | `wrangler.jsonc`; `src/box.ts` |
| the object | one Durable Object, `Town`, holding the store, the shelf, and every shop's state, and running the gate and the admin's verbs | `src/box.ts` |
| the door | the Worker's `fetch`: `GET /`, `POST /call` for an agent, `POST /admin` for the operator, `GET /consent/<state>` for a browser | `src/box.ts` |
| the sql seam | what the store needs of a database, and nothing more: `node:sqlite` on a laptop, the object's `ctx.storage.sql` on the box | `src/sql.ts`; the object's driver in `src/box.ts` |
| the shelf | where a shop's files are kept: a directory under the data directory on a laptop, rows in the object on the box | `src/shelf.ts` |
| the key | the vault's key: `vault.key` on a laptop, the `TOWN_VAULT_KEY` secret on the box | `src/vault.ts` |
| a worker shop | a shop whose `runtime` is `worker`: its program is a function the entry exports, run as a process on a laptop and in an isolate on the box | `manifest.runtime`; spec §7 |
| the isolate | a `runtime: worker` shop's process on the box: a Worker loaded for the call, its modules the shop's files and the town's entry, its `env` the contract's names, its outbound the window | `src/isolate.ts` |
| the entry | the town's module the isolate starts in: it lays the state down, sets the process up as Node would, calls the shop's `main`, and reports | `src/isolate.ts`, as source text |
| the window | the call's one way out on the box: an entrypoint made for the call with its `props`, set as the isolate's `globalOutbound`; a teller and a clerk by host | `Window` in `src/box.ts`; the forwarding rule in `src/window.ts` |
| the operator's token | the bearer `townd admin --town` sends: the `TOWN_OPERATOR` secret | `~/.town/operator`, or `$TOWN_OPERATOR` |
| the wire, for the operator | `POST /admin` with `{ argv, stdin }`, answered `{ stdout, stderr, exit }`, and `wait` for a consent | `src/box.ts`; `src/admin.ts` unchanged in what it runs |
| the landing | where a provider's redirect arrives on the box: `GET /consent/<state>` | `src/box.ts`; the flow in `src/consent.ts` |
| the deploy | `pnpm box deploy` and `pnpm box delete`: wrangler over the checkout, the two secrets made once | `scripts/box.mjs` |
| the box ring | the tests that run in workerd, through the vitest pool | `vitest.box.config.ts`; `test/*.test.ts` whose first line says `ring: box` |

Everything else keeps its name and place. The gate, the hall, the
permit, the checklist, the vault's seal, the teller, the clerk, the
audit, and the manifest's rules are what they were; the audit's `wall`
column gains a word.

## What the draft says, and what this project refines

**One Worker and one object, not one binary and Postgres.** The
draft's §14 has the hosted town as a binary, a database, a blob store,
and a container runtime. The town's store is a SQLite file with a
handful of tables, and the object has one of its own, synchronous, with
`json_each` and transactions: measured in the spike, the town's schema
ran as written and a transaction that failed on its second write left
no row. The shops' files are a few kilobytes each and are already sent
as a tar on stdin; rows hold them. So the box is one object, and the
Worker in front of it is a door and nothing more. One object is one
SQLite and one thread, which is the laptop's shape too, and the
pilot's. The store does not know which it is over: it asks a seam,
`Sql`, for `all`, `get`, `run`, `exec`, and `transaction`, and the seam
is `node:sqlite` on a laptop and `ctx.storage.sql` on the box. The
object's driver takes positional parameters alone, so the store's few
named ones become positional on both, and the file driver refuses a
named one so the laptop proves the box's rule; `BEGIN IMMEDIATE` becomes the
seam's `transaction`, which is `transactionSync` on the box.

**The wall is the absence of a binding.** Wall enclosed a process with
Seatbelt behind a seam, and said the Linux box brings its own
mechanism. The box brings none, because the isolate has nothing to
enclose: it is loaded per call with exactly what the town gives it. Its
modules are the shop's files and the entry; its `env` holds strings,
the contract's names, and no binding of the Worker's; its
`globalOutbound` is the window, an entrypoint made for this call, so
every `fetch` the shop makes arrives there with its full URL and is
forwarded when the URL is a window's and refused, 403 naming the call,
when it is not; a shop with no need is loaded with no outbound at all,
and its `fetch` throws. Measured: the shop saw five names in its
environment, `/bundle` as its directory, `localhost` as its host and
`/tmp/` as its home, imported `node:child_process` and could not spawn,
and could reach the window and nothing else. The draft's §13.2
mitigates threat 2 with a container and an egress allowlist; this is
the allowlist with no container and no list, since the only address is
the one the town made. The audit's `wall` column says `isolate` for a
call that ran there, so a reader of the audit knows which mechanism
held.

**A worker shop is a process shop whose program is a function.** The
four shops in `shops/` do their work at the module's top level,
`switch (command)` and `await` at column one, as a script does. The
spike found that workerd evaluates a module's top level as global
scope, with no I/O, no timers, and no clock, and does not wait for a
top-level `await`: `town/memory` loaded, ran to its first `await`, and
stopped, exit 0 and nothing written. The same source with its imports
kept and the rest wrapped as `export default async function main()`
ran every case of its tests, with `process.argv`, `process.env`,
`process.stdin`, `process.stdout`, `process.exit`, and `node:fs` on the
state all as on the laptop. So the manifest gains a second runtime,
`worker`, and spec §7 gains one paragraph: the same contract, with the
program as a function `main` the entry exports, called once per call,
and nothing at the top level but imports and definitions. A worker
shop runs on a laptop too, as a process under the town's own Node
through `bin/main.js`, which imports the entry and calls `main`, within
the wall as any process; so one shop runs on both boxes, and the four
seed shops become worker shops and keep every test. A subprocess shop
runs on a laptop alone, and the box refuses it at `shop add` and at
`publish` with the line that names the runtime to write. That line, and
the paragraph in §7, are what an agent reads; nothing else it meets
says which box it is on.

**The state is a directory on both boxes.** Spec §7 says `TOWN_STATE`
is a directory private to the shop and the user, made before the call,
and that it persists. The words hold on the box: the entry writes the
state's rows under `/tmp/state` before it calls `main`, and reads the
directory back after, and the object keeps what changed as rows keyed
by shop, user, and path. The spike measured a hundred files of two
kilobytes in, listed, and out at six milliseconds, the cost of one
call. The state is capped at eight megabytes, lamb's cap for a
workspace: a call that would leave more is the call's failure, the
line naming the cap, and the state stays as it was before the call. A
laptop's state stays on disk, uncapped, as it was.

**The operator is a token, and the verbs run in the object.** On a
laptop the operator's authority is the data directory: `townd admin
--data` opens the store. On the box the operator is whoever holds the
`TOWN_OPERATOR` secret, made at the deploy and shown once, and `townd
admin --town <url>` is a pipe: it posts `{ argv, stdin }` to `/admin`
with that bearer and prints what comes back, and `src/admin.ts` runs
the verb in the object over the object's store, with `io` captured
into the answer. The operator's binary stays the operator's, reaching
both boxes; the agent's binary reaches both and knows neither.
Whatever a verb reads from the box's disk on a laptop it reads from
stdin on the box: `shop add -` and `shop test -` take a bundle, the
tar the hall already reads, and `shop add <dir>` over `--town` is
refused naming the pipe to type. `--data` and `--town` together are
refused. A bearer that is not the operator's is answered 401 and the
pipe says `the operator token is refused`; no verb, no argv, and no
row.

**A consent lands at the town.** Consent's `connect` printed a URL and
listened on loopback for the redirect. On the box the redirect URI is
the town's own address, `https://<box>/consent`, which every provider
accepts, and the registration is of the web kind. `townd admin --town
credential connect` runs the verb in the object, which mints `state`
and the PKCE verifier, keeps a consent row, and answers with the
guidance and the URL and `wait`; the pipe prints them and waits on
`GET /admin/consent/<state>` with the operator's bearer, up to five
minutes, and prints the credential's id when the landing has sealed
it. The landing is `GET /consent/<state>`: it exchanges the code with
the type's registration, seals the tokens under the user the row
names, marks the row done, and answers the browser `connected; you can
close this tab`, as the listener did; a redirect with `error`, a
`state` the object does not hold, or one already done is refused in
the same words consent's listener used, and writes nothing. The flow
in `src/consent.ts` is the same flow with the listener taken out: the
URL, the exchange, the refresh, and the words. A laptop's `connect`
keeps its listener. The person who consents is still the operator,
since only the operator's terminal starts one; a person who is not the
operator is a later project's.

**One town, one operator, and users as hall left them.** The draft's
pilot is eight to twelve people on one hosted town, and the question
whether a town is one per person or shared was left open. This project
answers it as far as the sheep walk needs and no further: a box is one
operator's, deployed from their account, and it holds users as hall
made them, each with passes, so a second person's agent can be given a
grant today by the operator, and a second person's own way in, their
own token to their own consents and permits, is what remains of the
Square and a later project.

**The clock and the limits.** A call is thirty seconds of wall clock,
as on a laptop, raced against the isolate's RPC and disposed when it
loses, as pen's tier 1 does; and ten seconds of CPU, the loader's
limit, which the platform enforces and local workerd does not, as
pen phase 5 found. The town's clock on the box is the platform's;
`TOWN_TEST_CLOCK_OFFSET_MS` is a var the box ring alone sets.

## The seams

Three modules learn a second implementation, and each is named for
what the town needs of it and nothing more.

`src/sql.ts`:

```ts
export type SqlValue = string | number | bigint | Uint8Array | null;

export interface Sql {
  all<T>(sql: string, ...params: SqlValue[]): T[];
  get<T>(sql: string, ...params: SqlValue[]): T | undefined;
  run(sql: string, ...params: SqlValue[]): { changes: number };
  /** Many statements, no parameters: the schema and its migrations. */
  exec(text: string): void;
  /** `fn` whole or not at all. */
  transaction<T>(fn: () => T): T;
}

/** node:sqlite over a file, loaded without its warning. */
export function fileSql(file: string): Sql;
```

The object's driver, in `src/box.ts`, is the same five over
`ctx.storage.sql.exec(...).toArray()`, `rowsWritten`, and
`transactionSync`. `src/schema.ts` opens over an `Sql` and no longer
loads `node:sqlite` itself; `src/store.ts`, `src/credentials.ts`,
`src/audit.ts`, and `src/liveness.ts` write their queries against it,
positional throughout. A store is opened with an `Sql`, a `Shelf`, and
a key source; `openStore(dataDir)` on a laptop makes all three from the
directory as it does today.

`src/shelf.ts`:

```ts
export interface Shelf {
  /** A shop's files by path relative to its root, or null when the shelf holds none. */
  read(shop: string): Map<string, BundleFile> | null;
  /** Puts a shop's files in place, whole; what was there is gone. */
  put(shop: string, files: Map<string, BundleFile>): void;
  remove(shop: string): void;
  /** On a laptop, the directory a shop's process runs from; the box has none. */
  dir?(shop: string): string;
}

export function diskShelf(root: string): Shelf;   // <data>/shops/<segment>, as gate's shopDir names it
```

The object's shelf is a table, `shop_files`, name and path and content
and mode. `src/publish.ts`'s staging becomes the shelf's: a copy is
tested as a map of files, and put in place by name once it passes; the
subprocess runtime is handed `dir(shop)`, the isolate the map. The gate
hands the runtime the shop by name and the runtime asks the shelf.

`src/vault.ts` keeps its seal and its words and takes the key from a
source: the file on a laptop, made by the first verb that needs it as
today; the `TOWN_VAULT_KEY` secret on the box, thirty-two bytes as hex,
made by the deploy and never by the town. A box whose secret is
missing refuses to open a sealed row with vault's `KEY_MISSING` words
and the secret's name. It is what vault said it was: a seatbelt, not a
boundary. The platform holds the secret and the rows in two places and
can read both; the shop can read neither, which is the property the
town promises.

`src/window.ts` holds the rule the teller has followed since vault,
moved out of `src/teller.ts` so the box can follow it too: the origin
and header parsed, the path and query appended to the origin, the
header set from the token, hop-by-hop headers dropped. The teller's
listener imports it; the box's `Window` applies it and forwards with
`fetch`.

## The isolate

`src/isolate.ts`:

```ts
/** The entry, as source text: loaded beside the shop's files as the isolate's main module. */
export const ENTRY_SOURCE: string;

export interface IsolateOptions extends RunOptions {
  /** The state's rows before the call, by path. */
  state: Map<string, string>;
  /** A window for the call, made by the caller with the call's props; null for a shop with no need and no dependency. */
  outbound: Fetcher | null;
  loader: WorkerLoader;
}

export interface IsolateResult extends RunResult {
  /** The state after the call, by path; what the object keeps. */
  state: Map<string, string>;
}

export function runIsolate(files: Map<string, BundleFile>, manifest: Manifest, command: string, args: ArgValues, opts: IsolateOptions): Promise<IsolateResult>;
```

`runIsolate` is the runtime the gate is given on the box, in place of
`run`. It loads a Worker with `compatibilityDate` the box's own; the
entry as `mainModule`; every file of the shop as a module under its
own path, code as `js` or `cjs` by Node's rule and everything else as
bytes, as pen's tier 1 does; `env` of the contract's names alone,
`TOWN_USER`, `TOWN_CREDENTIAL_<TYPE>` as `http://window/<nonce>` per
need, and `TOWN_GRANT` as `/tmp/grant` for a shop with dependencies;
`globalOutbound` the window, or null; and `limits` of ten seconds of
CPU and a hundred subrequests. It calls the entry's `run(argv, stdin,
state, grant)` over RPC, races it against thirty seconds and the
call's abort, disposes the stub when they win, and maps a load error,
which is how a syntax error in the shop arrives, to exit 1 with the
runtime's line on stderr. A shop whose entry exports no `main` is exit
1 with the line spec §7 gives.

The entry writes the state under `/tmp/state` and the grant, when
given, at `/tmp/grant`; sets `process.argv` to `node`, the entry's
path, and the canonical argv; sets `process.env` from its own `env`
and `TOWN_STATE`; replaces `process.stdin` with a stream of the call's
stdin; captures `process.stdout` and `process.stderr`; makes
`process.exit` throw; imports the shop's entry and awaits its `main`;
and returns what was printed, the exit, and the state's files. It is
plain JavaScript in a string, as pen's is, and the box ring is what
checks it.

## The window

`Window` in `src/box.ts` is a `WorkerEntrypoint` whose `props` are the
call's: the call's id, the nonce, and per need the type, origin,
header, and token; and for a shop with dependencies the caller the
clerk would carry, the pass, the manifest, the parent, and the depth.
The object makes one per call with `this.ctx.exports.Window({ props })`
and hands it to `runIsolate` as the outbound. Its `fetch` reads the
URL: `http://window/<nonce>/…` is forwarded to the need's origin by the
rule in `src/window.ts`, with the token set in the header and the
request counted; `http://clerk/<nonce>/call` with the call's bearer is
a shop's own call, decided by the object's gate as the caller one
deeper and recorded under the parent, which is compose's clerk with
the listener taken out; anything else is 403 naming the call. The
token rides in the props, in the town's own isolate, and never in the
shop's `env`. A clerk call re-enters the object while the object waits
on the isolate's RPC, which the platform allows and the box ring proves.

## The object and the door

`Town` in `src/box.ts` is a Durable Object named `town`, one per box.
On first use it opens the store over its own SQL, the shelf in its
rows, and the key from the secret, and runs the schema's migrations, so
a box made by this code holds what a laptop's data directory holds.
Its methods are the door's three: `call(token, body)`, the gate and
one audit row, as `handleCall` is; `admin(argv, stdin)`, `src/admin.ts`'s
`main` with `io` captured and the wall chooser answering `isolate`;
and `consent(state, query)`, the landing. The gate's `GateDeps` on the
box are the store, the vault over the store and the secret, `runIsolate`
as the runtime, and `decideAndRecord` as today.

The Worker's `fetch` is the door, and it is small: `GET /` answers
`town`; `POST /call` reads the bearer and the body as `src/clerk.ts`'s
`parseCall` does and calls the object; `POST /admin` compares the
bearer to the operator's secret in constant time and calls the object;
`GET /admin/consent/<state>` waits on the object; `GET /consent/<state>`
calls the landing; and anything else is 404. Every answer carries
`x-town-build`, the commit the deploy was made from, so the operator
can see what answered. The agent's binary posts to `/call` as it always
has, over TLS the platform terminates, with the pass's token as the
bearer and the box's address in the grant file.

## The operator, over the wire

`townd admin --town <url> <verb …>` reads the operator's token from
`$TOWN_OPERATOR` or `~/.town/operator`, refuses without one naming
both, posts `{ argv, stdin }` and prints the answer. Every verb that
takes a directory takes `-` instead over `--town` and reads the bundle
from stdin: `tar --format ustar -cf - -C shops/memory . | townd admin
--town <url> shop add - --user dimitri`. The verbs, their refusals, and
their printouts are `src/admin.ts`'s and do not change; `--wall` over
`--town` is refused, since the box's wall is not the operator's to
choose. The README's operator section gains one line per verb whose
shape changes and says the rest is the same.

## The deploy

`pnpm box deploy [--name <worker>]`, `scripts/box.mjs`:

1. **Nothing without the token.** `CLOUDFLARE_API_TOKEN` absent: print
   what the command needs, the token's permissions by name, that
   Durable Objects with SQLite and the Worker Loader are what the
   Worker uses, and exit 2. This is station's rule and its sentence.
2. **The deploy.** `wrangler deploy` from the checkout over
   `wrangler.jsonc`, the Worker named `town` or `--name`, the build's
   commit defined in. Wrangler is a devDependency and bundles the
   Worker itself; the deploy pulls no image and builds nothing native.
3. **The secrets, once.** When `wrangler secret list` shows none:
   thirty-two random bytes as hex to `TOWN_VAULT_KEY`, and a token to
   `TOWN_OPERATOR`, each on stdin; the operator's token written to
   `~/.town/operator` with mode 600 and printed once. A redeploy keeps
   both.
4. **The report.** The address, `GET /` answering `town`, the build,
   and the one line to type next, `townd admin --town <url> user add`.

`pnpm box delete [--name <worker>]` waits for the Worker's name typed
on a terminal, as station's does, and deletes it; the object's rows go
with it, and `~/.town/operator` is removed when it was this box's.
There is no upgrade but a redeploy, and no second environment.

## The audit

The `wall` column, schema 7, takes a third word: `isolate`, for a call
whose process was an isolate on the box; `seatbelt` and `none` are a
laptop's, `-` a call decided before any process. `townd admin audit`
prints it as before, over the wire as at the box. A call's `detail`
gains nothing; the state's cap, when it bites, is a `shop-error` with
its line in `stderr` as any shop failure is.

## Testing it

- **checkout**: `src/sql.ts`'s file driver, each of the five over a
  file, a transaction rolled back, and a named parameter refused, since
  the object's driver would bind it null and say nothing; the store's tests as they are over
  it, and positional throughout; `src/shelf.ts`'s disk shelf, put and
  read and removed, and a name escaped as `stateDir` escapes it;
  `src/window.ts`'s rule, the teller's tests moved to it and the teller
  still passing; the manifest's `runtime: worker`, a shop with it
  validated and one with `runtime: box` refused naming the two;
  `bin/main.js` through the runtime under the box's wall, the four
  shops as worker shops passing every test they passed as subprocess
  shops, a `main` that throws as exit 1, one that returns 3 as exit 3,
  one that exits as it exits; `src/isolate.ts`'s module table for a
  shop's files, code and bytes. In process, vitest, fast.
- **box**: in workerd through the vitest pool, `vitest.box.config.ts`,
  the loader bound as pen binds it: the object's SQL driver under the
  store's own tests, so the two drivers are proved by one suite; the
  shelf in rows; the key from the secret and the refusal without it;
  `runIsolate` with the four worker shops through the door with a fake
  origin at `fetchMock`, every test of theirs passing; the state in and
  out, and the cap; a window request forwarded with its header and a
  request past it refused, and no outbound at all for a shop with no
  need; the prying shop from wall as a worker shop, printing its
  directory and its state and every refusal, the exfil test turned
  around a second time; `town/watch` calling `town/github` and
  `town/memory` through the clerk's host, recorded as a tree; the
  hall's `publish` of a worker shop and its refusal of a subprocess
  shop; the door's four routes, the operator's bearer refused, and
  `parseCall`'s refusals; the landing with a fake authorization server
  at `fetchMock`; a top-level `await` in a shop's entry and the line it
  gets. The CPU limit is skipped by name, as pen's is.
- **command**: `test/dev.test.ts`, a `wrangler dev` started on a free
  port with the secrets set as vars, the built `town` in a scratch
  directory with a grant file naming it, and the built `townd admin
  --town` typing the operator's journey: the user, the shop from a tar,
  the pass, the grant, `town --help`, `town memory remember`, the audit
  with its `isolate` column, and a subprocess shop refused. Slow and
  alone in its file; the ring's other files are unchanged.
- **by hand, ⚑ provision**: `pnpm box deploy` on the operator's
  account to a throwaway name; the operator's journey typed against it
  from this laptop; a Google registration of the web kind with the
  box's landing as its redirect, `town/gdocs` added over the wire on a
  consent that lands there, one document read; `pnpm box delete`.
  Then the operator's own box, `town`, which stays.
- **the walk, ⚑ provision**: a real Claude Code session on this laptop
  with a grant file naming the deployed box, a hall grant and a memory
  grant; asked to write a shop that reports what it can see of where
  it runs and put it in the town and run it, wall's task on the box;
  then to read a Google document's first line; the transcript read for
  what it said about `runtime: worker` and about what its shop could
  reach; the audit read over the wire for `isolate` on every row that
  ran; `grep -r` for the tokens over the transcript and the directory.
  One model session, well under a dollar.

## What this does not do, on purpose

- **A Linux wall.** `wallOnThisBox()` stays null on Linux and the
  seam stays empty; a box is a Worker, and a laptop is a Mac. A person
  who serves the town on a Linux machine writes `--wall none` and is
  told what that means, as wall said.
- **A process on the box.** `runtime: subprocess` is refused there.
  Pen's container is the tier for it, started beside the object for
  the length of a call, and it is a project of its own when a shop
  needs a program the isolate lacks.
- **One object per shop and user.** The state is rows in the one
  object; a shop that wakes on its own, delegation's, is what needs an
  object with an alarm, and it names that split.
- **A second person's own way in.** Their token, their consents, their
  permits: the Square's remainder, a project after the sheep walk.
- **A custom domain, a second environment, or an upgrade path.** The
  Worker's `workers.dev` address, one environment, and a redeploy.
- **Backups.** The object's rows are the platform's to keep; an export
  verb is owed when there is something to lose.
- **A store moved from a laptop to a box.** A box starts empty and the
  operator adds shops and users over the wire; the shape of the rows
  is the same, and a `store export` and `import` are one verb away.
- **The OAuth relay.** §14's v.NEXT: a box's registrations are the
  operator's own, as consent said.
- **Rate limits, quotas, and cost.** Measured in the walk, recorded as
  findings, and the platform's until they bite.
- **Hiding the platform.** `os.hostname()` says `localhost` and
  `/bundle` is the shop's directory; what the runtime says of itself
  is the runtime's.
