# Hall — the design

**12 September 2026.** Built and walked: all three phases of hall are closed. The project's status lives
in [journey.md](journey.md)'s front matter. The journeys are the
acceptance suite, this doc is the argument, and [phases.md](phases.md)
is the walk. It is cut from the draft's §9, §12.1, and §16 in
[../../drafts/town-design-doc.md](../../drafts/town-design-doc.md), and
built on what [gate](../gate/design.md), [vault](../vault/design.md),
and [compose](../compose/design.md) left: the manifest and its
validator, the spec, the gate, the runtime's contract, the clerk and
the effective grant, the audit as a tree, and the admin. Where this
doc refines the draft, it says so and why, and the draft stays as it
was.

The thesis in one line: **Town Hall is a shop. It is `town/hall`, a
shop the town is born with, granted, narrowed, helped, denied, and
audited as any shop is; its commands are the town's own and run in the
town's process; and nothing it does for an agent is more than the
agent's grants allow. A shop an agent sends is tested with the agent's
grants, runs under the contract every shop runs under, is named for
the agent's user, and is held by that agent alone; and what the agent's
grants do not allow, it asks for, and a person decides.**

The draft's pilot has one hypothesis, that the grant-as-CLI model makes
agents more useful and people more comfortable, and its first question
is whether the authoring loop works: an agent going from "I need a
capability that does not exist" to a working shop in a few round trips,
with a person approving at the end. Gate, vault, and compose built
every mechanism the loop needs and never ran it: every shop in the town
so far was written by a builder and put in by the operator at the box.
This project runs the loop, and makes the permit the Square will later
render. What is left after it, containers, a hosted box, OAuth, the
Square, is deployment and surface over what these four projects made.

## The names

| Word | What it is | Where it lives |
| --- | --- | --- |
| the hall | `town/hall`: the shop the town is born with, whose commands run in the town's process | `src/hall.ts`; a row in `shops`, written on every open |
| a bundle | a shop's directory as one text stream: a ustar tar of plain text files, made with `tar --format ustar -cf - -C <dir> .`, sent on a call's stdin | `src/bundle.ts` |
| a namespace | the first part of a shop's name: `town/` the operator's, `<user>/` a user's, so `dimitri/todo` is dimitri's | `manifest.name`; `users.name` |
| the owner | the user whose agent published a shop; none for a shop the operator added | `shops.owner` |
| the publish grant | the grant a pass gains at a shop it published: every command, no constraints, remade at each publish | `grants.source = 'publish'` |
| a permit | a grant an agent proposed and a person decides: pass, shop, commands, constraints, why; pending, approved naming the grant made, or denied | `permits` |
| a grant's source | who made a grant: the operator, a publish, or a permit by id | `grants.source` |
| the staging | the directory under the town's shops a sent shop is written to, tested in, and moved from or removed | `<data>/shops/.staging-<random>/` |

Everything else keeps gate's, vault's, and compose's name and place.
The gate's sixth step gains a door for the town's own shop; the store
gains a table, two columns, and a seeded row; the admin gains three
verbs and two columns; the agent's binary learns one thing, that stdin
is text, which names no shop.

## What the draft says, and what this project refines

**A shop, not a grant type.** The draft's §9 makes Town Hall "a distinct
grant type (`hall`) that a user chooses whether to give their agent,"
with its own subcommands. The house rule is that the manifest is the
source and the CLI knows nothing, and a guard fails if `town` learns a
word. So the hall is a shop with a manifest: `town/hall`, in the town
from its first open, its help rendered for the grant as any shop's is,
its commands attenuable one by one, its calls rows in the audit. A
person who wants their agent to write shops but not ask for grants
grants `spec`, `validate`, `test`, and `publish`, and `request` is "not
available to this grant" in the words every other denial uses. What
makes it the town's own is one thing: its commands read and write the
store, so they run in the town's process and not as a subprocess. That
is the runtime field the draft's §15 already expects to grow:
`runtime: town`, a value an author may not write.

