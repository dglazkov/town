# Compose — the design

**12 September 2026.** Compose phases 0 and 1 built: the manifest, the clerk, the gate's caller, liveness, the audit tree, and the admin; the watch shop and the walk remain. The project's status lives
in [journey.md](journey.md)'s front matter. The journeys are the
acceptance suite, this doc is the argument, and [phases.md](phases.md)
is the walk. It is cut from the draft's §6.4, §7.1, and §13 in
[../../drafts/town-design-doc.md](../../drafts/town-design-doc.md), and
built on what [gate](../gate/design.md) and [vault](../vault/design.md)
left: the manifest, the gate, the runtime's contract, the teller, the
audit, and the admin. Where this doc refines the draft, it says so and
why, and the draft stays as it was.

The thesis in one line: **a shop that calls other shops is an agent to
the town. For one call it is handed a grant cut from its caller's own
and `town` on its PATH; every call it makes passes the gate the agent's
did, with the agent's constraints still on it; the grant dies with the
call; and a shop can never do at another shop what the agent that
called it could not.**

The draft calls this the confused-deputy rule and says it is not
negotiable: calls carry the caller's grant, attenuated by the callee's
declared dependency, never elevated. Gate and vault built the two
mechanisms a leaf shop needs; this project builds the one a recipe
needs, and it is the last mechanism of the draft's grant model. What is
left after it, Town Hall, the Square, containers, OAuth, a hosted box,
is surface and deployment over what these three projects made.

## The names

| Word | What it is | Where it lives |
| --- | --- | --- |
| a dependency | a manifest's `depends` entry: a shop it calls and the commands it calls there | `manifest.depends` |
| the clerk | the town's window for a shop's own calls: a loopback listener for one call that answers `POST /call` as the gate would for the agent | `src/clerk.ts` |
| the call directory | a directory made for one call, holding the grant file and `town` alone, gone after | `<tmp>/town-call-<random>/` |
| the effective grant | the agent's grant at a dependency, cut to the declared commands, constraints kept | computed in `src/gate.ts`; never stored |
| a caller | what the gate is handed for a shop's call: the agent's pass, the calling shop, the parent call | `src/gate.ts` |
| a call id and its parent | every audit row's own id, and the id of the call whose shop made it | `calls.call_id`, `calls.parent` |
| the watch shop | the third shop: a repository's issues since the last look, over github and memory | `shops/watch/` |

Everything else keeps gate's and vault's name and place. The manifest
gains a field; the runtime gains an option; the gate gains a door; the
audit gains two columns; liveness gains a reason; the admin gains one
flag and three refusals.

## What the draft says, and what this project refines

**A shop calls as an agent does.** The draft's §6.4 says how a call is
attenuated and not how a shop makes one. This project says: the same
way an agent does. The runtime puts `town` on the shop's PATH and a
grant file at `TOWN_GRANT`, and the shop runs `town memory recall --key
…` exactly as the agent that called it would, help included. There is
no SDK, no second API, no client library: a second way in would be a
second thing to secure and a second help to keep honest, and the
thesis is that the CLI is the capability, for a shop as for an agent.
The `town` binary is unchanged and the guard still passes; it reads
`$TOWN_GRANT` as gate wrote it.

**The effective grant is cut from the agent's own at every depth.** The
draft's §6.4 has "the caller's grant, further attenuated by A's declared
dependency scope." When A calls B and B calls C, this project cuts B's
grant at C from the agent's grant at C by B's manifest, not from what A
was given: A did not declare C and holds nothing there, and B's
declaration is B's own. A shop is never widened by the shop above it
and never narrowed by one that did not name the dependency. The rule is
one line and a pure function: `effective(agentGrants, manifest)`.

**A dependency is declared with its commands, and nothing else.** The
draft's manifest has `depends: [{ shop, version, commands }]`. `version`
is gate's "latest only" and out. `commands` is required and non-empty:
an omitted list meaning "all" would widen silently when the dependency
gained a command, and the manifest is the trust unit the person
approving a grant reads. The draft's `private` credentials on a shop
for resources that are its alone are a later project's, with the
storage they name.

**Liveness is strict, so help stays honest.** The draft's Appendix B
shows a permit reading "Depends on: town/memory (remember, recall),
already granted." This project makes that a rule of liveness: a grant
at a composed shop is live only while the pass holds a live grant at
each dependency covering the declared commands. `grant new` refuses
until it does, and a dependency revoked or narrowed under it makes the
composed shop's grant not live, so help stops listing the shop and a
call is "not available to this grant." The pilot's measure of honest
help is denied calls near zero; a shop listed in help whose every call
fails one level down would be a lie in help. What stays a runtime
denial is the draft's example of a shop exceeding its own declaration:
`summarize` calling `gdocs create` it never declared is denied whatever
the agent holds.

