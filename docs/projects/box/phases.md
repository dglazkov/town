# Box: implementation phases

[`design.md`](design.md) is the argument; [`journey.md`](journey.md) is
the acceptance suite. Each phase names the journey steps it closes, and
a phase that claims a walk closes only when the walk was walked for
real. The rules are the repo's ([../../../AGENTS.md](../../../AGENTS.md)):
the manifest is the source and the command knows nothing; nothing an
agent can see holds a secret; every test says what it needs, `checkout`
in process, `command` against a server it starts, and a walk with a real
agent; Node 24 and nothing native; findings are one dated line of about
forty words; steps marked **⚑ provision** create a cloud resource, spend
money, or need a login, and are asked out loud first. `/conduct box` is
the procedure. Phase citations name their project: `box phase 1`, never
a bare "phase 1".

**Four rules for this project.** Nothing on an account without
`CLOUDFLARE_API_TOKEN` in the environment, and every proof that deploys
to a throwaway name also deletes it; the operator's own box is the one
deploy that stays. The contract is the same on both boxes: a proof that
finds a worker shop passing on one and failing on the other for a
reason spec §7 does not name has found the bug. The isolate's `env`
holds strings alone and its outbound is the window: a proof that finds
a binding in a shop's `env`, or a request that left the isolate any
other way, has found the bug. And a third ring, `box`, runs in workerd
through the vitest pool and needs `pnpm install` alone; a box test that
starts `wrangler dev` is a `command` test and says so. Wall's and
consent's rules still hold: the gate decides before a process exists,
the value never leaves the town's memory, and `src/cli.ts` learns
nothing here, not `box`, not `worker`, not `isolate`, not `operator`.

**Two findings before any phase.** The vitest pool wants `vitest ^4.1`
and the town is on 5; box phase 1 pins 4.1, and the checkout and
command rings run on it unchanged. And `wrangler` brings `workerd`, a
prebuilt binary the platform ships: it is the operator's tool and a
devDependency, compiles nothing at install, and the box the town runs on
is that same binary; `pnpm build` and the two binaries under `bin/`
never load it.

---

**Where we are: planned, 13 September 2026.** No phase begun. Box
phase 0 is next: the seams on the laptop, `runtime: worker`, and the
four shops as worker shops, with nothing of the Worker built.

The order is dependency order. Phase 0 is the seams, on the laptop
alone: the store over `Sql`, the shelf, the key source, the window's
rule, `runtime: worker` in the manifest and the spec, `bin/main.js`,
and the four shops converted, every existing test green. Phase 1 is
the isolate and the window in workerd, the `box` ring in its first
form, proved on the converted shops and the prying shop with no object
yet. Phase 2 is the object and the door: the store over the object's
SQL, the shelf in rows, the gate inside, the wire for the agent and the
operator, and a `wrangler dev` in the command ring walking the
operator's journey. Phase 3 is the deploy and the landing, the two
things that need an account, proved on a throwaway name and then on
the operator's own box. Phase 4 is the walk, last, because it costs
money and reads the audit the earlier phases made.

**Deliberately open.** Postponed on purpose: a process on the box,
pen's container as a tier; one object per shop and user, and alarms;
a second person's own way in; a custom domain; backups and a store
moved from a laptop; the OAuth relay; a Linux wall, never.

---

## Phase 0: The seams, on the laptop

**Closes:** journey 3 in full.

**Work:** `src/sql.ts`: `Sql` and `fileSql` as the design writes them, a named
parameter refused by the file driver,
the `node:sqlite` load and its dropped warning moved here from
`src/schema.ts`. `src/schema.ts`, `src/store.ts`, `src/credentials.ts`,
`src/audit.ts`, `src/liveness.ts`: every query over `Sql`, positional
throughout, `BEGIN IMMEDIATE` become `transaction`; schema 7, the
`wall` column's third word in the migration's comment and nowhere
else; `openStore(dataDir)` making the three seams from the directory.
`src/shelf.ts`: `Shelf` and `diskShelf`; `src/publish.ts` staging as a
map of files and putting by name; `src/gate.ts` handing the runtime
the shop by name. `src/vault.ts`: the key from a source, the file's
as today. `src/window.ts`: `parseOrigin`, `parseHeaderTemplate`, the
hop-by-hop list, and the forward's rule, moved from `src/teller.ts`,
which imports them. `src/manifest.ts`: `runtime: worker`, the refusal
for any other word naming both. `src/spec.ts`: §7's paragraph and its
line, the spec under three hundred lines by the test's count.
`bin/main.js`, `src/main.ts`: the town's Node running a worker shop's
entry as a process, `main`'s return as the exit, a throw as 1 with its
line, no `main` as 1 with §7's line; `src/runtime.ts` spawning it for
a worker shop, the enclosure unchanged since it is under the town's
install. `shops/*/main.mjs` and `manifest.yaml`: the four shops as
worker shops, imports kept, the program as `main`. `README.md`: the
runtime line. `src/store.ts` is at 556 lines and the split it needs
comes first, along its nouns, committed on its own.