**The shop crosses the wire on stdin, as text.** The draft's `town hall
validate <dir>` and `publish <dir>` name a directory, which is the
agent's side of the wire; `town` is a pipe that posts argv and stdin
and knows no directory, and the town is a server that must not read
the agent's disk even when, on one box, it could. So a shop is sent the
way every box already knows how to send a directory: `tar --format
ustar -cf - -C <dir> . | town hall publish`. The town reads a ustar tar
of plain files, and nothing cleverer: no links, no pax or GNU headers,
no path over the format's limits, nothing outside the root, and
`manifest.yaml` at the root. Each refusal says what it found and the
one command that makes a tar it reads. The wire carries text, so the
agent's binary refuses a stdin that is not UTF-8 with one line, the
spec says a shop is text, and a shop with a binary in it is refused
before the town sees it. The megabyte stdin limit is the bundle's
limit, and a shop is a manifest and a hundred lines of code.

**One publish, under the user's name, and the grant a person already
gave.** The draft's §9.4 has a scratch namespace where agents iterate
without a human, published shops in public namespaces, and fixture
credentials for scratch. On one box with one operator this project
keeps the part that carries the loop and drops the rest. A shop an
agent publishes is named `<user>/<shop>` where `<user>` is the name of
the user whose pass the agent holds; `town/` is the operator's, and a
name outside the agent's namespace is refused naming the one to write.
There is one `publish`: it validates, runs the tests, puts the shop in
the town as `shop add` does, latest only, and gives the publishing pass
a grant at the shop with every command and no constraints. That grant
is not a grant nobody approved: the person who granted `publish` read
its summary, "keep it under your name, and hold a grant at it," and a
hall grant without `publish` publishes nothing. It is remade at every
publish so it covers the new commands, and made only when the pass
holds no grant at the shop or holds one it made itself: a grant a
person made at the shop, by `grant new` or a permit, stands and is not
touched. No other pass sees the shop until a person grants it. Scratch
expiry, visibility between users, and public namespaces are a later
project's, when there is a second user.

**A sent shop has no credentials of its own.** The draft's scratch shops
run against fixture credentials; this town has none, and a credential
of the user's bound to a shop the agent wrote, with a grant of every
command and no constraints, would be a widening. So a manifest sent to
the hall may declare no `credentials`: the refusal says to call the
town's shop for that origin as a dependency, or to ask the person at
the box, who adds a shop with needs as vault says. This is the draft's
§12.1, reuse before rebuild, made a rule for what an agent may publish:
a shop that wants GitHub depends on `town/github`, with the agent's
grant there and its constraints.

**A sent shop's tests are the agent's calls.** `shop add` runs a
composed shop's tests with grants at each dependency of exactly the
declared commands, no constraints, on the user's credentials: the
operator's trust. The hall runs them as compose's rule says a shop
runs: the tree's caller is the agent's pass, so at every dependency the
effective grant is the agent's own cut by the manifest, constraints
kept, bindings the agent's. A test that calls a shop the agent holds
no grant at, a command outside it, or a value its constraints refuse
fails with the agent's own denial, and no widening is possible because
none is computed. Before any test runs, a dependency the agent's grants
do not cover is refused naming it and what to ask for, as `grant new`
refuses the operator. The tests' state is scratch, one root per test as
`shop test` makes it, and the caller carries that root down the tree so
a dependency's writes land in scratch and never in the user's memory.
Every inner call is an audit row whose parent is the hall's call, so
`audit --call` on a publish shows what its tests did.

**A permit is a proposed grant, at any shop.** The draft's §9.2 has
`request-grant` making a pending permit the human approves in the
Square, and says the same loop holds for a shop the agent just built.
Here `request` proposes a grant at any shop the town holds, the ones
the agent lacks and the ones it holds narrowly: shop, commands,
constraints, and one line of why. It is checked as `grant new` checks
its flags, so a permit never names a command or a constraint the shop
lacks. Nothing changes until the operator decides at the box: `permit
approve` makes the grant, with the permit's commands or a subset and
the permit's constraints or more, never wider than asked, replacing the
pass's grant at that shop if it holds one; `permit deny` ends it. A
second request at the same shop replaces the pass's pending one. The
agent learns the answer where it learns everything, from `town --help`,
and `requests` lists what it asked for and what became of each. The
permit's table, its verbs, and its refusals are the Square's contract,
as the admin's verbs were gate's.

**Search is the town's shops, marked with what the pass holds.** The
draft's `search` finds shops by query with usage stats and §12.1 wants
near-matches surfaced before an agent builds. This town has a handful
of shops and one user, so `search` lists them, with a substring match
over names, summaries, guidance, and commands when `--query` is given,
and marks each with the commands this pass holds there. `show` prints a
shop's help as a full grant would read it, so an agent can see what to
depend on or ask for before it holds anything. Similarity, stats, and
what another user may see are later.

**Every hall row is the survey's telemetry.** The draft's §16 measures
round trips to a working shop, validator errors by type, searches
before publishes, and denied calls. The audit already has the rows;
this project makes the hall's `detail` column say what happened in the
words the survey wants: `refused §2,§4,§4` with one section per
refusal, `tests 2/3`, `published dimitri/todo 0.1.0`, `requested
prm_…`. The walk's status counts them.

## The hall's manifest

`src/hall.ts` exports the manifest as data and `runHall` as the code
that answers it. The manifest is a v0 manifest in every way but its
runtime, and a test asserts the validator's one complaint about it is
`runtime`; its summary and guidance name none of its commands, as the
rule requires of every shop.

```yaml
name: town/hall
version: 0.1.0
summary: Where the town's shops are found, made, and asked for.
guidance: |
  A shop is a directory holding a manifest.yaml and the entry it names;
  the manifest specification, printed here, is the whole of how to
  write one. A shop travels on stdin as a tar of its directory, made
  with `tar --format ustar -cf - -C <dir> .`. A shop you put in the
  town is named `<your user>/<shop>`, declares no credentials of its
  own, and its tests run as you: at the shops it depends on, with your
  grants. What your grants do not allow, ask for; a person decides at
  the box, and `town --help` shows the answer.
