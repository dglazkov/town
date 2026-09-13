# Consent: implementation phases

[`design.md`](design.md) is the argument; [`journey.md`](journey.md) is
the acceptance suite. Each phase names the journey steps it closes, and
a phase that claims a walk closes only when the walk was walked for
real. The rules are the repo's ([../../../AGENTS.md](../../../AGENTS.md)):
the manifest is the source and the command knows nothing; nothing an
agent can see holds a secret; every test says what it needs, `checkout`
in process, `command` against a server it starts, and a walk with a real
agent; Node 24 and nothing native; findings are one dated line of about
forty words; steps marked **⚑ provision** create a cloud resource, spend
money, or need a login, and are asked out loud first. `/conduct consent`
is the procedure. Phase citations name their project: `consent phase
1`, never a bare "phase 1".

**Three rules for this project.** A credential meets an agent's shop
only through a permit: a proof that finds a grant at a shop with needs that
no person made, or a sent shop's tests run on a user's credential before
a person approved its permit, has found the bug. And an origin is
approved once: a proof that finds a held type's origin, header,
endpoints, or scopes changed by anything but `type rm` and `type add`,
or a registration written from a manifest, has found the bug. And the
checklist is enough: a proof that finds a person needing a word that
`permit show`, the guidance, or a refusal did not print, to get from a
pending permit to a grant, has found the bug. Vault's, hall's, and
wall's rules still hold: the value never leaves the town's
memory, the gate decides before a process exists, the teller is
untouched, and `src/cli.ts` learns nothing here, not `consent`, not
`connect`, not `oauth`.

---

**Where we are: 13 September 2026.** Consent phase 0 is closed, and
consent phase 1, the `oauth` kind, is next: its code and rings need no
one, and its by-hand proof waits on a Google OAuth client the conductor
registers (⚑). What holds: a manifest proposes a `token` type with
guidance, a publish of a shop with needs asks for a permit in the
publish grant's place, and `permit show`'s checklist, typed as printed,
ends at a grant with the shop's tests run at approval.

The order is dependency order. Phase 0 is the type with the shop: the
manifest's need grown, guidance included, proposed and held types, the
publish path's door for a shop with needs, the permit's needs, `permit
show`'s checklist, and `permit approve` in its order with the tests run
at approval, all on `token` types, provable in
process and in the `command` ring on a fake origin. Phase 1 is the
`oauth` kind: the registration, `credential connect` on loopback, the
exchange and the refresh at the gate's sixth step, the revocation on
`invalid_grant`, and `town/gdocs`, provable against a fake
authorization server and proved once by hand against Google. Phase 2 is
the walk, last, because it is the only thing here that costs money and
it reads the audit the earlier phases made.

**Deliberately open.** Postponed on purpose: the Square; a person who
has never made a token; a person not at the box, and a provider that refuses loopback, both the box's; scope
escalation as a screen; a credential shared across users; fixture
credentials; a `token` credential's expiry as a notice; revoking at the
provider.

---

## Phase 0: A type proposed with the shop

**Closes:** journey 1 steps 1 to 6 and its three criteria, on a
`token` type; journey 2 steps 1 to 4 and 8, and its third criterion;
journey 3 step 7's spec change for the `token` fields.