**A denial one level down is the agent's denial.** The draft says the
town denies the elevated call; it does not say what the agent is told.
This project says: the same line, the same exit. When a shop's inner
call is denied and the shop then fails, the agent's call is exit 2 with
the inner denial's line, `error: --repo must be 'dglazkov/town' under
this grant`, as if the agent had called github itself. A shop that
catches the denial and succeeds anyway is `ok`; the audit has the inner
row either way. The agent learns the rule it hit and nothing about how
the shop is built.

**Every shop in the town has every dependency it declares.** As vault
made every need a type the town holds, this project makes every
dependency a shop the town holds with the commands named, checked when
the shop is added. So `shop rm` of a shop another depends on is
refused, and so is a `shop add` that replaces a dependency with one
lacking a command a dependent declared, each naming the dependents. A
cycle cannot be added: a dependency must be in the town first, and a
replacement that would close a loop is refused naming it.

## The manifest

One field joins v0, and the spec's §8 says what it is:

```yaml
depends:
  - shop: town/github
    commands: [list]
  - shop: town/memory
    commands: [remember, recall]
```

A list of dependencies, each a `shop` the town holds and a non-empty
`commands` list, each a command that shop has now; one entry per shop,
never the shop itself. A shop the town does not hold is refused,
`depends[0].shop: 'town/gh' is not a shop this town holds; write one of
(town/github, town/memory), or add it with townd admin shop add first
(spec §8)`; a command it lacks is refused naming the ones it has. As
with types, the validator takes the town's shops when a store is at
hand, and `townd admin shop test` with no data directory refuses a
dependency naming `--data`. The rest of the manifest is vault's, and
the rule that a shop's prose names no command still holds.

The watch shop's manifest:

```yaml
name: town/watch
version: 0.1.0
summary: A repository's issues, compared with the last time you looked.
guidance: |
  A repo is `owner/name`. The last look is kept in your memory under
  `watch/<owner>/<name>`, so it is yours and outlives the call.
runtime: subprocess
entry: ./main.mjs
depends:
  - shop: town/github
    commands: [list]
  - shop: town/memory
    commands: [remember, recall]
commands:
  - name: mark
    summary: Remember the repository's open issues as of now.
    effect: write
    args:
      - { name: repo, type: string, required: true, doc: "owner/name", constrainable: [equals, one_of, prefix, regex] }
    output: text
  - name: changes
    summary: Print the issues opened and closed since the last look.
    effect: read
    args:
      - { name: repo, type: string, required: true, constrainable: [equals, one_of, prefix, regex] }
    output: text
tests:
  - name: a look, then what changed
    run: |
      mark --repo octocat/Hello-World
      changes --repo octocat/Hello-World
    expect: { contains: "closed:" }
  - name: no look yet fails
    run: changes --repo octocat/Hello-World
    expect: { exit: 1 }