runtime: town
entry: src/hall.ts
commands:
  - name: search
    summary: List the town's shops, and which you hold.
    effect: read
    args:
      - { name: query, type: string, doc: "A word of a name or summary; every shop when omitted." }
    output: text
  - name: show
    summary: Print a shop's help as a full grant would read it.
    effect: read
    args:
      - { name: shop, type: string, required: true, doc: "A full name, like town/memory.", constrainable: [equals, one_of, prefix] }
    output: text
  - name: spec
    summary: Print the manifest specification.
    effect: read
    output: text
  - name: validate
    summary: Check a shop on stdin against the specification and this town, and say what to fix.
    effect: read
    output: text
  - name: test
    summary: Check a shop on stdin and run its tests as you, keeping nothing.
    effect: write
    output: text
  - name: publish
    summary: Check and test a shop on stdin, keep it under your name, and hold a grant at it.
    effect: write
    output: text
  - name: request
    summary: Ask for a grant at a shop, or a wider one; a person decides.
    effect: write
    args:
      - { name: shop, type: string, required: true, doc: "A full name, like town/memory.", constrainable: [equals, one_of, prefix] }
      - { name: commands, type: string, doc: "Comma-separated, every one you want at the shop: an approved request replaces the grant you hold there. Every command when omitted." }
      - { name: constraint, type: string, doc: "Limits you propose, `;`-separated, each `<command>.<arg> <kind> <value>`." }
      - { name: why, type: string, doc: "One line a person reads.", constrainable: [max_length] }
    output: text
  - name: requests
    summary: List what you asked for and what became of each.
    effect: read
    output: text
tests:
  - name: the specification prints
    run: spec
    expect: { contains: "# Shop manifest v0" }
  - name: a search lists the hall
    run: search --query hall
    expect: { contains: "town/hall" }
