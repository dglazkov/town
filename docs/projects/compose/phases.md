# Compose: implementation phases

[`design.md`](design.md) is the argument; [`journey.md`](journey.md) is
the acceptance suite. Each phase names the journey steps it closes, and
a phase that claims a walk closes only when the walk was walked for
real. The rules are the repo's ([../../../AGENTS.md](../../../AGENTS.md)):
the manifest is the source and the command knows nothing; nothing an
agent can see holds a secret; every test says what it needs, `checkout`
in process, `command` against a server it starts, and a walk with a real
agent; Node 24 and nothing native; findings are one dated line of about
forty words; steps marked **⚑ provision** create a cloud resource, spend
money, or need a login, and are asked out loud first. `/conduct compose`
is the procedure. Phase citations name their project: `compose phase 1`,
never a bare "phase 1".

**Two rules for this project.** A shop is never more than its caller:
a proof that finds a shop reaching a shop or a command its manifest did
not declare, or one the agent's grant does not hold, or a value the
agent's constraints refuse, has found the bug, whatever the shop was
told. And the agent's token reaches no shop: a proof that finds the
agent's pass token in a process's environment, argv, stdin, or any file
it can read, or finds a call token that answers after its call ended or
at the town's own port, has found the bug. Gate's and vault's rules
still hold: the gate decides before a process exists, the value never
leaves the town's memory, and `src/cli.ts` learns nothing here, not
`depends`, not `watch`, not `clerk`.

---

**Where we are: compose phases 0 and 1 closed, compose phase 2
PART-DONE, 12 September 2026.** Next is compose phase 2's walk, which
waits on a person: a GitHub token scoped to one repository of theirs
with fewer than a hundred open issues, and a hand to close one. The
watch shop and its stage are built and proved on a fake GitHub. Every journey step the `command` ring can walk
is walked on fixtures: `depends` validated, a clerk per call, the
effective grant at every depth, liveness needing the dependencies, the
denial one level down told in the agent's words, the audit as a tree,
and the admin's refusals.

The order is dependency order. Phase 0 is the manifest, the clerk, and
the runtime handing a shop `town`, each provable in process with the
gate run over grants a test hands it and no server. Phase 1 is the gate
and the admin learning about dependencies, liveness, and the tree,
every journey step the `command` ring can walk, on fixture shops and a
fake origin. Phase 2 is the watch shop and the walk, last, because it
is the first thing here that needs a real token, and it reads the tree
the earlier phases made.

**Deliberately open.** Postponed on purpose: private needs; a
dependency's notices reaching the agent; a per-command dependency;
Town Hall; containers and egress; the cost of a deep call beyond one
measured number.

---

## Phase 0: The manifest and the clerk

**Closes:** journey 3 steps 1, 2, 3, 6, 7, and 9, and step 5 but for
the town's own port, and its first and third criteria, as run in
process with the gate over grants the test hands it; journey 2 step 1's
refusals, as verbs against a store with no server.

**Work:** `src/manifest.ts`: `depends` as a list of `{ shop, commands }`,
validated against the shops the town holds when a store is at hand
(the validator takes the town's shops with their commands, as it takes
types; with none, a dependency is refused naming `--data`): a shop the
town lacks refused naming the ones it holds and `shop add`, a command
the shop lacks refused naming the ones it has, the shop itself refused,
`commands` empty refused, one entry per shop. `src/spec.ts`: §7's
environment line grown by `TOWN_GRANT` and PATH's first entry, §8's
`depends` written with the shop's side in prose, still under three
hundred lines, the room paid for by tightening and not by dropping a
rule. `src/clerk.ts`: `openClerk` as the design writes it.
`src/runtime.ts`: the `town` option, a clerk and a call directory
opened before the process and closed and removed after it, `TOWN_GRANT`
and PATH, `{ calls, denied }` on the result; the `signal` option and
`aborted` on the result. `src/gate.ts`: `effective(agentGrants,
manifest)` pure and exported; a request that carries a caller instead
of a bearer, its grants computed from the pass's live grants by the
calling shop's manifest, steps 2 to 6 unchanged over them; step 6
handing the runtime `answer` for a shop with dependencies, which is
this gate for the caller one deeper. `src/shoptest.ts`: a shop with
dependencies tested with the tree: the test hands the gate one grant
per dependency at the declared commands, bound to the credentials it
was given, over the dependencies' code under the data directory and
one scratch state root per test; `src/admin.ts`: `shop test` reading the
town's shops for the validator, and refusing a dependency with no
`--data` naming it.

