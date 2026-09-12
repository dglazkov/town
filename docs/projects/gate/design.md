# Gate — the design

**12 September 2026.** Design. Gate phase 0 built. The project's status lives
in [journey.md](journey.md)'s front matter. The journeys are the
acceptance suite, this doc is the argument, and [phases.md](phases.md)
is the walk. The draft this is cut from is
[../../drafts/town-design-doc.md](../../drafts/town-design-doc.md); where
this doc refines the draft, it says so and why, and the draft stays as
it was.

The thesis in one line: **a grant file in a directory is a capability.
The town resolves who is calling, what they may do, and what they may
see before any shop runs; the `town` command carries argv one way and
output the other and knows nothing; and the operator at the box is the
whole human side until there is a Square.**

The draft's pilot (§16) is a hosted town, a Square with OAuth, Town Hall,
a container runtime with an egress proxy, three seed shops, and
telemetry. That is several short projects. This is the first, and it is
cut to the thesis and nothing else: if the grant-as-CLI model is wrong,
it is wrong here, with one shop that needs no credential and one person
who is also the operator. Everything the draft says about credentials,
authoring, and evolution is built on top of what this project leaves:
the manifest, the gate, the runtime's contract, the audit, and the
notice channel.

## The names

| Word | What it is | Where it lives |
| --- | --- | --- |
| the town | one process, HTTP on a loopback port, a data directory | `src/server.ts`, `townd serve` |
| the data directory | the whole state: the database, shops' code, shops' state | `<data>/town.db`, `<data>/shops/`, `<data>/state/` |
| the store | the tables and the queries over `node:sqlite` | `src/store.ts` |
| a manifest | a shop's declaration, v0 | `src/manifest.ts`; `townd spec` prints the spec |
| the runtime | runs a shop's entry as a process under the contract | `src/runtime.ts` |
| the gate | bearer to pass, pass to grant, grant to allow or deny | `src/gate.ts` |
| a pass | the token an agent holds, for a user, with a label | `passes` table; `.town/grant` carries it |
| a grant | one pass at one shop: commands and constraints | `grants` table |
| a constraint | a kind and a value on one command's argument | `src/constraints.ts` |
| help | rendered from the manifest for the calling pass | `src/help.ts` |
| a notice | a line the town writes for the agent | `src/notices.ts`; stderr, or `notices` in `--json` |
| the audit | one row per call | `calls` table; `townd admin audit` |
| the command | the thin client, the agent's binary | `src/cli.ts`, `bin/town.js` |
| the daemon | the operator's binary: `serve`, `admin`, `spec` | `src/townd.ts`, `bin/townd.js` |
| the admin | the operator's verbs over the store | `src/admin.ts`, `townd admin` |
| the memory shop | the one shop, built to the contract | `shops/memory/` |

One package at the repo root, TypeScript compiled by `tsc` to `dist/`,
two entries, `bin/town.js` and `bin/townd.js`, tests by vitest. Node 24, `node:http`,
`node:sqlite`, a YAML parser, and nothing that compiles.

## What the draft says, and what this project refines

**A pass holds grants.** The draft's §6.2 makes a grant per user per
shop and its §6.1 makes the grant file carry one token; its Appendix A
then shows one grant file reaching three shops. The reconciliation: the
token names a **pass**, the agent's identity as the town sees it, and a
pass holds one **grant** per shop. `town --help` lists the pass's
grants; revoking a grant removes a shop from the pass; revoking the pass
makes the file paper. The grant file's shape is the draft's, `{ "town":
<url>, "token": <token> }`, and its name stays `grant`, since to the
agent it is one.

**The operator is the human.** The draft's Square (§11) is where a human
connects credentials and approves grants. This project has no
credentials and one human, so the human's interface is `townd admin` at
the box, against the data directory. Every verb the Square will have is
an admin verb first: users, passes, grants, shops, the audit. The
Square, when it comes, is a renderer over the same store, and the admin
stays as the operator's surface for self-host.

**No credentials, no dependencies, this project.** A manifest declaring
either is refused by the validator with a line naming the project that
brings it. The runtime contract leaves room for both: the environment a
shop gets is closed, so a credential-injecting proxy or a scoped handle
is an addition to it, not a change.

**Latest only.** A shop has one version in the town; `shop add` again
replaces it. Version ranges and capability-diff approvals are the
draft's v1.

## The manifest

`manifest.yaml`, v0, as the draft's §7.2 minus what this project
refuses:

```yaml
name: town/memory
version: 0.1.0
summary: Remember and recall short notes by key.
guidance: |
  Keys are paths, `notes/lunch`; `list --prefix notes/` shows what is
  under one. Values are one line; for more, pipe stdin to `remember`.
runtime: subprocess
entry: ./main.mjs
commands:
  - name: remember
    summary: Store a value under a key.
    effect: write
    args:
      - { name: key, type: string, required: true, doc: "A path-like key.", constrainable: [prefix, regex, max_length] }
      - { name: value, type: string, doc: "The value. Reads stdin if omitted." }
    output: text
  - name: recall
    summary: Print the value under a key.
    effect: read
    args:
      - { name: key, type: string, required: true, constrainable: [prefix, regex] }
    output: text
  - name: list
    summary: List keys, optionally under a prefix.
    effect: read
    args:
      - { name: prefix, type: string, constrainable: [prefix] }
    output: text
  - name: forget
    summary: Delete a key.
    effect: destructive
    args:
      - { name: key, type: string, required: true, constrainable: [prefix] }
    output: text
tests:
  - name: roundtrip
    run: |
      remember --key t/a --value hello
      recall --key t/a
    expect: { contains: hello }
  - name: forget removes
    run: |
      remember --key t/b --value x
      forget --key t/b
      recall --key t/b
    expect: { exit: 1 }
  - name: list under a prefix
    run: |
      remember --key notes/lunch --value soup
      remember --key notes/dinner --value rice
      remember --key todo/call --value mom
      list --prefix notes/
    expect: { equals: "notes/dinner\nnotes/lunch" }
  - name: recall of a missing key fails
    run: |
      recall --key never/set
    expect: { exit: 1 }
  - name: a key outside the state is refused
    run: |
      remember --key ../escape --value x
    expect: { exit: 1 }
```