**Work:** `src/spec.ts`: §8 rewritten as the design's manifest section
writes it, §8's dependency paragraph and §7's prose tightened to pay
for it, the spec under three hundred lines by the test's count.
`src/manifest.ts`: `Need` grown with optional `origin`, `header`,
`oauth`, and `guidance`, the shape rules, the guidance's length and
host rule, and `validateNeeds` taking the town's types with their state
and definition, refusing a differing definition in the design's words
and an undefined unknown type in vault's; the `oauth` shape is checked
here so phase 1 adds no manifest rule.
`src/schema.ts`: schema 6, the columns on `credential_types`,
`credentials`, and `shops`, the migration from a wall-era store,
`tested_at` set to `added_at`. `src/credentials.ts`: `kind`, `state`,
`proposedBy`, and `guidance` on `CredentialType`; `proposeType`, `approveType`, the
refusals at `addCredential` for a proposed type; `listTypes` with the
new columns. `src/publish.ts` and `src/hall.ts`: the refusal at step 3
lifted for a need; proposed types written at step 8 and by `shop add`,
the operator's held in one step; tests waiting at step 7 with the
design's line; the permit in place of the publish grant at step 9 with
the design's words and detail; `tested_at` written and cleared; `show`
and `search` saying needs, `show` and `requests` printing guidance
under the shop's name. `src/grants.ts` and `src/admin.ts`: `permit ls`
and `requests` with needs; `permit show`, the checklist as the design
prints it, one function that `permit approve` prints from on a refusal;
`permit approve` in the design's order, the tests run at step 3 from
the shop's directory in scratch with the bindings through tellers,
their rows under an approval row, `tested_at` set on a pass; `type
approve` printing the guidance, `type add --guidance`, `type ls`, `type
rm` of a proposed type; `credential add` printing the guidance on
stderr before stdin is read.
`README.md`: the operator's lines for a shop an agent published with a
need, `type approve`, and `permit approve` running tests.
`test/fixtures/`: a bundle proposing a `token` type over the fake
origin, with an entry that sends through its teller and one test.

Tests, `checkout`: `test/manifest.test.ts` grown: every need shape,
each refusal with its section, a definition matching and differing
from a held and from a proposed type, a registration key refused,
guidance without a definition, over length, and naming a host the type
does not send to, the spec's line count. `test/store.test.ts`: the migration, proposed types
made, met, refused, approved, removed. `test/publish.test.ts` and
`test/hall.test.ts` grown: a bundle with a need through `validate`,
`test`, and `publish` with a fake runtime: nothing run at `test`, the
permit made and replaced, the publish grant not made, `tested_at`
null then cleared by a republish, the grant sources enumerated after
each step. `test/admin.test.ts` grown: `permit show` in each state with its
done marks and the one-line case; `permit approve` at a shop with
needs, each refusal in order leaving it pending and printing the
checklist that remains, the tests run at step 3 with the binding and
recorded under the approval, a failure leaving it pending, the grant
made with source and binding on a pass; `type approve` printing the
guidance; `credential add` refused at a proposed type and printing the
guidance at a held one; the checklist test: a permit made, the
commands `permit show` printed run as printed in order and nothing
else, the grant made at the end.

Tests, `command`: `test/publish.test.ts` or a new `test/consent.test.ts`:
journey 1 steps 1 to 6 with the fixture bundle, a scripted agent, and
the fake origin, the entry's environment printed once to show an
address and no token; journey 2 steps 1 to 4 and 8 through the built
`townd`, the checklist typed as printed.

**Not this phase:** No `oauth` kind, no `connect`, no refresh, no
`town/gdocs`. An `oauth` definition in a manifest is shape-checked and
then refused as `oauth types come in consent phase 1`, so a
proposal of one is never written.