Tests, `checkout`: `test/sql.test.ts`, the five over a file and a
rollback; `test/shelf.test.ts`; `test/window.test.ts` with the
teller's rule tests moved to it; `test/main.test.ts`, the four exits
of journey 3 step 3 through the runtime under the box's wall;
`test/manifest.test.ts` grown for `worker` and the refusal;
`test/store.test.ts` for schema 7 and a consent-era store; every
existing test unchanged in what it asserts.

Tests, `command`: the rings as they are, green with the four shops
converted; `test/box.test.ts`'s audit rows saying `seatbelt` for a
worker shop's calls.

**Not this phase:** Nothing of the Worker: no `wrangler.jsonc`, no
`src/box.ts`, no `src/isolate.ts`, no third ring. No subprocess shop
under `shops/`; one stays under `test/fixtures/`.

**Proof:** `pnpm build && pnpm test && pnpm typecheck` exit 0, both
rings, every test of the six projects before this one passing as it
did. Falsified by at least one mutation: the launcher not awaiting
`main` (memory's `roundtrip` test fails), a named parameter left in the
store (the file driver refuses it, as SQLite over the object would bind
it null, and the store's tests that reach the query fail; `test/sql.test.ts`
proves the refusal), and `runtime: worker` refused by the manifest
(every `shop add` fails).

**Status: NOT STARTED.**

## Phase 1: The isolate and the window

**Closes:** journey 2 steps 1, 2, 4, 5, and 7, and its three criteria,
with a test's own gate deps in place of the object.

**Work:** `package.json`: vitest pinned to 4.1, `@cloudflare/vitest-pool-workers`,
`@cloudflare/workers-types`, and `wrangler` as devDependencies, the
`box` ring in `pnpm test`; `vitest.box.config.ts` with the loader bound
as pen binds it; `vitest.config.ts` excluding the box ring's files;
`test/rings.test.ts` and `scripts/rings-reporter.js` knowing three
rings, a box-ring file importing from `cloudflare:test` and no other;
`tsconfig.worker.json` for the Worker's files. `wrangler.jsonc`: the
Worker, the object, the loader, `nodejs_compat`, the build's commit
as a var. `src/isolate.ts`: `ENTRY_SOURCE`, the module table by Node's
rule, `runIsolate` as the design writes it, the race, the disposal,
the load error, the state's cap. `src/box.ts` in its first form: the
`Window` entrypoint over `src/window.ts`'s rule with a teller by host
and the refusal, and a `default` that answers `town`; no object yet.

Tests, `box`: `test/isolate.test.ts`, the four worker shops through
`runIsolate` with a fake origin at `fetchMock`, every test of theirs
passing, the state in and out, the cap, the four exits, a top-level
`await` entry and §7's line, a shop that does not parse; `test/pry.test.ts`,
the prying shop as a worker shop with and without a need, its report
asserted line by line as journey 2 steps 1 and 2 write it, the
isolate's `env` read and found strings alone, the token found in
nothing the shop printed or kept; two users' states apart; a window
request forwarded with its header and one past it refused; no outbound
for a shop with no need.

**Not this phase:** No object, no store on the box, no clerk by host,
no door but `GET /`, no `wrangler dev`.

**Proof:** `pnpm test` exit 0, three rings, the box ring's files
running in workerd and named in the ring's report. Falsified by at
least one mutation: `globalOutbound` left unset (`test/pry.test.ts`
watches a request leave), a binding put in the isolate's `env` (the
strings-alone test fails), and the cap not checked (the cap test
fails).

**Status: NOT STARTED.**

## Phase 2: The object and the door

**Closes:** journey 1 steps 3 to 9 and its second and third criteria;
journey 2 steps 3, 6, and 8; journey 4 steps 1 and 4, and its first
criterion for the landing's refusals.

**Work:** `src/box.ts`: the object's SQL driver over `ctx.storage.sql`,
`rowsWritten`, and `transactionSync`; the shelf as `shop_files`; the
key from `TOWN_VAULT_KEY` and the refusal without it; `Town` opening
the store on first use and running the migrations; `call`, `admin`
with `io` captured and the wall chooser answering `isolate`, and
`consent`; the `Window` grown with the clerk's host, re-entering the
object as the caller one deeper; the door's routes, the operator's
bearer compared in constant time, `x-town-build` on every answer.
`src/admin.ts`: `--town <url>` as a pipe, the token from `$TOWN_OPERATOR`
or `~/.town/operator`, `-` for a directory over `--town` and the
refusal of a directory, `--data` with `--town` refused, `--wall` over
`--town` refused, and `wait` answered by `GET /admin/consent/<state>`.
`src/consent.ts`: the flow split from the listener, the landing over
the flow. `src/gate.ts`: nothing but the runtime it is given.
`test/helpers/town.ts` grown with `dev()`, a `wrangler dev` on a free
port with the secrets as vars, stopped after. `README.md`: the box's
section, one line per verb whose shape changes.