```

The entry names the module that answers, for a reader; nothing runs it
as a file. The hall's tests run in the town's own suite, through
`runHall` in process, as any shop's run through `shop test`. `test` is
a write because a sent shop's tests call the agent's dependencies with
the agent's grants, and a test of a recipe over memory remembers, in
scratch. The row is written on every open of the store, so the hall in
a town is always this town's; `shop add` of a manifest named
`town/hall`, or with `runtime: town`, is refused, and so is `shop rm
town/hall` and a dependency on it.

## The gate's sixth step, for the town's own shop

Steps 1 to 5 are gate's, unchanged: the bearer or caller to a pass and
its grants, `hall` to the shop and a command, the command to the grant,
the arguments to the manifest, the arguments to the constraints. A pass
with no grant at the hall is told "not available", and a hall grant at
`spec` alone is told the same for `publish`; help lists the commands
the grant holds. At step 6, a manifest whose runtime is `town` opens no
binding and starts no process: the gate calls `runHall(deps, { pass,
grant, command, values, stdin, callId })` and takes what it returns as
the outcome, `{ stdout, exit, result, detail }`, wrapping nothing. The
hall's words are its own: what it says goes to the agent's stdout as
`shop add` prints to the operator, one line per finding, and exit 1
means the shop needs work. Its result is `ok` at exit 0, `usage` when
what the agent sent was refused, and `shop-error` when the sent shop's
tests failed. The hall reads the store on every call, as the gate does,
and keeps nothing. A caller with no pass, a shop test's tree, never
reaches it, since a dependency on the hall is refused; a shop's own
call at the hall through a clerk is refused the same way at the
validator, so the hall answers agents alone.

## The bundle

`src/bundle.ts`: `readBundle(text)` returns the files, a map of path to
content and mode, or one refusal. The text is the call's stdin as the
server has it, re-encoded to bytes; the tar is 512-byte blocks, each
entry a header then its content padded to a block, two zero blocks or
the end of the text ending it. The header's `name`, `size` in octal,
`typeflag`, and `prefix` are read; a `size` that runs past the text is
refused as truncated. Type `0` or NUL is a file and `5` a directory,
made on write; `2` is refused as a symbolic link, since a shop is plain
files as `shop add` already requires; `x`, `g`, `L`, and `K` are
refused as pax or GNU headers, which a long path or an odd name needs,
naming the command and saying to shorten the path. A path is `prefix/`
and `name` with a leading `./` dropped. The root's own entry, `./`, is
skipped, since `tar -C <dir> .` writes one. A file with an empty path,
an absolute one, or one holding a `..` segment is refused. `manifest.yaml` must be at the root, or the
refusal says to make the tar with `-C <dir> .` so the shop's files are.
A file's mode keeps its owner-execute bit, so an entry that is not
`.mjs` or `.js` can be the executable the contract asks for. Everything
else in the header is ignored; nothing is expanded, nothing is followed.

## Publishing

`validate`, `test`, and `publish` are one path that stops at three
places. In order:

1. The bundle reads, or its one refusal is the answer.
2. The manifest is validated against the spec and this town's types and
   shops, every refusal listed with its section, as `shop add` lists
   them. `runtime: town` is among the refusals.
3. The hall's rules, each a refusal citing the spec: the name's
   namespace is the user's, `name: town/todo is not under your
   namespace; write dimitri/todo instead (spec §2)`; `credentials` is
   absent or empty, `credentials: a shop you send holds no credential
   of its own; depend on the town's shop for that origin, or ask the
   person at the box to add one (spec §8)`.
4. Every dependency is covered by the agent's live grants, in the
   agent's words: `depends[0]: town/github at list is not in this
   grant; ask for it`, or `depends[1]: this grant's town/memory lacks
   remember, which dimitri/todo calls; ask for it`. The rule is
   compose's liveness rule read for the publishing pass.
5. Adding the shop would break no dependent: no loop, no command a
   dependent declares dropped, in `shop add`'s words.

`validate` stops here: `ok dimitri/todo 0.1.0: add, done, list` and
exit 0, or the refusals and exit 1, result `usage`, detail `refused
§2,§8`. The bundle was written nowhere.

6. The bundle is written to a staging directory under the town's shops,
   mode 700, and read back as a shop; the manifest read from the copy
   is the one used from here.
7. The tests run from the staging copy, `ok <name>` or `not ok <name>:
   <why>` per test as `shop test` prints them, each test in a scratch
   state root of its own. The tree's caller is `{ passId, manifest,
   parent: <the hall's call>, depth: 1, stateRoot: <the test's> }`, so
   a call at a dependency is decided and recorded by the server's path
   with the agent's effective grant, and its process runs in the
   test's scratch and not the user's state.

`test` stops here: the lines, exit 0 when all passed and 1 otherwise,
result `shop-error` when one failed, detail `tests 2/3`; the staging is
removed either way, and nothing in the town changed.

8. The staging is moved into place as `shop add` moves it, the shop's
   row is upserted with `owner` the user's id, and the grants at the
   shop that stopped being live are named, as `shop add` names them.
9. The publish grant: when the pass holds no live grant at the shop, or
   holds one whose source is `publish`, that one is revoked and a grant
   at every command with no constraints and source `publish` is made,
   expiring never. When the pass holds a grant a person made, it stands
   and a line says so.

`publish` ends: the test lines, then `published dimitri/todo 0.1.0;
town todo --help says what it does`, exit 0, detail `published
dimitri/todo 0.1.0`; the typed name is help's rule, the last segment
when no other grant of the pass shares it. A publish whose tests failed
is `test`'s answer, staging removed, and the shop already in the town,
if one was, untouched.

The staging, the checks against dependents, the copy, the move, and the
naming of grants that stop being live are `shop add`'s, in
`src/publish.ts` since the split before hall phase 0; this project gives
them two front doors, the operator's from a directory with the operator's tree
and owner none, and the hall's from a bundle with the agent's tree and
the agent's user as owner. The rule that a shop is copied whole and
holds only plain files is one code path for both.

## Permits

`request --shop <name> [--commands a,b] [--constraint '<lines>'] [--why
<text>]`: the shop must be one the town holds; the commands, every one
of the shop's when omitted, and the constraints, split on `;` and read
as `grant new` reads its `--constraint` lines, are checked against the
manifest with `grant new`'s own checks and refused in its words. A
pending permit of this pass at this shop is replaced. The permit is
written: `prm_<8 random bytes hex>`, the pass, the shop, the commands,
the constraints, the why or empty, the time. The answer is `requested
prm_…; a person decides at the box, and town --help shows the answer`,
detail `requested prm_…`. A permit is a whole grant, and approving it
replaces the pass's grant at the shop, so a request that leaves out
commands the pass holds there says so on a second line: `if approved,
this replaces your grant at town/memory and drops remember, recall,
list; name them to keep them`. The line is conditional in its first
word, since the walk's agent read `approved, it replaces` as the
decision made and called the command it had just asked for. Asking again replaces the pending one. A permit
at a shop the pass already holds fully is still a permit; the person
may want to know.

`requests`: a table of this pass's permits, newest last: id, shop,
commands, constraints, why, asked, and state: `pending`, `approved as
<grant id>` with the commands granted when they are fewer than asked,
or `denied`.

At the box, `townd admin permit ls [--pass <id>]` is the same table for
every pass, with the pass and its user's name; `permit approve <id>
[--commands a,b] [--constraint …]… [--credential <id>]… [--expires
<duration>]` makes the grant: the permit's commands or the subset
given, refused if wider; the permit's constraints with the given ones
added; bindings as `grant new` binds them; and `grant new`'s refusals,
an uncovered dependency or an unbound need, leave the permit pending
and say what to do first. When the pass holds a live grant at the shop,
it is revoked and named, and the new one is made with source `permit
<id>`; the permit records the decision, the time, and the grant's id.
`permit deny <id>` records the decision. A decided permit is not
decided again. `grant ls` gains a `source` column, `-` for the
operator's, `publish`, or `permit prm_…`; `grant revoke` of a permit's
grant leaves the permit approved, since a decision was made.

## The store

Schema 4, and a store made by compose is migrated in place on open, as
compose migrated vault's. `permits`: id, pass_id, shop, commands,
constraints, why, created_at, decided_at, decision (`approved` or
`denied`), grant_id. `shops.owner`, a user id or null. `grants.source`,
null, `publish`, or `permit <id>`. The hall's row in `shops` is written
on every open from `src/hall.ts`, so it is this town's version, and a
town that never saw a `shop add` still has one shop. `user add` refuses
a name that is not a namespace, letters, digits, and `-` starting with
a letter, since such a user's agent could publish nothing; a store made
earlier keeps its users. Liveness is compose's; a publish grant is live
by the same query and walk as any other, so a recipe an agent
published vanishes from its help when the agent's grant at a dependency
is narrowed under it, as watch did.

## The admin, with three verbs and two columns

- `permit ls`, `permit approve`, `permit deny`, as above.
- `grant ls`: `source`. `shop ls`: `owner`, the user's name or `-`.
- `shop add`: a manifest named `town/hall`, or with `runtime: town`, is
  refused as the town's own. Otherwise as before, through
  `src/publish.ts`, owner none.
- `shop rm town/hall`: refused. `shop rm` of a published shop: as any
  shop, by the operator; its publish grant reaches nothing after.
- `user add`: the namespace rule.

The server reads the store on every call, so a permit approved at the
box is in the agent's next `town --help`.

## The agent's binary, and the spec

`src/cli.ts` reads stdin as bytes and sends it as text; bytes that are
not UTF-8 are refused before any request with one line, `error: stdin
is not text; the town carries text, so send a shop as a tar of text
files`, exit 1, from `denials.ts`. The binary still names no shop: the
guard's forbidden words gain `hall`, `publish`, and `permit`, and the
line names no command.

The spec says four things more and stays under three hundred lines by
`test/manifest.test.ts`'s count, which counts one more than `wc -l`: §2's `runtime`
says `subprocess` is the only value an author writes, §7's stdin says
text, §8's `depends` says never `town/hall`, and §1 says a shop is text
files. How a shop reaches the town is the hall's help, not the spec's:
the spec is the manifest, and the hall says how to send one.

## Testing it

- **checkout**: the store's migration from a compose-era database, the
  hall row present after open and after a second open, permits made,
  replaced, decided, and listed, `user add`'s refusal; the hall's
  manifest through the validator with `runtime` its one refusal, and
  its own tests through `runHall`; the bundle against tars built by
  hand and by the box's `tar`: a shop read back file for file with its
  modes, and each refusal, `..`, absolute, a link, a pax header, a long
  name, truncated, no manifest at the root; the gate over a store with
  the hall: no grant and a partial grant denied at steps 2 and 3,
  `search` marking held commands and filtering, `show` for a shop not
  held, `spec` equal to `townd spec`, `request` refused as `grant new`
  refuses and made otherwise, `requests` in each state, `permit
  approve` narrowing, replacing a grant, refusing wider, refusing an
  uncovered dependency and leaving the permit pending, `deny`;
  `validate`, `test`, and `publish` over a fixture bundle with a fake
  runtime and the real one: each refusal in order, the tests' caller
  the pass with the test's scratch root, a test at a dependency outside
  the agent's constraint failing with the agent's line, the publish
  grant made, remade, and not made over a person's, the staging gone in
  every path; the guard's new words. In process, vitest, fast.
- **command**: journey 1 steps 1 to 7 against a server the test starts,
  with the memory shop, a scripted agent's directory, a to-do shop the
  test writes, and the box's `tar`; journey 2 steps 1 to 6; journey 3
  steps 1 to 8, with a fixture whose entry prints everything it can
  reach and finds the agent's token nowhere, and a recipe over memory
  whose test writes only to scratch. The server, the directory, and the
  key are gone after.
- **the walk**: a real Claude Code session in a scratch directory with
  two grants, the hall whole and memory at `remember`, `recall`, and
  `list`, asked to build a shop that keeps a to-do list, put it in the
  town, and use it; then asked to do something its memory grant does
  not allow, so it asks; the permit approved at the box by the
  conductor; the audit read for round trips, refusals by section, and
  denied rows. One model session, well under a dollar, and no token.

## What this does not do, on purpose

- **A second user.** Visibility between users, scratch expiry, public
  namespaces, and a shop granted by one person to another's agent: the
  draft's sharing question, and a project with a second person in it.
- **Versions past latest, deprecation, the gardener, usage in search,
  similarity.** The draft's v1, each over the tables this project makes.
- **Notices for permits.** The agent learns from `town --help` and
  `requests`; a `permit-decided` notice when it bites.
- **Credentials at a sent shop.** No fixture credentials, no need on a
  published shop; the town's shops are the way to an origin. A person
  adds a shop with needs at the box, as vault says, until consent and a
  hosted box.
- **The Square.** The permit table and its three verbs are its contract.
- **Containers.** A published shop runs on the town's box in the town's
  process tree, as every shop does. On one box this is no authority the
  agent lacked, since the agent's harness runs on the same box; it is
  the agent's own code, moved a directory over. But it sharpens vault's
  open finding, that a shop can read the key, into the case for the
  next project: the first shop an agent wrote is the first shop nobody
  read. **Open, owed to a containers project.**
- **A hall a shop can call.** A dependency on `town/hall` is refused;
  the hall answers agents alone.
