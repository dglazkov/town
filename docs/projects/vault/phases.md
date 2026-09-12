# Vault: implementation phases

[`design.md`](design.md) is the argument; [`journey.md`](journey.md) is
the acceptance suite. Each phase names the journey steps it closes, and
a phase that claims a walk closes only when the walk was walked for
real. The rules are the repo's ([../../../AGENTS.md](../../../AGENTS.md)):
the manifest is the source and the command knows nothing; nothing an
agent can see holds a secret; every test says what it needs, `checkout`
in process, `command` against a server it starts, and a walk with a real
agent; Node 24 and nothing native; findings are one dated line of about
forty words; steps marked **⚑ provision** create a cloud resource, spend
money, or need a login, and are asked out loud first. `/conduct vault`
is the procedure. Phase citations name their project: `vault phase 1`,
never a bare "phase 1".

**Two rules for this project.** The value never leaves the town's
memory: a proof that finds a credential's value in a process's argv,
environment, or stdin, in a shop's state directory, on stderr, in the
audit, or in a test's fixture file has found the bug, whatever the shop
was told. And the teller opens after the gate decides: a proof that
finds a listener opened on a call that was denied, malformed, or made
with a dead pass has found the bug, however fast it was closed. Gate's
two rules still hold: the gate decides before a process exists, and the
command is a pipe, so `src/cli.ts` learns nothing here, not `github`,
not `credential`, not `--repo`.

---

**Where we are: nothing built, 12 September 2026.** Gate is closed and
this project is cut from what it left. Next is vault phase 0, the vault
and the teller, provable with no server. Nothing waits on a person
until vault phase 2, whose walk needs a GitHub token the user makes and
a repository they name.

The order is dependency order. Phase 0 is the sealing and the window,
each provable against a fake origin on loopback with no server: the
runtime hands a process an address and the address signs. Phase 1 is
the gate and the admin learning about bindings, every journey step the
`command` ring can walk, on a fixture shop and a fake origin. Phase 2
is the github shop and the walk, last, because it is the first thing
here that needs a real token and a real service, and it reads the audit
the earlier phases made.

**Deliberately open.** Postponed on purpose: OAuth and `town/gdocs`
(project consent); egress and containers; dependencies (project
compose); the Square; a key held off the box; a credential's expiry as
a notice.

---

## Phase 0: The vault and the teller

**Closes:** journey 3 steps 1 to 4 and 6, and its first two criteria;
journey 2 steps 1 to 3, as verbs against the store with no server.

**Work:** `src/manifest.ts`: `credentials` as a list of `{ type }`,
validated against the types the store holds when a store is at hand
(the validator takes the list of type names; `townd admin shop test`
with no data directory takes none and refuses a need, naming `--data`);
`depends` still refused naming compose. `src/spec.ts`: §6 saying a test
reads and never writes, §7's environment line grown by one, the shop's
side of the teller in prose, §8 rewritten for `credentials` and
`depends`, still under three hundred lines.
`src/vault.ts`: `sealCredential`, `openCredential`, the key file made
with mode 600 on first need, the refusal when rows exist and the key
does not. `src/teller.ts`: `openTeller` as the design writes it.
`src/runtime.ts`: the `credentials` option, a teller per entry opened
before the process and closed after it, the environment names, the
`[{ type, requests }]` on the result. `src/store.ts`: the two tables,
the two columns, the seeded `github-token` row, `meta.schema` and the
migration of a gate-era database on open. `src/admin.ts`: `type add|ls|rm`,
`credential add|ls|rm` (`rm` marking the row; what it prints about
grants comes in vault phase 1), `shop test --user`. `src/shoptest.ts`:
tests run with a user's credentials through tellers when the manifest
has needs.

Tests, `checkout`: `test/manifest.test.ts`, a need parses, an unknown
type is refused naming the known ones, `depends` still refused.
`test/vault.test.ts`, seal and open roundtrip, another id refuses, a
flipped byte refuses, the key file's mode, the missing-key refusal.
`test/teller.test.ts`, against an `http` fake origin on loopback: the
header arrives, a shop-set `Authorization` is replaced, no nonce is 404
and the origin saw nothing, a foreign `Host` is 404, a streamed
megabyte goes both ways whole, the origin's 503 comes through, `close`
refuses the next connection and aborts one in flight, two tellers never
share a URL, `requests` counts. `test/runtime.test.ts`, the environment
is exactly three names plus `TOWN_CREDENTIAL_<TYPE>` per need, the
token in no name and no value, the teller closed after exit and after
the limit, and a request from `test/fixtures/teller-shop`, a fixture
with one need of a test type and one command that sends a request
through its teller and prints the answer, seen signed at the fake
origin. `test/store.test.ts`, a database made by gate's schema opens
with its rows and the new tables, and a credential added is in neither
`town.db` nor its WAL, searched as bytes. `test/admin.test.ts`, `credential add` from a
pipe, the trailing newline trimmed, `ls` printing no value, `type rm`
refused while a credential of it exists.

**Not this phase:** No gate, no binding, no `grant new` change, no
`shop add --user`, no github shop. `town github …` is still "not
available to this grant" for every pass, since no grant has a shop with
a need.

**Proof:** `pnpm build && pnpm test && pnpm typecheck` exit 0. `node
bin/townd.js spec | wc -l` under three hundred, and `node bin/townd.js
spec | grep -c TOWN_CREDENTIAL` at least 1. Then by hand against a
temporary data directory: `townd admin type ls` prints `github-token`;
`printf 'ghp_not_a_real_token\n' | townd admin credential add --user
<u> --type github-token` prints an id, `credential ls` prints the id
and no value, `strings <data>/town.db | grep -c ghp_not_a_real_token`
prints 0, and `ls -l <data>/vault.key` shows mode 600. Falsified by at
least one mutation: the teller passing a shop's `Authorization` through
(the replaced-header test fails), the runtime putting the token itself
in the environment (the names test fails), and the vault writing the
value unsealed (the roundtrip still passes and the store test that
searches the database for it fails).