Tests, `checkout`: `test/manifest.test.ts`, each refusal above with its
line. `test/clerk.test.ts`, against a fake `answer`: the bearer
required and any other answered as an invalid pass with exit 3, `Host`
checked, `GET /` answering `town`, `calls` counted, `close` refusing the
next connection and aborting an answer in flight. `test/runtime.test.ts`
grown: the environment is exactly three names plus one per need plus
`TOWN_GRANT` when and only when there are dependencies; the call
directory holds `bin/town` and `grant` and nothing else and is gone
after; the grant file's `town` is the clerk's URL and its `token` is not
any token the test holds; `town` run from the process reaches the
clerk; the abort kills the group. `test/gate.test.ts` grown:
`effective` enumerated as the design lists it; with a fake runtime, a
caller's grants are the effective ones and a caller whose pass was
revoked is exit 3; with the real runtime over `test/fixtures/recipe-shop`,
a fixture depending on `test/echo` at `echo` alone, an inner `town echo
--zeta z` answers and an inner `town echo sleep` and `town test/teller
get` are "not available"; with `test/fixtures/deep-shop` depending on
`test/recipe` at its one command, a depth-two call sees `test/echo` cut
by the recipe's manifest and nothing of the deep shop's own grant
widening it. `test/shoptest.test.ts` grown: the recipe's tests run
through the tree in scratch, and `shop test` with no `--data` refuses.

**Not this phase:** No server change, no audit column, no liveness
change, no `grant new` change, no `shop add` check beyond the
validator's, no watch shop. Every proof runs the gate in process over a
store in a temporary directory.

**Proof:** `pnpm build && pnpm test && pnpm typecheck` exit 0. `node
bin/townd.js spec | wc -l` under three hundred, and `node bin/townd.js
spec | grep -c TOWN_GRANT` at least 1. Then by hand against a temporary
data directory: `townd admin --data <tmp> shop add
test/fixtures/echo-shop`, then `townd admin shop test
test/fixtures/recipe-shop --data <tmp>` prints
one `ok` line per test, and the same without `--data` is refused naming
it. Falsified by at least one mutation: `effective` keeping a command
the manifest did not declare (the enumeration and the "not available"
test fail), the runtime setting `TOWN_GRANT` for a shop without
dependencies (the names test fails), and the clerk answering a bearer
that is not its own (the invalid-pass test fails).

**Status: CLOSED.** 12 Sep 2026. The proof held as written: 361 tests
in both rings, a 295-line spec naming `TOWN_GRANT`, two `ok` lines from
the recipe's tests through the tree, the refusal naming `--data`, and
each of the three mutations failing its tests.

**Findings:**

- **2026-09-12 — The phase took thirty minutes of wall clock.**
  Three doc fixes came first: the Proof's `shop add` had no `--data`,
  and the design lacked the clerk's abort signal, its `denial`, and how
  `shop test` hands the gate grants. No return to the builder.
- **2026-09-12 — `respond` and `parseCall` moved to `src/clerk.ts`.**
  The clerk and the server write one wire; left in the server they made
  an import cycle through the gate and the runtime. The server
  re-exports them, unchanged.
- **2026-09-12 — `--help` anywhere in argv is the caller's help.** A
  recipe whose argument's value is the word `--help` never reaches its
  shop as that value; the gate test sends `--words=--help` to pass it.
- **2026-09-12 — A shop test's grants are ids `shop-test:<shop>` with no
  pass.** Help labels them "a shop test"; each process in the tree gets
  only its own needs among the test's credentials.
- **2026-09-12 — Constraints at a dependency are proved in checkout
  only.** `test/echo` declares nothing constrainable; the real-runtime
  constraint denial is compose phase 1's deputy test, over the teller.
- **2026-09-12 — Inner calls are unrecorded and unbounded in depth.** An
  aborted inner call is `town-error`, detail `aborted`; a thrown gate is
  the town-failed line. The server's rows, the depth bound, and the
  inner-denial rule are compose phase 1's.

---

## Phase 1: The gate, the liveness, and the admin

**Closes:** journey 2 in full; journey 3 steps 4 and 8, step 5 at the
town's own port, and its second criterion; journey 1 steps 1 to 6 and
its three criteria, as walked on fixture shops.