```

The fixture repository is GitHub's own example, as vault's; the tests
read at GitHub and write only to a scratch memory. The shop's writes
to the agent's real memory are proven on the walk.

## The clerk

`src/clerk.ts`: `openClerk({ answer })` returns `{ url, token, calls,
close }`. It listens on `127.0.0.1` on a free port; `token` is
thirty-two random bytes, base64url, made for this call. For `POST
/call` with `Authorization: Bearer <token>`, it reads `{ argv, stdin,
json }` as the server does and writes back what `answer` returns, `{
stdout, stderr, exit }`. Any other bearer, or none, is answered as the
town answers an invalid pass, exit 3, gate's line: the agent's own token
is not good here, and nothing says why. A request whose `Host` is not
the listener is 404; `GET /` answers `town`; anything else is 404.
`calls` counts what it answered. `close()` stops the listener and
aborts every answer in flight, then resolves; after it, the port
refuses.

`answer({ argv, stdin, json }, signal)` is the town's: the gate, run
for a caller, with one audit row per call. It returns what the clerk
writes back and `denial`, the gate's line when it denied and null
otherwise, which the clerk passes to its opener and never sends; the
`signal` is aborted by `close()`. The clerk knows nothing of grants;
it is a window with a nonce, as the teller is, and the nonce is the
bearer so that `town` needs no change: `new URL("/call", grant.town)`
keeps the port and drops any path.

What the clerk is not: a network boundary. A shop can open any socket
it likes, as gate's process could. What the clerk makes true is that
the shop holds a token good at one address for one call, that gives at
most what the agent already had, and that the agent's own token was
never in the shop's hands.

## The runtime contract, grown by one line

`run(...)` takes `town: { answer }` when the manifest has dependencies.
Before the process exists it opens a clerk over `answer` and makes the
call directory, `<tmp>/town-call-<random>/` with mode 700: `grant`, the
file `{ "town": "<clerk url>", "token": "<clerk token>" }`, and
`bin/town`, a shell line that runs the town's own `bin/town.js` under
the town's own Node, and nothing else. The environment is gate's three
names, plus one per need as vault says, plus `TOWN_GRANT`, the grant
file's path, and PATH is the call's `bin` first, then the town's own.
After the process is gone, by exit, failure, or the limit, the clerk is
closed, the call directory is removed, and the result carries `{
calls, denied }`: how many calls the clerk answered and the first
`denial` among them, or null. A shop without dependencies gets no
clerk, no directory, and no `TOWN_GRANT`, so a shop that calls the town
without declaring it finds no `town` to call.

`run(...)` also takes `signal`, an `AbortSignal`: on abort, the process
group is killed as on the limit and the result says `aborted`. This is
how a tree ends with its root: the clerk's `close` aborts the calls it
is answering, each of which is a `run` with the signal, each of which
closes its own clerk. Nothing a call started outlives it, at any depth.

The shop's side, in the spec: run `town <shop> <command> …` as an agent
would, and read `town --help` to see what you were given. Do not write
what `town` prints on stderr to your own stderr word for word if it
could carry an argument's value; the denial lines do not, and they are
what you should pass on.

## The gate, with a caller

The gate's first step gains a second door. A request from the server
carries a bearer, and step 1 looks it up as gate wrote it. A request
from a clerk carries a **caller** instead: the agent's pass id, the
calling shop's manifest, the parent call's id, and the depth. Step 1
re-reads the pass by id and refuses a revoked or expired one with exit 3
as before, since the store is read on every call. Then the caller's
grants are computed, not read: for each dependency of the calling
shop's manifest, the agent's live grant at that shop with its commands
cut to the declared ones and its constraints kept; a dependency the
agent holds no live grant at yields nothing. Steps 2 to 6 run unchanged
over those grants: help renders them, "not available" covers a shop or
command outside them, constraints are checked, bindings are opened
from the agent's grant at the dependency, and only then does a process
exist. A shop is an agent with a smaller pass.

`shop test` has no pass and writes nothing to the town. Its caller
carries the grants instead of a pass id: at every shop in the tree, the
commands declared of it anywhere in the tree, no constraints, bound to
the credentials the test was given; the test user, and the test's
scratch state root. Each call is still cut by its calling shop's
manifest, so the tree a test runs is the tree an agent holding exactly
the declared commands would run.

`effective(agentGrants, manifest)` is a pure function in `src/gate.ts`,
and a test enumerates it: commands intersected, constraints kept,
undeclared shops and commands absent, a dependency the agent lacks
absent, bindings the dependency's own.

Step 6 grows for the outer call: when the shop's manifest has
dependencies, the runtime is given `answer`, which is this gate run for
the caller `{ pass, manifest, parent: this call, depth + 1 }`, recorded
by the server as any call is. When the shop exits nonzero and the
runtime's result names a denial, the outcome is `denied`, exit 2, the
denial's line, detail `inner`. Depth is bounded at eight; a cycle
cannot be added, so the bound is a seatbelt and a call past it is the
town's failure, `town-error`.

**Liveness** gains its fourth reason. A grant is live when it is not
revoked, not expired, every need is bound as vault says, and, for each
dependency of its shop's current manifest, the pass holds a live grant
at that shop whose commands cover the declared ones. The store's one
query still decides the first three; the fourth is a walk over its
result in code, each grant visited once, since a dependency's liveness
is its own grant's. `GrantState` gains `{ kind: "lacks", shop,
commands }`: the first dependency not covered and the commands missing,
or all of them when there is no grant at all. Help, the gate, notices,
and `grant ls` read live grants as before, so a dependency revoked or
narrowed makes the composed shop vanish from help at the next call.

## The audit, as a tree

Every row gains `call_id`, minted before the gate runs, `call_<8 random
bytes hex>`, and `parent`, the call id of the call whose shop made this
one, null for an agent's own. An inner row carries the agent's pass and
the agent's grant at the dependency, the shop and command called, its
own result, and its own tellers' counts; nothing in it names the clerk
or the call token. `townd admin audit` prints both ids; `townd admin
audit --call <id>` prints one call and every call made in its service,
indented by depth, newest last within a depth. `meta.schema` becomes
`3`, and a store made by vault is migrated in place on open, as vault
migrated gate's.

## The admin, with one flag and three refusals

- `shop add <dir>` and `shop test <dir>`: a manifest's dependencies are
  checked against the town's shops, as its needs are against types. The
  tests run with the shop given a grant at each dependency of exactly
  the declared commands and no constraints, over the dependencies' code
  in the town, the whole tree against one scratch state per test. The
  tree's needs are the shop's: a dependency with a need makes `--user`
  required, and `--credential` picks as vault says. `shop add` refuses
  a manifest that would close a loop, and a replacement that drops a
  command a dependent declared, each naming the dependents.
- `shop rm <name>`: refused while a shop depends on it, naming them.
- `shop ls`: each shop's dependencies as `<shop>[a,b]`.
- `grant new --shop <composed>`: refused until the pass holds a live
  grant at each dependency covering its commands: `pass <id> holds no
  grant at town/memory covering remember, recall; grant one with townd
  admin grant new --pass <id> --shop town/memory --commands
  remember,recall first`, or `pass <id>'s grant <gid> at town/memory
  lacks remember, which town/watch calls; revoke it and grant one that
  has it`. `grant ls` shows `not live: town/memory not granted` and
  `not live: town/memory lacks remember`.
- `audit --call <id>`: the tree.

The server reads the store on every call, inner calls included, so a
revocation under a running tree is seen by its next inner call.

## The watch shop

`shops/watch/`: the manifest above and `main.mjs`, about eighty lines.
`mark` runs `town github list --repo <repo> --state open --limit 100`,
keeps the `#<number> <title>` lines, and passes them to `town memory
remember --key watch/<owner>/<name> --value <lines>`, printing how many
it remembered. Not on stdin: a Node child's piped stdin is a socket,
and `town` sends only a pipe or a file, as gate found. `changes` runs `town memory recall --key watch/<owner>/<name>`
and `town github list …` again, and prints `opened:` with the numbers
now open that were not, and `closed:` with the numbers that were open
and are not, `none` under a heading with nothing, `#<number> <title>`
per issue. No look yet is exit 1 with a line naming no key, and
`changes` recalls before it lists, so no look asks nothing of GitHub.
It runs `town` with `spawn`, never a shell, its stdin ignored (`execFile`
takes no `stdio`, and hands the child a socket), reads no environment
but `TOWN_GRANT` and `PATH` through `town` itself, and passes a denial line
from `town` to its own stderr as it came, since those lines carry no
value. It is the draft's third seed shop with its documents swapped for
issues: a recipe over two shops, a write and a read at each.