Types are `string`, `int`, `bool`, `enum` with `values`. `effect` is
`read`, `write`, or `destructive`. `output` is `text` or `json`.
`constrainable` names which of the built-in kinds a grant may put on the
argument; a grant naming any other is refused when made. `tests[].run`
is lines of `<command> <args>`, words split as a shell would with quotes
and nothing expanded, each parsed against the manifest and run in order
through the runtime against one scratch state. Every line but the last
must exit 0; `expect` is one of `contains`, `equals` (on the last line's
stdout), or `exit` (its exit code). An argument's `default` fills it when
omitted; `enum` lists its `values`. A `bool` is `--name true|false` in
canonical argv. `tests` is required and not empty: the draft's `tests:
manual` has no town to be manual in yet.

`townd spec` prints the spec: the fields, the types, the runtime contract,
one full example. It is the whole SDK, and the validator's every message
points at the part of it to reread. The draft's rule holds: a validator
error that does not say what to write instead is a bug in the spec.

## The runtime contract

The runtime runs a shop's `entry` from the shop's directory as a child
process:

- **argv**: the command, then the arguments in canonical form, `--name
  value` in manifest order, defaults filled, enums and ints already
  checked. A shop parses argv and nothing more clever.
- **entry**: a `.mjs` or `.js` entry runs under the town's own Node;
  any other file is executed directly and must be executable.
- **environment**: exactly three names. `TOWN_STATE`, a directory made
  on first call and private to this shop and this user; `TOWN_USER`, an
  opaque id; `PATH`, the town's own. Nothing else from the town's own
  environment reaches the shop; the command is `argv[0]` and the shop
  knows its own name.
- **stdin**: the call's stdin, as the command sent it; past one megabyte
  the call is refused before the entry runs, since a truncated value is
  a corrupt one.
- **stdout**: the result, passed to the agent as it is.
- **stderr**: the shop's own log, kept on the audit row. On a nonzero
  exit the agent sees `error: town/memory recall failed` and the last
  lines of it on stderr, exit 1.
- **exit code**: 0 is success; anything else is exit 1 at the agent.
- **time**: thirty seconds, then the entry and anything it started are
  killed, exit 1, the audit row saying so.

In the pilot draft this is a container with an egress allowlist; here
it is a process, and the sandbox is a promise, as the draft's §13.3 says
it is until it is a mechanism. What this project makes true is the
shape: everything a shop gets is on this list, so the mechanism, when
it comes, replaces the process and keeps the list.

## The gate

Every call is `POST /call` with a bearer and `{ "argv": [...], "stdin":
<string or null>, "json": <bool> }`, answered with `{ "stdout", "stderr",
"exit" }`. The gate, in order, before anything runs:

1. **The bearer to a pass.** The token's hash looked up in `passes`.
   Missing, revoked, or expired: exit 3, one line on stderr, an audit
   row with no shop.
2. **The argv to a shop and a command.** `argv[0]` is a shop the pass
   holds a grant for, by its full name or by its last segment when no
   other grant of the pass shares it (`memory` for `town/memory`), or
   `--help`. A shop with no grant is the same line as a command with
   none, "not available to this grant": the pass is not told what it
   cannot have. The operator's words `serve`, `admin`, and `spec` are
   the one exception: no shop may be named them, and the gate answers
   them as a usage error, exit 1, saying `town` has no such command,
   which tells the pass nothing about the town.
3. **The command to the grant.** Not in the grant's `commands`: exit 2,
   the one line. `--help` at a shop renders for the grant.
4. **The arguments to the manifest.** Parsed against the command's
   `args`: required present, types right, no strays. A miss is exit 1
   with `usage:` rendered for the grant.
5. **The arguments to the constraints.** Each of the grant's constraints
   on this command, checked by kind. A miss is exit 2 and a line naming
   the argument and the rule.
6. **The runtime.** Only now does a process exist.

The order is the draft's rule that discovery and enforcement are one
mechanism: the same function that decides whether `forget` runs decides
whether `--help` shows it. Denials are one sentence each, from one
module, enumerated by a test.

**Constraints** are `{ "<command>.<arg>": { "<kind>": <value> } }` on the
grant, as the draft writes them. The five kinds are `equals`, `one_of`,
`prefix`, `regex`, `max_length`, all on strings, with `int` accepting
`equals` and `one_of`. Shop-defined kinds (`in_folder`) need the shop to
run the check, and a shop runs after the gate; that is the draft's §7.4
and a later project, when there is a shop that needs one.

**Help** is rendered on the server for the calling pass. `town --help`:
one line per grant, the shop's name, its summary, its allowed commands
in brackets. `town <shop> --help`: summary, guidance, each allowed
command with its arguments and doc, then the grant's label, expiry, and
constraints in words. A test renders every subset of memory's four
commands and asserts each rendering names exactly that subset.

**Notices** are lines the town, never a shop, writes: `town-notice:
<kind> key=value …`, a continuation indented. This project has two
kinds, `grant-expires` and `pass-expires`, each when under seven days
remain, and the
channel is built to the draft's §8.3 so `deprecated` and
`better-shop-exists` are rows added later. In `--json` mode the envelope
is `{ "ok", "output", "notices": [...], "exit" }` and stderr is empty.

**The audit** is one row per call: the pass, the shop, the command, a
SHA-256 of the canonical argv, the result class (`ok`, `denied`,
`invalid-pass`, `usage`, `shop-error`, `timeout`), the exit, the
latency, the notices, and the shop's stderr. Arguments are never stored;
the draft's telemetry (§12.3) needs the shape of failures, not their
content.

## The command

`bin/town.js` reads the grant file, in the draft's order: `--grant
<path>`, `$TOWN_GRANT`, `./.town/grant` walking up, `~/.town/grant`. It
posts argv, stdin when stdin is not a terminal, and the `--json` flag,
prints stdout to stdout and stderr to stderr, and exits with the code
it was given. Its two flags are taken wherever they stand in argv, so
`--json` at the end of a call is the command's; the spec reserves
`json`, `grant`, and `help` as argument names no shop may declare. It
parses nothing else. A guard reads
`src/cli.ts` for the name of any shop, command, or argument and fails on
one; the command must be the same file when the town holds a hundred
shops.

**Two binaries, one per audience.** `townd` holds `serve`, `admin`, and
`spec`: the draft's "one binary" for the service, and the self-host
story, since `localhost` is a town. `town` holds nothing but the pipe.
The split is the thesis taken literally: the thing handed to an agent
contains the agent's surface and no other, so there is no operator verb
to discover, and the client is the same file when the town holds a
hundred shops. Town Hall, later, serves `spec` over the wire to a hall
grant, so an authoring agent reads it without holding the operator's
binary.

**What the binaries do not decide.** The authority is not in either
file. The agent's is the grant file; the operator's is the data
directory, and `townd` with no data directory reaches no town: `spec`
and `shop test` read nothing of one, and every other verb needs `--data`. On one box,
the agent's filesystem reaches the data directory through the harness,
and it could widen its own grant with `townd admin` or with `sqlite3`
alone. That is colocation, the harness's ambient authority, and the
draft already leaves local authority to the harness (§2). The town's
rule is the one it can keep: the data directory is never under a
directory an agent works in. An agent's directory is one with a
`.town/grant` in it or above it, so `townd serve` walks up from
`--data` and refuses when it finds one; and the walk's PATH shim
carries `town` only. The boundary that closes it,
a separate user with a mode 700 directory, a container, or another
machine, is the OS's, and the hosted box is the project that puts it
there.

## The admin

`townd admin --data <dir> <verb>`, directly over the store, server
running or not, since SQLite is the meeting point. `serve` and `admin`
take the data directory from `--data`, or from `$TOWN_DATA` when the
flag is absent, so an operator's shell names it once, as journey 2 does
after its second step:

- `user add <name>`; `user ls`.
- `pass new --user <name> --label <text> [--expires <duration>]`: the
  grant file on stdout, once; the id on stderr. `pass ls`, with last
  use; `pass revoke <id>`.
- `grant new --pass <id> --shop <name> [--commands a,b] [--constraint
  '<command>.<arg> <kind> <value>']… [--expires <duration>]`; `grant ls
  [--pass <id>]`; `grant revoke <id>`. A grant with no `--commands` is
  every command, as the draft says; a constraint on an argument that is
  not `constrainable` for that kind is refused here.
- `shop add <dir>`: validate, run the shop's tests through the runtime
  against a scratch state, copy the directory under `<data>/shops/`,
  upsert the row. `shop test <dir>`: the middle step alone, one line per
  test. `shop ls`; `shop rm <name>`.
- `audit [--pass <id>] [--shop <name>] [--since <duration>]`: rows,
  newest last.

The server reads the store on every call and caches nothing, which is
what makes revocation instant and the admin honest. The Square, when it
comes, is a renderer over this same store on the box; an admin API with
a super-token would give the town an ambient authority it does not
have.

## The memory shop

`shops/memory/`: the manifest above and `main.mjs`, about sixty lines: a
file per key under `TOWN_STATE`, keys as relative paths kept under the
directory, `list` walking it, `forget` unlinking, `recall` of a missing
key exit 1 with a line on stderr. It is written to the contract and
reads no environment but `TOWN_STATE`. It is the draft's second seed
shop with its cloud storage swapped for the box's disk; a later project
gives it a private credential and the storage the draft names, and the
manifest gains a `credentials` entry and nothing else changes for an
agent.

## Testing it

- **checkout**: the manifest parsed and validated, every refusal with
  its message; constraints by kind; help for every subset; the gate's
  order with a fake runtime; the store's queries; the CLI guard. In
  process, vitest, fast.
- **command**: the built `town` against `townd serve` started on a free
  port with a temporary data directory: journey 2 steps 1 to 7 as one
  test; journey 3's denials with the entry swapped for one that writes
  a file; journey 4's `shop test` and the guidance change. The server
  and the directory are gone after.
- **the walk**: a real agent, Claude Code in a scratch directory with a
  grant file and one sentence, against a town on this laptop, its data
  directory elsewhere and `town` alone on the agent's PATH. The
  conductor reads the audit for denied calls, revokes the grant under
  it, and reads what the agent says. It costs a real model's turn, well
  under a dollar, and is the only proof that the help is honest.

## What this does not do, on purpose

- **Credentials and the vault.** The next project, **vault**: typed credentials,
  the operator connecting one, the runtime injecting it into a shop's
  outbound calls through a proxy, and `town/gdocs` as the shop that
  needs it.
- **Dependencies and inter-shop calls.** A shop calling another through
  the town with its caller's grant, attenuated by the dependency's scope
  (the draft's §6.4). A later project, **compose**, when there is a shop
  that is a recipe over others. The validator names both projects.
- **Town Hall and scratch namespaces.** Agents authoring shops through
  `town hall spec/validate/publish`; this project's `townd spec` and the
  validator are what Town Hall will front.
- **The Square.** A web renderer over the store; the admin verbs are its
  contract.
- **A hosted box.** This town runs on a laptop. Putting it on a machine
  with a name, TLS, and a systemd unit is a short project of its own,
  and the first that spends money.
- **Containers, egress, WASI.** The runtime is a process; the contract
  is the list above; the sandbox comes when the town is opened past one
  person.
- **Shop-defined constraint kinds, versions, capability diffs, the
  gardener.** The draft's v1, each on top of a table this project makes.