**Work:** `src/store.ts`: schema 3, `calls.call_id` and `calls.parent`,
the migration of a vault-era database on open; `GrantState` gaining
`lacks` and liveness walking dependencies over the query's result, each
grant once; `callTree(callId)`. `src/gate.ts`: the outcome carrying the
call id and parent; the inner-denial rule, `denied`, exit 2, the line,
detail `inner`, when the shop failed after a denied inner call; the
depth bound. `src/server.ts`: the call id minted before the gate, the
clerk's `answer` recording one row per inner call through `handleCall`
with the parent set. `src/help.ts`: nothing but reading live grants.
`src/admin.ts`: `grant new` refusing a composed shop until each
dependency is held, with the two lines the design writes; `grant ls`
showing `lacks`; `shop add` refusing a loop and a replacement that
drops a declared command, naming dependents, and requiring `--user`
when the tree has a need; `shop rm` refused while depended on; `shop
ls` showing dependencies; `audit` printing both ids and `--call <id>`
printing the tree. `README.md`: the operator's lines gain a comment
that `grant new` at a composed shop needs the dependencies granted
first; the agent's sentence is unchanged. `test/cli-guard.test.ts` grown by the words `depends`,
`watch`, `clerk`.

Tests, `checkout`: `test/store.test.ts`, a vault-era database opens
with its rows and the new columns, `lacks` in each of its shapes, the
tree query. `test/gate.test.ts` grown, with a fake runtime: a shop that
exits nonzero after a denied inner call is `denied` with the line; one
that exits 0 after it is `ok`; one that fails with no inner denial is
`shop-error`. `test/help.test.ts`, a composed shop whose dependency is
not held is absent. Tests, `command`: `test/compose.test.ts` walking
journey 2 steps 1 to 7 with a fake origin the test starts, `test/echo`,
`test/teller`, and a fixture recipe over both; the copy in step 7 with
the key; and journey 1 steps 1 to 6 over the same recipe through the
built `town`: help naming no dependency, one call and its three audit
rows, a constraint at the teller told as the agent's line with the
origin's count unchanged, and the narrowing that hides the recipe and
the grant that brings it back. `test/deputy.test.ts`, journey 3 steps 4, 5, 7, and 8: the
recipe's entry swapped for one that prints its environment, argv,
stdin, its grant file, `TOWN_STATE`, and every file it can read under
the data directory, the agent's token found nowhere; the call token
sent to the server's port answered exit 3; the clerk's port refusing
after the call; an undeclared command, an undeclared shop, and a value
outside the agent's constraint each exit 2 with the fake origin's
request count unchanged, and the outer call exit 2 with the constraint
line; a depth-two tree with the cut from the agent's own; a tree cut
by the outer's limit with no process left, counted by pid.

**Not this phase:** No real token, no real origin, no watch shop, no
walk. The recipe that exists is a fixture.

