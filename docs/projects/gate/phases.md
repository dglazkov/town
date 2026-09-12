# Gate: implementation phases

[`design.md`](design.md) is the argument; [`journey.md`](journey.md) is
the acceptance suite. Each phase names the journey steps it closes, and
a phase that claims a walk closes only when the walk was walked for
real. The rules are the repo's ([../../../AGENTS.md](../../../AGENTS.md)):
the manifest is the source and the command knows nothing; nothing an
agent can see holds a secret; every test says what it needs, `checkout`
in process, `command` against a server it starts, and a walk with a real
agent; Node 24 and nothing native; findings are one dated line of about
forty words; steps marked **⚑ provision** create a cloud resource, spend
money, or need a login, and are asked out loud first. `/conduct gate` is
the procedure. Phase citations name their project: `gate phase 1`,
never a bare "phase 1".

**Two rules for this project.** The gate decides before a process
exists: a proof that finds a shop's entry running on a call that was
denied, malformed, or made with a bad pass has found the bug, whatever
the agent was shown. And the command is a pipe: a proof that finds the
name of a shop, a command, or an argument in `src/cli.ts` has found a
facade of the thesis, and so has one that finds `serve`, `admin`, or
`spec` there: the agent's binary is `town`, the operator's is `townd`,
and the walk's PATH carries the first alone.

---

**Where we are: nothing built, 12 September 2026.** The next thing to do
is **gate phase 0**, the manifest and the runtime: the package, the
spec, the validator, the runtime contract, and the memory shop proved
through its own tests. Nothing waits on a person; the one thing in the
project that costs money is gate phase 2's walk, a real model's turn.

The order is dependency order. Phase 0 is the contract between the town
and a shop, provable with no server, so the town in phase 1 is a gate in
front of code that already runs. Phase 1 is the town, the admin, and the
command, every journey but the walk, against a server the tests start.
Phase 2 is the walk, last, because it is the one proof that needs a
real agent and it reads the audit the earlier phases made.

**Deliberately open.** Postponed on purpose: credentials and the vault;
Town Hall; the Square; a hosted box; containers and egress; shop-defined
constraint kinds; versions; the gardener.

---

## Phase 0: The manifest and the runtime

**Closes:** journey 4 steps 1 to 4 and its third criterion; journey 4's
second criterion.

**Work:** The package: `package.json` (`town`, two bins, `bin/town.js`
and `bin/townd.js`, `pnpm build|test|typecheck`), `tsconfig.json` for Node 24 and ES modules,
vitest, a YAML parser, `.gitignore` already here. `src/manifest.ts`:
the v0 types, `parseManifest(text)` and `validateManifest(m)` returning
a list of refusals, each `field: what is wrong; write <this> instead
(spec §<n>)`; `credentials` and `depends` present and non-empty refused
with the line naming the later project, `vault` or `compose`. `src/spec.ts`: the spec as a
string, under three hundred lines, printed by `townd spec`; every
validator message cites a section of it. `src/runtime.ts`:
`run(shopDir, manifest, command, args, { user, stateRoot, stdin })`
building canonical argv, the closed environment, the state directory,
the thirty-second limit, and returning `{ stdout, stderr, exit,
timedOut }`. `src/args.ts`: `parseArgs(manifest, command, words)`, a
command's words to canonical arguments or a usage refusal, which the
shop tests use now and the gate uses in gate phase 1. `src/shoptest.ts`: `testShop(dir)` running `tests[].run`
line by line through the runtime against a scratch state, one result
per test. `src/townd.ts`: the operator's entry with `spec` and, for this
phase, `admin shop test <dir>` needing no data directory. `src/cli.ts`:
the agent's entry, saying only that it needs a grant file, until gate
phase 1. `shops/memory/`:
`manifest.yaml` as the design writes it, `main.mjs`, and its tests in
the manifest.

Tests, `checkout`: `test/manifest.test.ts`, the memory manifest parses;
each refusal fires on a fixture missing that field, with a message that
names the section and the fix; `credentials:` refused with the project
named. `test/runtime.test.ts`, with a fixture shop whose entry prints
its argv and environment as JSON: canonical order, defaults filled, the
environment exactly the three names, `TOWN_STATE` private per shop and
user, stdin passed, a sleeping entry killed at the limit with `timedOut`
set. `test/shoptest.test.ts`, the memory shop's own tests pass through
`testShop`, and a test that must fail fails.

**Not this phase:** No server, no store, no gate, no help. `town` with a
shop's name says nothing yet.

**Proof:** `pnpm install && pnpm build && pnpm test && pnpm typecheck`
exit 0. `node bin/townd.js spec | wc -l` under three hundred. `node
bin/townd.js admin shop test shops/memory` prints one `ok` line per test
and exits 0. Falsified by at least one mutation: the runtime passing
the parent's environment through (the three-names assertion fails), and
a manifest with `credentials:` accepted (the refusal test fails).