**Status: NOT STARTED.**

---

## Phase 1: The binding and the gate

**Closes:** journey 2 in full; journey 3 step 5 and its third criterion;
journey 1 steps 5 and 6 and its second and third criteria, as walked on
a fixture shop; journey 3's second criterion, as walked end to end.

**Work:** `src/store.ts`: a grant's liveness as one query, revoked,
expired, and every bound credential unrevoked, used by everything that
lists a pass's grants; `credential rm` returning the grants it made not
live. `src/gate.ts`: step 6 opening the bindings from the vault and
handing them to the runtime with the type's origin and header; a need
the bindings do not meet leaving the grant not live. `src/help.ts`:
reading live grants and nothing else changed. `src/admin.ts`: `grant
new` binding by type, `--credential <id>` repeatable, the refusal
naming the type and the verb; `grant ls` showing `<type>=<id>`;
`credential rm` printing the grants; `shop add --user`, the tests run
as in vault phase 0, and, when the new manifest adds a need, the grants
that stopped being live printed. `src/server.ts`: the key read once at
start, `calls.credentials` written per call. `README.md`: the
operator's lines gain `credential add` and `shop add --user`; the
agent's sentence is unchanged.

Tests, `checkout`: `test/gate.test.ts`, with a fake runtime and a fake
vault: a live grant's bindings reach the runtime, a revoked credential
makes the grant not live and the call "not available", a need without
a binding the same, and on a denied, malformed, and dead-pass call no
binding opened and no teller listened, counted. `test/help.test.ts`,
a shop whose grant is not live is absent. `test/store.test.ts`, the
liveness query. Tests, `command`: `test/operator.test.ts` walking journey
2 steps 1 to 8 with `type add` of a fake origin the test starts and a
fixture shop, `test/fixtures/teller-shop` from vault phase 0; the copy in
step 8 with the key, and the copy of `town.db` alone refused.
`test/exfil.test.ts`, journey 3 step 5: the entry swapped for one that
prints its environment, argv, stdin, `TOWN_STATE`, and every file it
can read under the data directory, the value found nowhere, the
request seen signed. `test/narrow.test.ts` grown: a denied, malformed,
and dead-pass call on the fixture shop with the fake origin's request
count unchanged, while `test/gate.test.ts` counts the listens. `test/cli-guard.test.ts` grown by the words
`github`, `credential`, `repo`.

**Not this phase:** No real token, no real origin, no github shop, no
walk. The shop with a need that exists is a fixture.

**Proof:** `pnpm build && pnpm test && pnpm typecheck` exit 0, the run's
last line naming both rings. Falsified by at least one mutation: help
listing a grant whose credential was removed (journey 2 step 7's
`--help` check fails), the gate opening bindings before step 3 (the
denial test's listen count fails), and `grant new` binding nothing
(the fixture shop's call fails with no teller and journey 2 step 5's
test with it). Then by hand, from this checkout: `townd serve` in one
terminal, a fake origin from `test/helpers` in another, `type add`,
`credential add`, `shop add --user` of the fixture shop, `grant new`,
one call through `town`, `credential rm`, and the next call exit 2,
typed as journey 2 writes them.

**Status: NOT STARTED.**

---

## Phase 2: The github shop and the walk

**Closes:** journey 1 in full; journey 2 step 4 as walked on the real
origin; journey 3 step 6 as walked.

**⚑ provision:** a GitHub fine-grained personal access token the user
makes in the browser, scoped to one repository with Issues read and
write, free, revoked by the user after the walk; and the repository it
is scoped to, an existing one of the user's or a scratch one they
make, free. Neither is made by the conductor.

**Work:** `shops/github/`: `manifest.yaml` as the design writes it, the
fixture repository checked against the real origin and swapped if it
does not answer as the tests expect; `main.mjs` as the design
describes it. `scripts/walk.mjs`: `--shop github --repo <owner/name>`,
reading the token from stdin, adding the credential, adding the shop
with `--user`, making a grant of all three commands with `repo` equals
the named repository on each, writing the grant file into the scratch
directory with the shim `PATH` as before, and printing the directory
and the sentence; `--status` counting rows by result and reading
`calls.credentials`; `--teardown` as before. Then, driven by the
conductor: Claude Code started in that directory with the README's
sentence and a task ("read this repository's open issues and reply to
the oldest with one line saying which of the others look related");
the audit read for denied calls; the reply read on GitHub; the grant
narrowed to `list` and `show` under the running agent; a second ask
that needs `reply`; the transcript read for what the agent said it
could not do; the token's value searched for in the transcript, the
scratch directory, and `town.db` with its WAL.

**Not this phase:** No OAuth, no second type in use, no second
harness, no box with a name.

**Proof:** `pnpm test` still exit 0, and `node bin/townd.js admin
--data <tmp> shop add shops/github --user <u>` on the real token prints
one `ok` line per test and exits 0. The walk, as above, at the
shepherd's cost of one model session, well under a dollar: the audit
shows zero rows with result `denied` before the grant was narrowed and
at least one after; every row for the shop shows `github-token` served
with at least one request; the reply is on GitHub under the user's
account; the agent's transcript says it can no longer reply and does
not retry; and `grep -r` for the token's value over the transcript, the
scratch directory, and `town.db` with its WAL finds nothing. Recorded
as a Finding with the counts.

**Status: NOT STARTED.**