**Proof:** `pnpm build && pnpm test && pnpm typecheck` exit 0, the run's
last line naming both rings. Falsified by at least one mutation:
liveness ignoring dependencies (journey 2 step 4's `--help` check
fails), `effective` keeping the agent's full command set (the deputy's
undeclared-command test fails), and the server accepting a call token
as a pass (journey 3 step 5's exit 3 test fails). Then by hand, from
this checkout: `townd serve` in one terminal, a fake origin from
`test/helpers` in another, `shop add` of the fixtures and the recipe,
`grant new` at the recipe refused, the two dependency grants made, the
recipe granted, one call through `town`, `audit --call` showing the
tree, `grant revoke` of a dependency, and the next call exit 2, typed as
journey 2 writes them.

**Status: CLOSED.** 12 Sep 2026. The proof held as written: 384 tests,
the run's last line naming checkout and command, each of the three
mutations failing its named test, and journey 2 typed by hand against
a running town and a fake origin, the tree in `audit --call`, the
revoked dependency making the recipe exit 2 and leave help.

**Findings:**

- **2026-09-12 — The phase took thirty minutes of wall clock.** Two doc
  fixes first, a journey 1 claim no test walked and a README line for
  a shop not yet built; no return to the builder.
- **2026-09-12 — A Node child's piped stdin is a socket, and `town`
  sends none.** Gate's rule reads only a pipe or a file, so a shop that
  pipes a value into `town … remember` through `spawn` sends nothing;
  the fixture passes values as arguments.
- **2026-09-12 — A denial one level down gives the agent empty stdout.**
  The shop's own stdout and stderr stay in its audit row; the agent
  learns the rule it hit and nothing of the shop.
- **2026-09-12 — Inner rows are written before their parent's.** Each
  row is written when its call ends; `audit` sorts by start, and `audit
  --call` walks the parent links.
- **2026-09-12 — A composed grant left unrevoked comes back live.**
  Liveness is computed, so re-granting the dependency revives it, and
  `grant new` would refuse a second grant at the shop anyway.
- **2026-09-12 — The tree-cut test waits the town's real thirty
  seconds.** `townd serve` takes no limit; the suite now runs about
  forty seconds. Four gate and vault command tests matched the audit's
  last column and moved with the new `call` and `parent`.

---

## Phase 2: The watch shop and the walk

**Closes:** journey 1 in full; journey 2 step 1 as walked on the real
origin; journey 3 step 9 as walked.

**⚑ provision:** a GitHub fine-grained personal access token the user
makes in the browser, scoped to one repository with Issues read and
write, free, revoked by the user after the walk, as vault's walk had;
the repository it is scoped to, the user's own; and a hand the journey
names, closing one issue in the browser between the agent's asks, free.
None is made by the conductor.

**Work:** `README.md`: the operator's lines gain `shop add shops/watch
--user`. `shops/watch/`: `manifest.yaml` as the design writes it, the
fixture repository checked against the real origin and swapped if it
does not answer as the tests expect; `main.mjs` as the design describes
it. `scripts/walk.mjs`: `--shop watch --repo <owner/name>`, reading
the token from stdin, adding the credential, adding github with
`--user`, memory, and watch with `--user`, making a pass and three
grants, github at `list` and `show` with `repo` equals the named
repository on each, memory at `remember`, `recall`, and `list`, watch at
`mark` and `changes` with no constraint, as journey 1 grants it, so a
repository the grant does not name is denied one level down at github;
and printing the
narrowing lines for memory, `grant revoke` and `grant new` at `recall`
alone, as vault's walk printed github's; `--status` printing the audit
as a tree by parent; `--search` and `--teardown` as before. Then, driven
by the conductor: Claude Code started in that directory with the
README's sentence and a task ("remember this repository's open issues
so you can tell me later what changed"); one issue closed on GitHub by
hand; a second ask ("what changed in the repository since you looked");
a third naming a repository the grant does not; memory narrowed under
the running agent; a fourth ask to remember again; the transcript read
for what the agent said it could not do; the token's value searched for
in the transcript, the scratch directory, and `town.db` with its WAL.

**Not this phase:** No second recipe, no second harness, no box with a
name, no private need.

**Proof:** `pnpm test` still exit 0, and `node bin/townd.js admin
--data <tmp> shop add shops/watch --user <u>` on the real token, with
github and memory added first, prints one `ok` line per test and exits
0. The walk, as above, at the shepherd's cost of one model session, well
under a dollar: the audit shows every `mark` and `changes` row with two
children, `list` at github and `remember` or `recall` at memory, each
carrying the agent's pass; zero rows `denied` before the third ask, then
one outer and one inner, the outer's line github's constraint; the
closed issue under `closed:` in the transcript; after narrowing, the
agent's transcript says watch is no longer available and does not
retry; and `grep -r` for the token's value over the transcript, the
scratch directory, and `town.db` with its WAL finds nothing. The wall
clock of one `mark` from the audit's latency, recorded as a finding
with the counts.

**Status: PART-DONE.** 12 Sep 2026. `pnpm test` exit 0 at 387 tests,
and `test/watch-shop.test.ts` walks journey 1 steps 1 to 6 over the real
github and memory shops on a fake GitHub; `shop add` on the real token
and the walk wait on the Open entry below.

**Findings:**

- **2026-09-12 — Open: the token, the repository, and a hand.** A
  fine-grained token scoped to one repository with Issues read and
  write, that repository with fewer than a hundred open issues, and one
  issue closed by hand between asks. Waits on the user.
- **2026-09-12 — The build before the token took twenty minutes.** Two
  doc fixes first, watch's constraint and stdin; two after, `spawn` for
  `execFile` and journey 1 step 2's wording. No return to the builder.
- **2026-09-12 — `execFile` takes no `stdio`.** Its child's stdin is a
  socket whatever is asked; watch spawns `town` with stdin ignored.
- **2026-09-12 — The cli guard parsed shops without their dependencies.**
  Watch's `depends` was refused; the guard now parses a shop after the
  shops it names, and checks watch's words too.
- **2026-09-12 — Watch keeps at most a hundred open issues.** Past that
  a shift in the first hundred reads as opened or closed; `changes`
  recalls first, so no look is exit 1 before any github denial.
- **2026-09-12 — On loopback one `mark` took 337 to 438 ms.** Inner
  `list` about 45 ms, `remember` about 22; the rest is watch's Node, two
  `town` processes, and the clerk. The real figure is the walk's.