## Testing it

- **checkout**: the manifest's `depends` parsed and refused by shop, by
  command, by self, and with no store; the clerk against a fake answer:
  the bearer required, the agent's token refused as an invalid pass,
  `Host` checked, calls counted, closed after and aborting in flight;
  the runtime's environment exactly three names plus one per need plus
  `TOWN_GRANT` when and only when there are dependencies, the call
  directory holding `town` alone and gone after, the grant file naming
  the clerk and not the agent's token; `effective` enumerated; the gate
  with a fake runtime: a caller's grants computed, the inner-denial rule
  in each of its three cases, a depth-two tree over fixtures with the
  cut from the agent's own; liveness with `lacks`; the migration from a
  vault-era database; the call tree query. In process, vitest, fast.
- **command**: journey 2 steps 1 to 7 against a server the test starts,
  on fixture shops, a fake origin, and a fixture recipe over
  `test/echo` and `test/teller`; journey 3's swapped entry that prints
  everything it can reach and finds the agent's token nowhere, tries
  the call token at the server's port and gets exit 3, and after the
  call finds the clerk's port refusing; an undeclared command, an
  undeclared shop, and a constrained value each denied with no
  dependency process; a tree cut by a timeout. The server, the
  directory, and the key are gone after.
- **the walk**: the real GitHub token of vault's walk, scoped to one
  repository; the watch shop added on it, its tests hitting GitHub; a
  real Claude Code session in a scratch directory with three grants,
  asked to remember the repository's issues, then, after an issue is
  closed by hand, to say what changed; then a repository the grant
  does not name; then memory narrowed under it. The audit read as a
  tree; the token searched for as before. One model session, well
  under a dollar, and one token the user revokes after.

## What this does not do, on purpose

- **Private needs.** A shop with a credential of its own, the draft's
  memory shop with a storage bucket: needs a hosted box with somewhere
  to put it, and a later project.
- **Notices through a shop.** An inner call's notices reach the shop on
  `town`'s stderr and the audit's row; the agent is not told a
  dependency's grant expires soon. A notice kind when it bites.
- **A per-command dependency.** `depends` is the shop's, not a
  command's: a grant at `changes` alone still needs `remember` held.
  A finding if it chafes; the cut is per command in the manifest then.
- **Town Hall, scratch namespaces, `town hall search` for what a recipe
  could reuse.** Project **hall**; this project makes the manifest it
  serves whole.
- **Containers and egress.** The clerk is the authority boundary for a
  shop's calls; the network boundary is the later project vault named.
- **Shop-to-shop cost.** The draft's open question 2: three policy
  checks and three processes for a three-deep call. Measured on the
  walk and recorded as a finding, not optimized.
