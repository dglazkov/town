# Wagon — the design

**14 September 2026.** Wagon phase 0 built: `src/wagon.ts`, the states seam on both drivers, and `store export` and `store import` at the laptop; the wire and the box's checks are wagon phase 1's. The project's status lives in
[journey.md](journey.md)'s front matter. The journeys are the acceptance
suite, this doc is the argument, and [phases.md](phases.md) is the walk.
It is the star **wagon** of the
[sheep constellation](../../drafts/sheep-constellation.md), the second
half of the [night sky](../../drafts/night-sky.md)'s row 5, cut on the
evening [tent](../tent/design.md) closed: the two verbs
[box](../box/design.md) said were one verb away, `store export` and
`store import`, owed since the operator's box began holding users, a
consent, and grants that a redeploy keeps and a deletion loses.

The thesis in one line: **a town is its rows and its shops' files, and
nothing else; so a town can be packed whole into one document, the
wagon, carried by the operator's hand, and unpacked into an empty town
on a laptop or on a box, every pass and grant and sealed credential and
line of a shop's state arriving as it left, so that a backup is an
export and a move is an export and an import.**

Box left the store with one shape on two drivers: `node:sqlite` over a
file on a laptop, the object's SQLite on the box, the shops' files a
directory on one and a table on the other, their state a tree of files
on one and rows on the other, the vault's key a file on one and a
platform secret on the other. Every verb of the operator's runs over
that one shape, at the laptop with `--data` and over the wire with
`--town`. The wagon is two more such verbs, and needs no route, no
schema, and no format the town does not already have: it reads the
tables the schema names, writes them again, and carries a credential
the way the vault already carries one, sealed, under a key the operator
holds.

## The names

| Word | What it is | Where it lives |
| --- | --- | --- |
| the wagon | one JSON document holding a town: its header, and every user, pass, grant, shop with its files, credential type, credential, permit, call, and state file | `store export`'s stdout, `store import`'s stdin |
| the header | `wagon: 1`, the store's `schema`, the build that packed it, when, and where it came from: the laptop's `town.db` or the box's address | the wagon's first keys |
| the wagon's key | thirty-two bytes in a file of the operator's, `--key <file>`, under which every credential and every oauth client in the wagon is sealed; made by export when the file is missing, mode 600, and never printed | the operator's machine, never the box |
| the packing | each row read, each sealed value opened under the vault's key and sealed again under the wagon's, each shop's files read from the shelf, each state file read from where the driver keeps it | `src/wagon.ts` |
| the unpacking | the wagon read whole, checked whole, and written whole: files and state onto the shelf and the state root, rows in one transaction, each sealed value opened under the wagon's key and sealed again under this town's | `src/wagon.ts` |
| an empty town | one with no user, no pass, no grant, no credential, no permit, no call, no state, no shop but `town/hall`, and no type but the seeded; the only town an import writes to | the unpacking's first check |
| the states seam | how a store reads every state file it holds and puts one shop's and user's back: the tree under `<data>/state` on a laptop, `shop_state` rows under the box's root on the box | `StoreSeams.states`, in `src/store.ts` and `src/rows.ts` |
| `--no-audit` | an export that leaves the `calls` table behind, for a wagon that must fit the wire | `store export` |

## What stands today, read 14 Sep 2026

Read from `src/schema.ts`, `src/store.ts`, `src/rows.ts`, `src/vault.ts`,
`src/credentials.ts`, `src/admin.ts`, `src/wire.ts`, and `src/box.ts` at
`2548e93`.