Tests, `box`: `test/object.test.ts`, the store's own tests run over
the object's driver so both drivers are one suite, the shelf in rows,
the key and its refusal, a store made by the object opening again with
its rows; `test/door.test.ts`, the four routes, `parseCall`'s refusals,
the operator's bearer wrong and absent, the hall answering `town
--help` through `/call`, `publish` of a worker shop and the refusal of
a subprocess shop, `town/watch` calling through the clerk's host and
the tree in the audit, the landing with a fake authorization server at
`fetchMock`, the `wait` answered, `state` unknown and `error` refused
in consent's words, the refresh with the clock var moved an hour;
`test/pry.test.ts` grown with journey 2 step 8, the exfil turned a
second time, through the object.

Tests, `command`: `test/dev.test.ts`, journey 1 steps 3 to 9 through
the built `town` and `townd admin --town` against `wrangler dev`, the
subprocess shop refused, the audit's `isolate` column, the grant file's
`town` the dev address; slow and alone in its file.

**Not this phase:** No deploy, no account, no real provider, no walk.

**Proof:** `pnpm build && pnpm test && pnpm typecheck` exit 0, three
rings, `test/dev.test.ts` included. Falsified by at least one mutation:
the operator's bearer not compared (the wrong-token test passes a verb
through), the clerk's host answering as the agent and not the caller
one deeper (watch's denial-one-level-down test fails), and the landing
not checking `state` (its unknown-state test writes a row).

**Status: NOT STARTED.**

## Phase 3: The deploy, and a consent from afar

**Closes:** journey 1 steps 1, 2, and 10, and its first criterion;
journey 4 steps 2, 3, and 5, and its second and third criteria.

**⚑ provision:** the operator's Cloudflare account and an API token in
the environment, for a throwaway Worker deployed and deleted by the
proof and then the operator's own box, which stays; a Google OAuth
client of the web kind, registered by the conductor with the box's
landing as its redirect, for the by-hand proof alone; the Workers
plan's cost for the day, cents. Asked out loud first. No test needs
any of them.

**Work:** `scripts/box.mjs`: `deploy` and `delete` as the design's
four steps and the delete's listing and typed name, the refusal
without the token with the permissions by name, the secrets made once
and kept on a redeploy, `~/.town/operator` written with mode 600,
`GET /` read; `package.json`'s `box` script. `src/consent.ts` and
`src/box.ts`: whatever the real provider's redirect teaches, recorded
as findings. `README.md`: the deploy's lines.

Tests, `checkout`: `scripts/box.mjs`'s refusal without the token, and
its argument parsing, with wrangler never run.

**Not this phase:** No walk with an agent.

**Proof:** `pnpm test` exit 0. Then by hand, from this checkout: `pnpm
box deploy --name town-box-<sha>` on the operator's account, journey 1
steps 2 to 9 typed against it from this laptop with the built
binaries, journey 4 steps 2 and 3 on the real registration and a real
document, `pnpm box delete` with the name typed, and the account's
listing read before and after. Then `pnpm box deploy` for the
operator's own box, `town`, with `town/gdocs` added on a real consent,
which stays for box phase 4. The deploy under two minutes, and the
secrets in no argument and no line the deploy printed but the one
that shows the operator's token.

**Status: NOT STARTED.**

## Phase 4: The walk

**Closes:** journey 5 in full; journey 2 step 6's CPU limit on the
deployed box.

**⚑ provision:** one model session, well under a dollar; the operator's
box from box phase 3, kept; the Google registration and consent, kept.

**Work:** Driven by the conductor: `node scripts/walk.mjs --shop hall`
grown to take `--town <url>`, so the agent's directory gets a grant
file naming the box and the operator's verbs go over the wire; Claude
Code started in the agent's directory with the README's sentence, Bash
as its only tool and the project's settings alone, as the earlier walks
found necessary; the three asks of journey 5; the permit approved over
the wire; a worker shop with a `while (true) {}` run once by the
conductor for the CPU limit's line; the transcript read for what the
agent said about `runtime: worker` and about its shop's reach; the
audit read over the wire for every row; the platform's dashboard read
for the day's requests and cost; `--status` grown for rows by wall.

**Not this phase:** No sheep, no second harness, no second person.

**Proof:** `pnpm test` still exit 0. The walk, as above: the audit
shows the publish and the tests under it, every row that ran
`isolate`, a permit approved and `town/gdocs` called under the agent's
pass, and a call ended by the CPU limit; the agent's transcript shows
it wrote a worker shop from §7 without being told the word, reported
what its shop could reach, read the document's first line, and said
its shops cannot reach the web; `grep -r` for the pass's token beyond
the grant file, the operator's token, and the tokens over the
transcript and the directory finds none. How the agent read §7's new
paragraph, how many round trips `validate` took, the count of
`isolate` rows, and the day's cost, recorded as findings.

**Status: NOT STARTED.**