**Proof:** `pnpm build && pnpm test && pnpm typecheck` exit 0, the run's
last line naming both rings; `node bin/townd.js spec | wc -l` under
three hundred and `node bin/townd.js spec | grep -c 'origin'` at least
1. Falsified by at least one mutation: the publish grant made at a shop
with needs (the sources test fails), `permit approve` binding before
`type approve` (journey 2 step 2's line fails), the tests skipped at
approval (the approval's rows fail), and `permit show` leaving out the
credential line (the checklist test ends with no grant). Then by hand, from this checkout:
a served town, a bundle proposing a type over a fake origin the
conductor starts, published by a pass through the built `town`; `permit
show` read and its three lines typed as printed, and nothing else; the
call answered.

**Status: CLOSED.** 13 Sep 2026. The proof held as written: 513 tests,
both rings, typecheck, the spec at 298 lines; the four mutations each
failed their named tests; and by hand, `permit show`'s three lines
typed as printed ended at a grant, the call signed at the fake origin.

**Findings:**

- **2026-09-13 — The phase took about fifty-five minutes of wall
  clock.** Three doc commits (e829844, d5d7f17, f4b2d71); the builder
  went back twice, once for a rule the conductor invented and then
  withdrew.
- **2026-09-13 — `src/manifest.ts` split before the phase's work,**
  `validateNeeds` to `src/needs.ts` (9e96828); the need's rules would
  have crossed six hundred lines. `src/checklist.ts` is new.
- **2026-09-13 — Guidance hosts match exactly, bare or in a URL.**
  `www.figma.com` beside `api.figma.com` is refused, and an email's host
  counts; guidance names places by the provider's menus. Consent phase 2
  counts the round trips this costs.
- **2026-09-13 — The approve line's note is a shell comment,** `#
  runs dimitri/figma's 1 test on it first`, since a parenthesis breaks
  the line typed as printed.
- **2026-09-13 — An approval's test lines are audit rows,** grant
  `shop-test:<shop>`, under a row `approval <prm> tests n/m`; a
  publish's tests still write none, so the two doors record tests
  differently.
- **2026-09-13 — Tests at approval run from the shop's directory in
  the town,** walled, with scratch state, not a fresh copy. A failing
  test leaving the permit pending is proved in checkout only.
- **2026-09-13 — A `shop add` refused for a credential leaves the
  type held and says so;** a credential needs its type held first, so
  the same add after `credential add` completes.
- **2026-09-13 — The checklist's lines are `token`'s alone:** consent
  phase 1 adds `--client-id` and `connect` in `todos()`, and
  `proposeType` writes kind `token` only.

---

## Phase 1: The oauth kind

**Closes:** journey 1 step 7; journey 2 steps 5 to 7 and 9, and its
first and second criteria; journey 3 in full.

**⚑ provision:** a Google OAuth client of the desktop type, registered
by the conductor in a Google Cloud project of their own, and a Google
account with one document; for the by-hand proof alone. Asked out loud
first. No test needs either.

**Work:** `src/oauth.ts`: `pkce`, `authorizeUrl`, `exchange`, `refresh`
as the design writes them, over `fetch`, the answer's body read for
its fields alone. `src/consent.ts`: the flow, the listener on
`127.0.0.1`, `state`, the timeout, the browser's one line, the audit
row. `src/credentials.ts`: `oauth` and `client` on a type, sealed
values as JSON for an `oauth` credential, `scopes` and `revokedWhy`,
`connectCredential`, `refreshCredential` sealing the row again,
`revokeCredential` with why. `src/gate.ts`: `openBindings` refreshing
at the boundary with the design's margin, the denial on
`invalid_grant` in the design's words, `refreshed <type>` in the
detail, the `shop-error` on any other refusal. `src/liveness.ts`:
unchanged if the revoked column is enough, and a finding if not.
`src/admin.ts`: `type add` and `type approve` grown for `oauth` with
`--client-id` and the secret on stdin; `credential connect`, printing the guidance before the URL;
`credential add` refused at an `oauth` type; `credential ls` with
scopes and why; `shop add --user` holding an `oauth` type in one step.
`src/manifest.ts`: the phase 0 refusal of `oauth` lifted. `shops/gdocs/`:
the manifest, its `google-oauth` need with the registration guidance
the design writes, and `main.mjs`. `README.md`: the
registration, `connect`, and `gdocs` lines. `test/helpers/authserver.ts`:
a fake authorization server on loopback that checks PKCE and `state`,
issues and rotates refresh tokens, and can be told to answer
`invalid_grant` or 500.

Tests, `checkout`: `test/oauth.test.ts`: the URL's parameters, the
exchange with the verifier checked by the fake, the refresh, a rotated
refresh token, `invalid_grant`, a 500, a body never returned whole.
`test/consent.test.ts`: the flow against the fake with the redirect
delivered by the test, a wrong `state` ignored, `error`, no refresh
token refused, the timeout, the listener closed after each. `test/gate.test.ts`
grown: no refresh with a minute left, a refresh at the boundary and
the row re-sealed, the rotated token kept, the denial on
`invalid_grant` and the credential revoked, nothing refreshed on a
denied or malformed call, the counting test as vault wrote it.
`test/admin.test.ts` grown: the two verbs, their refusals by kind and
state. `test/github-shop.test.ts`'s pattern for `gdocs`: the manifest
through the validator, the entry against a fake docs origin.

Tests, `command`: journey 2 steps 5 to 7 and 9 and journey 3 steps 1 to
6 through the built binaries against a served town, the fake
authorization server and a fake docs origin on loopback, the store's
clock moved by a test-only environment name so a refresh happens in
the ring; the prying entry published on the `oauth` type and run
walled, its output searched for all three values.

**Not this phase:** No real agent. Google is reached by hand and by no
test.

**Proof:** `pnpm build && pnpm test && pnpm typecheck` exit 0, both
rings; `test/teller.test.ts` passing with `src/teller.ts` unchanged
since wall (`git diff 1aac7d9 -- src/teller.ts` empty). Falsified by at
least one mutation: the refresh margin set to zero (the boundary test
fails), the re-seal skipped (the second call refreshes again and the
count fails), and `invalid_grant` treated as `shop-error` (the
revocation test fails). Then by hand, ⚑ provision: `type add
google-oauth …` with the conductor's registration; `credential connect`
printing a URL, opened, consented to, the id printed; `shop add
shops/gdocs --user dimitri` passing its one test against Google; a pass
and a grant; `town gdocs read --doc-id <the document>` printing its
text; `credential ls` showing scopes and no value; `strings town.db`
holding none of the tokens. The registration and the credential kept
for phase 2.

**Status: NOT STARTED.**

---

## Phase 2: The walk

**Closes:** journey 1 step 8.

**⚑ provision:** a personal token at a provider the town has no type
for, Figma if the conductor has an account, or any provider with a
personal token and a public read otherwise; the conductor names it
before the walk and revokes the token after. Phase 1's Google
registration and credential, kept.

**Work:** Driven by the conductor: `node scripts/walk.mjs --shop hall`
on a town holding `town/gdocs` from phase 1; Claude Code started in the
agent's directory with the README's sentence, Bash as its only tool and
the project's settings alone, as the earlier walks found necessary; a
task naming the provider and one thing to read from it ("build a shop
that reads a Figma file's name and comments, put it in the town, and
read file <key>"); the conductor at the box making the token from what the agent said
and nothing else, then reading `permit show` and typing its lines as
printed, watching the tests run at the last; a second ask ("read the first line of the
Google document <id>"); the transcript read for how the agent
described the permit's wait and what it told the person to do; the
audit read for the publish's detail, the approval's tests, the calls
at both shops, and `refreshed google-oauth` if the hour passed;
`--status` grown for rows by detail.

**Not this phase:** No second harness, no second user, no box.

**Proof:** `pnpm test` still exit 0. The walk, as above, at the
shepherd's cost of one model session, well under a dollar: the audit
shows `published dimitri/<shop> …; requested prm_…`, an approval row
with the shop's tests under it and every one `ok`, calls at the shop
with the type's teller serving them, and a call at `town/gdocs` under
the agent's pass; the agent's transcript shows it told the person a
permit waited at the box and used the shop after with no call denied,
and read the document's first line. `grep -r` for the pasted token,
the access token, and the refresh token over the transcript, the
scratch directory, the published shop's directory, and `town.db` and
its WAL finds none of them. How the agent read §8 and described the
wait, whether the agent's words and the checklist were enough to make
the token and reach the grant without another source, and how many
round trips `validate` took, recorded as findings.

**Status: NOT STARTED.**