**Status: NOT STARTED.**

**Findings:**

---

## Phase 1: The town and the command

**Closes:** journey 1 steps 1 to 6 and its first four criteria; journey
2 in full; journey 3 in full; journey 4 step 5 and its first criterion.

**Work:** `src/store.ts`: the schema (`users`, `passes` with a token
hash, `grants` with commands and constraints as JSON, `shops` with the
manifest, `calls`) over `node:sqlite` at `<data>/town.db`, and every
query the gate and the admin need; a pass is resolved by hash on every
call and nothing is cached. `src/constraints.ts`: the five kinds, one
function each, and `checkGrantShape(manifest, grant)` refusing a kind
an argument is not `constrainable` for. `src/gate.ts`: the six steps in
the design's order, returning either the runtime's result or a denial
from `src/denials.ts`, which holds every sentence the agent can be told
and nothing else. `src/help.ts`: `helpForPass(store, pass)` and
`helpForGrant(manifest, grant)`. `src/notices.ts`: `grant-expires` and
`pass-expires`, rendered as stderr lines or as the array. `src/server.ts`:
`townd serve --data <dir> [--port <n>]`, `GET /` answering `town`, `POST
/call` with the bearer, the envelope for `--json`, one audit row per
call whatever happened. `src/admin.ts`: the verbs as the design lists
them; `shop add` copying the directory under `<data>/shops/<name>/` after
validation and the shop's tests. `src/cli.ts`: the grant file's
resolution order, the post, stdin when not a terminal, stdout and
stderr through, the exit code as given; `--json` and `--grant` its only
flags, and `serve`, `admin`, `spec` unknown to it. `townd serve`
walking up from `--data` and refusing when a `.town/grant` is found
in it or above it. `README.md`: the operator's ten lines and the agent's one
sentence.

Tests, `checkout`: `test/constraints.test.ts`; `test/gate.test.ts` with
a fake runtime that records whether it ran, every denial in order, the
result class per outcome, and the enumeration of `denials.ts`;
`test/help.test.ts` rendering every subset of memory's commands;
`test/store.test.ts`; `test/cli-guard.test.ts` reading `src/cli.ts`
for the forbidden words, the shops' and the operator's. Tests, `command`: `test/box.test.ts` walking
journey 2 steps 1 to 7 against a server on a free port with a temporary
data directory, the copy included; `test/narrow.test.ts` walking
journey 3 with memory's entry swapped for one that writes a file;
`test/contract.test.ts` changing `guidance` and a `doc` and reading
`--help`. `test/rings.test.ts`: every file under `test/` names its ring
in a header comment, and `pnpm test` runs both.

**Not this phase:** No real agent. The sentence in the README is
written, not yet said to anyone.

**Proof:** `pnpm build && pnpm test && pnpm typecheck` exit 0, the run's
last line naming both rings. Falsified by at least one mutation: help
rendered from the manifest and not the grant (journey 1's second
criterion fails), a denied call reaching the runtime (journey 3's first
criterion fails), and the store caching a pass across calls (journey 2
step 6 fails). Then by hand, from this checkout: `townd serve` in one
terminal, the admin verbs of journey 2 steps 2 to 4 in another, and the
calls of journey 1 steps 1 to 6 typed as written, the output read
against the journey.

**Status: NOT STARTED.**

**Findings:**

---

## Phase 2: The walk

**Closes:** journey 1 step 7 and its fifth criterion; journey 2's first
criterion as walked.

**Work:** `scripts/walk.mjs`: makes a temporary data directory, starts a
town on a free port, adds the memory shop, makes a user, a pass, and a
grant of `remember`, `recall`, and `list` under `notes/`, writes the
grant file into a scratch directory with a shim directory on `PATH`
holding `town` and not `townd`, the data directory outside the scratch
directory, and prints the directory and the sentence for the conductor. Then, driven by
the conductor and not the script: Claude Code started in that directory
with the README's sentence and a task ("remember three things about
this project and recall them"); the audit read for denied calls; the
grant narrowed to `recall` alone under the running agent; a second ask
that needs `remember`; the transcript read for what the agent said it
could not do. The script's `--teardown` stops the town and removes the
directories. `SKILL.md` at the repo root: the sentence and nothing
else, so a harness that installs skills has the same one line.

**Not this phase:** No second harness, no second machine, no box with
a name.

**Proof:** `pnpm test` still exit 0. The walk, as above, at the
shepherd's cost of one model session, well under a dollar: the audit
shows zero rows with result `denied` before the grant was narrowed, at
least one after, and the agent's transcript says memory can no longer
be written and does not retry. Recorded as a Finding with the counts.
No provision step: the town and the agent both run on this laptop.

**Status: NOT STARTED.**

**Findings:**