- **The store is schema 7** over an `Sql`: `users`, `passes` (a
  `token_hash`, never a token), `grants`, `shops` (the manifest as text,
  `owner`, `tested_at`), `calls` (the audit, with `call_id`, `parent`,
  `wall`, `credentials`), `credential_types` (`kind`, `state`,
  `proposed_by`, `guidance`, `oauth`, and `client`, a sealed blob for an
  oauth type's registration), `credentials` (`sealed`, `scopes`,
  `revoked_why`), `permits`, and `meta` (`schema`, and `address`, the
  town's own). `openSchema` makes or migrates on open, and refuses a
  store newer than the code. `writeHall` writes `town/hall`'s row on
  every open, so no town is ever without it.
- **The vault seals per row**: AES-256-GCM, `nonce || ciphertext || tag`,
  the credential's id as the associated data, so a row opens under a
  key only for the id it was sealed for. `sealCredential(key, id,
  value)` and `openCredential(key, id, sealed)` take any thirty-two-byte
  key; a client's id is `client:<type>`. `sealedRows` counts credentials
  and clients together, and `requireKey` refuses a store with sealed
  rows and no key.
- **The shelf and the state differ by driver.** A laptop's shelf is
  `<data>/shops/<segment>`, `readTree` and `put`; the box's is
  `shop_files`. A laptop's state is `<data>/state/<shop>/<user>/…` as
  bytes, written by a subprocess or by `bin/main.js` in the wall; the
  box's is `shop_state` rows of text under the root `state`, and a
  shop's test runs under a scratch root the store removes after. No
  seam reads all of a store's state today; the runtime reads one shop's
  and one user's.
- **`townd admin` runs a verb three ways**: over `--data` at the laptop,
  in `main`; over `--town` through `pipe`, which posts `{ argv, stdin }`
  to `POST /admin` with the operator's bearer and prints the answer's
  `stdout`, `stderr`, and `exit`; and inside the box's object, `inTown`,
  where `--data`, `--town`, and `--wall` are refused, a verb that reads
  a directory reads a bundle on stdin as `-`, and `shop add` refuses
  `runtime: subprocess`. `readsStdin` names the verbs whose stdin the
  pipe reads. The door reads a body up to `BODY_LIMIT_BYTES`, eight
  megabytes, and a row on the platform holds two, `overRowLimit`.
  `src/admin.ts` is 560 lines against the wire of six hundred, and the
  type and credential verbs already live in `src/secrets.ts` as
  `secretVerb` for that reason.
- **The box's vault key is not on the laptop.** `pnpm box deploy` makes
  `TOWN_VAULT_KEY` as random hex on `wrangler secret put`'s stdin and
  keeps no copy; the operator's token goes to `~/.town/operator`, the
  key nowhere. A box deleted takes every credential it held with it,
  which is the thing to lose that box's design said an export is owed
  for.

## The wagon

One JSON document, pretty-printed, UTF-8, on stdout, so it crosses the
wire as a verb's `stdout` and comes back as a verb's `stdin` with no
route the town does not have. Its keys, in order:

```
wagon        1, the format's version
schema       7, the store's schema when packed
build        the town's build: the commit, or "laptop"
packed_at    milliseconds since the epoch
from         "<data>/town.db" at a laptop, the address on a box
audit        true, or false when --no-audit left calls behind
users        rows of users, as the table holds them
passes       rows of passes: the hash, never a token
grants       rows of grants
shops        rows of shops but town/hall, each with its files:
             [{ path, content, mode }], the shelf's map in order
types        rows of credential_types, client as base64 of the row
             sealed again under the wagon's key, or null
credentials  rows of credentials, sealed as base64 of the row sealed
             again under the wagon's key
permits      rows of permits
calls        rows of calls, oldest first; [] when audit is false
state        [{ shop, user, path, content }] or, for bytes that are
             not UTF-8 on a laptop, { shop, user, path, base64 }
```

Every row is its columns by the schema's names, a blob as base64, a
number as a number, null as null. Nothing in it is a secret but the
sealed values, and those open only under the wagon's key, which the
wagon never holds; a pass's `token_hash` is a hash, and a grant, a
permit, and a call are what `grant ls`, `permit show`, and `audit`
print. The wagon carries no `meta` (`schema` is in the header;
`address` is the town's own), no consent (the box's, transient, and
gone when its landing is), no scratch state, no vault key, and no
operator token. It carries `town/hall`'s grants and permits and calls
but not its row: the hall is the town's, written on open, at the
version of the town that opens it.

## The verbs

```
townd admin [--data <dir> | --town <url>] store export --key <file> [--no-audit]   > wagon.json
townd admin [--data <dir> | --town <url>] store import --key <file>                < wagon.json
```

`store` is a noun beside `user`, `pass`, `grant`, `shop`, `permit`,
`type`, and `credential`; its two verbs are `wagonVerb` in
`src/wagon.ts`, reached from `dispatch` in two lines, as the type and
credential verbs are reached in `src/secrets.ts`. `readsStdin` names
`store import`.

**`--key <file>` is read where townd runs, never on the box.** `main`
reads it before the verb runs anywhere: at the laptop, into the verb's
`Over`; over `--town`, into the request, as a `key` of hex beside
`argv` and `stdin`, with `--key <file>` taken out of `argv` as `--town`
is. The door hands `key` to the object with the verb, and `inTown`
puts it in `Over`; a `--key` that reaches the box in `argv` is refused
naming the pipe. The file is thirty-two bytes, as `vault.key` is, and
`readKey`'s refusal of a wrong size is reused; on export a missing file
is made, `randomBytes(32)` with mode 600, and stderr says the path and
that it is the only copy; on import a missing file is a refusal. `--key`
is required by both verbs, whether or not the store has a sealed row,
so the operator holds one key per wagon and never wonders. The key is
the operator's, like `~/.town/operator`: it goes over TLS with the
operator's bearer, as a credential's value goes on `credential add`'s
stdin today, and is written to no file the town keeps.

**`store export`** packs, over the store's seams and nothing else:
each table read in id order; each credential's `sealed` and each type's
`client` opened under the vault's key (`store.key.require`, so a store
with sealed rows and no key is refused as every verb refuses it) and
sealed again under the wagon's key with the same id, so a byte flipped
in the wagon is caught at import by the tag; each shop's files by
`shelf.read`; every state file by the states seam. It prints the wagon
on stdout and one line on stderr: the counts, `users 2, passes 3,
grants 5, shops 3, types 2, credentials 1, permits 0, calls 41, state
files 4`, and with `--no-audit`, `calls left behind: 41`. It writes
nothing; the standing box's audit after an export is the audit before.

**`store import`** unpacks, whole or not at all. In order, before a
byte is written:

1. The stdin is one JSON document whose `wagon` is 1; else the refusal
   names what it found.
2. Its `schema` is this town's `SCHEMA_VERSION`. Newer: `this wagon is
   schema 8, newer than this town's 7; run the town that made it`.
   Older: `this wagon is schema 6; open its town with this town's code,
   which migrates it, and export again`. The wagon has no migrations of
   its own, and the store's run on open, so the source is brought up to
   date and not the wagon.
3. On the box, the box's rules, each named with the shop, user, or path:
   every shop's manifest says `runtime: worker`, since the box runs an
   isolate alone and would refuse the shop on `shop add`; every state
   file is text, not `base64`, since the box's state is rows of text;
   every file and every state row is under the platform's row limit,
   `overRowLimit`'s line. These come before the town's emptiness because
   they are the wagon's and not the town's: a box emptied would still
   refuse such a wagon, so it is named at any box, the first time.
4. The town is empty, by the definition in the names table, else the
   refusal names what it holds, `this town holds 2 users and 3 shops;
   import writes into an empty town alone`. There is no merge: ids
   would collide or would not, and a wagon is a town, not a patch.
5. Every sealed value opens under the wagon's key: opened and counted,
   and a value that does not is `credential cred_x does not open under
   --key; the key is not the one this wagon was packed with, or the
   wagon is changed`, the vault's own refusal reworded, and the count.

Then the writing: files and state first, since without their rows they
are nothing, `shelf.put` per shop and the states seam per shop and
user; then every row in one transaction, `INSERT` by the schema's
column names with each sealed value opened under the wagon's key and
sealed under this town's (`store.key.ensure`, made on first need where
the source makes one, as `credential add` makes it), the seeded types
replaced by the wagon's rows of the same name. One line on stderr with
the same counts as export's. A failure while writing, the laptop's
disk full or a row refused, leaves the store's rows untouched by the
transaction and may leave files under `<data>/shops` or `<data>/state`;
the refusal says to remove the data directory and import again, and on
the box, to delete and redeploy. Ids are kept: a pass's hash is the
same, so **an agent's grant works at the new town with the address
changed in its grant file's `town`, or in `TOWN_GRANT`, and nothing
else**, and its state, its grants, and its calls are where it left
them.

**Over the wire**, the pipe refuses to post a body past
`BODY_LIMIT_BYTES` before posting it, naming the size, the limit, and
`--no-audit`, since the audit is the bulk of any town that has been
used. The door and the object change by one field, `key`. A wagon
exported from a box is an ordinary answer, printed as `stdout`.

## The states seam

`StoreSeams` gains `states`:

```ts
export interface States {
  /** Every state file the store holds, by shop, user, and path, in that order. */
  readAll(): Array<{ shop: string; user: string; path: string; content: Buffer }>;
  /** Puts one shop's and one user's state in place, whole; what was there is gone. */
  put(shop: string, user: string, files: ReadonlyMap<string, Buffer>): void;
}
```

The laptop's walks `<data>/state` with `segment` undone, each leaf a
file, and writes by `stateDir` with mode 700 and 600; the box's reads
and writes `shop_state` under `BOX_STATE_ROOT`, text both ways, and
`readAll` returns text as UTF-8 bytes. The runtime keeps reading one
shop's and one user's state the way it does; the seam is the wagon's
and the emptiness check's alone. `stateRoot` stays for the runtime.

## The box's part

`src/box.ts`'s door reads `key` from the body when it is a string of
sixty-four hex characters, and `Town.admin` takes it as a fourth
argument; `src/rows.ts`'s `objectStore` gains the box's `states`.
Nothing else on the box moves: no route, no table, no binding. That is
still the box's wire, so the phase that changes it proves it on a tent
by the account ring, and walks the import onto a tent kept by `--keep`
and struck after, never onto the standing box, which is not empty and
refuses the import by rule 4, which the walk types once to see.

## Tests

`test/helpers/store-suite.ts`, checkout ring in `test/store.test.ts`
and workerd in `test/object.test.ts`, gains the packing and unpacking
over both drivers: a store with two users, three passes, grants at
memory and github with a credential bound, a proposed type with a
client, a permit, ten calls with a tree, and state for two users,
packed with a key and unpacked into a store made new, and every table
read back the same but `meta`; the sealed values opened under the new
store's key give the old values; the hall's row is the new store's;
unpacking into the packed store refused as not empty; a wagon with a
byte of a sealed value flipped refused, nothing written; a wagon with
`schema` one up and one down refused with each sentence; a wagon that
is not one refused; the seeded type replaced, not doubled.

`test/wagon.test.ts`, command ring: two towns on free ports; the first
furnished by `townd admin --data` with a user, a pass, memory and
github, a credential, and `town memory remember` by the pass, so its
state is bytes on disk; `store export --key` into a file and `store
import --key` into the second's data directory; the second served, and
the same grant file with the second's address in `town`: `memory
recall` gives the line, `audit` shows the first's calls, `credential ls
--user` shows the credential live; `--no-audit`'s counts; import into
the first refused; a state file of bytes that are not UTF-8, written by
the test, carried as base64 and back; `--key` missing on import, and
made on export with the line on stderr and mode 600; the pipe's
refusal of a body over the limit with a fake fetch; `readsStdin` naming
`store import`.

`test/box.test.ts` or `test/object.test.ts`, box ring: a wagon from a
laptop-shaped store unpacked into the object through the door with
`key` in the body, a call by a pass from the wagon answered; a wagon
holding a `runtime: subprocess` shop refused naming it; one holding a
`base64` state file refused naming its path; a file over the row limit
refused; `store export` through the door printing the wagon as
`stdout`, and its `from` the address.

## What this does not do, on purpose

- **A merge.** Import writes into an empty town alone. Two towns made
  one is a project of its own, if ever, with the id and name collisions
  it must decide.
- **A wagon from an older schema.** The store migrates on open; the
  wagon does not. Open the old town with the new code, then export.
- **A schedule.** A backup on a clock is tempo's or a `cron` of the
  operator's: `townd admin --town <url> store export --key <file> >
  <date>.json`, one line.
- **Encrypting the wagon whole.** What is secret in it is sealed; the
  rest is what the operator's `ls` verbs print. An operator who wants
  the whole file sealed has `age` and `gpg`.
- **A `--since` on the audit, or a wagon in pieces.** `--no-audit` is
  the one relief for the wire's limit; an audit that outgrows a wagon
  is a finding for a project that pages it.
- **`box deploy --from <wagon>`.** A move is two verbs typed by the
  operator; the deploy stays the deploy.
- **A second person's own export.** The wagon is the operator's, whole.
  Citizen's, if a person may take their own consents with them.
- **Carrying the vault's key.** The wagon's key is the operator's and
  is made for the wagon; the vault's stays where it is, and the box's
  is never read out of the platform.

## Open questions

- Whether a wagon key per export is the right grain, or one key for
  every wagon an operator makes. The design makes one when the file is
  missing and reuses one that is there, so the operator chooses by
  naming the file, and the doc says so and nothing more.
- Whether the emptiness check should count `town/hall`'s permits and
  grants as emptiness broken. It does: an empty town has no pass, so it
  has neither.
- Whether the wire's eight megabytes will bind before an audit is a
  year old. The standing box's audit is hundreds of rows at this
  writing; the counts line on export says how far it has grown.
