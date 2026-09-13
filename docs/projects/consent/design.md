# Consent — the design

**13 September 2026.** Design. Nothing built. The project's status lives
in [journey.md](journey.md)'s front matter. The journeys are the
acceptance suite, this doc is the argument, and [phases.md](phases.md)
is the walk. It is cut from the draft's §10 and §9.2 in
[../../drafts/town-design-doc.md](../../drafts/town-design-doc.md), and
built on what [vault](../vault/design.md), [hall](../hall/design.md),
and [wall](../wall/design.md) left: the type table, the vault, the
teller, the binding on a grant, liveness, the permit, the publish path,
and a shop walled so it cannot read the key. Vault named this project
on the day it closed. Where this doc refines the draft, it says so and
why, and the draft stays as it was.

The thesis in one line: **a credential the town has never seen enters
it the way a shop does: proposed by an agent's manifest, shown to a
person with the one fact that matters, where the secret may be sent,
and made real by that person's yes. The type is proposed with the shop
and held by the town on approval; the credential is connected by the
person at their own terminal, pasted once or consented to in a browser;
the grant that binds the two is a permit and never a side effect; the
person is told, in the agent's words and at the box, where the secret
comes from and what to type; and the town refreshes what expires so a
shop is handed an address and nothing more, as vault promised.**

Hall closed on a to-do shop with no needs, and its rule was plain: a
shop an agent sends holds no credential of its own, depend on the
town's shop for that origin or ask the person at the box. So the
authoring loop the draft's pilot wants to measure is proven for shops
that touch nothing outside the box, and stops at `validate` for the
rest, which is nearly every shop anyone wants. Ask an agent for a Figma
shop today and it is refused with a line that names four verbs the
operator types by hand at the box, `type add`, `credential add`, `shop
add`, `grant new`, on a token the person made in Figma's settings. That
works, for a provider with a pasteable token and an operator in the
room who already knows where Figma keeps its tokens. It has no
agent-facing path, no way to a provider whose only door is OAuth, no
story for what is refreshed and when, and no one to tell the person
what to go and make: the draft measures minutes to first call
"dominated by OAuth setup," and the only party in the loop that read
the provider's docs is the agent. This project is that story, on the
laptop, with the operator still the whole human side, told what to do
by the agent's words and by the box, and the box project after it
carrying the person's terminal over the network.

## The names

| Word | What it is | Where it lives |
| --- | --- | --- |
| a kind | what a type's secret is: `token`, a value a person pastes, or `oauth`, a refresh token the town trades for access tokens | `credential_types.kind` |
| a proposed type | a type an agent's manifest defined and no person has approved: named, with its origin and header, held by the town as a proposal and by no credential | `credential_types.state = 'proposed'`, `proposed_by` |
| a held type | a type the town holds: seeded, added by the operator, or approved from a proposal | `credential_types.state = 'held'` |
| a registration | an `oauth` type's app at the provider: the client id, and the client secret sealed | `credential_types.client` |
| a consent | the operator's verb that walks a person through a provider's authorization in a browser and catches the redirect on loopback | `townd admin credential connect`; `src/consent.ts` |
| the exchange, the refresh | the two requests to an `oauth` type's token endpoint: a code for tokens, a refresh token for an access token | `src/oauth.ts` |
| a need's guidance | prose the agent wrote with the definition: where a person makes the secret and what to allow, or what to register; the shop's words, shown wherever a person meets the type | `manifest.credentials[].guidance` |
| a permit's needs | on a permit at a shop with needs, per need: the type's state, the user's credential of it or none, and the guidance | `permit ls`; derived from the shop's manifest |
| the checklist | a permit's needs as the things to do, in order, each the exact command to type with its ids filled in | `townd admin permit show`; a refused `permit approve` |
| the gdocs shop | the draft's first seed shop, `town/gdocs`, over an `oauth` type, `google-oauth` | `shops/gdocs/` |

Everything else keeps vault's and hall's name and place. The manifest's
need grows two optional fields and a third for `oauth`; the type table
gains a kind, a state, and a registration; the publish path gains a
door for a shop with needs; the permit gains its needs; the gate's
sixth step gains a refresh; the admin gains two verbs and grows two.

## What the draft says, and what this project refines

**A type is still the unit, and an agent may propose one.** Vault made
the type carry the one fact that matters for exfiltration, the origin,
so a manifest names a type and never a host, and a person approving a
grant reads `github-token` and not a URL. That holds. What changes is
who may write a type's definition down: an agent, in its manifest, for
a type the town does not hold. The manifest is still not "send the
token to this host": a proposed type is a proposal, held by no
credential, met by no binding, and a person reads its origin in the
permit before anything of theirs is sent anywhere. The trust is the
same trust as the shop's, since the person approving the shop's grant
is the person who reads the origin, and it is shown in the one place
they decide. A manifest naming a type the town holds may leave the
definition out or write it identically; a definition that differs from
the held one is refused, naming what the town holds. So a republish
cannot move a type's origin under a credential once a person said yes,
which is the draft's §10.4 for the one field that matters.

**A credential meets an agent's shop only through a permit.** Hall's
rule stands, in its words: a credential of the user's bound to a shop
the agent wrote, with a grant of every command and no constraints,
would be a widening. So hall's publish grant is made at a shop with no
needs, as before, and never at a shop with needs. A publish of a shop
with needs puts the shop in the town and makes a permit at it, every
command and no constraints, why `published`, in place of the grant, and
says so. The person decides at the box, as for any permit; approval is
when the user's credential first meets the agent's code, and so
approval is when the shop's tests first run on it. Nothing about the
draft's fixture credentials is built: the person's own credential is
the fixture, and the spec's rule that a test reads and never writes is
what makes that safe enough for a pilot, the draft's open question 3
answered for one user.

**OAuth is a kind of type, and the registration is the operator's.**
The draft's §10.3 has the hosted town own the app registrations and
the self-hoster register their own. On one box the operator is the
self-hoster: they register a client at the provider once, a desktop
client whose redirect is loopback, and give the town its id and secret
at `type add` or `type approve`. An agent may propose an `oauth` type,
its authorize and token endpoints and its scopes read from the
provider's docs, and never its registration: the permit says the type
needs one, and the operator's approval supplies it. A `token` type is
vault's type, unchanged, and its kind is written so the two verbs that
connect a credential refuse the wrong one.

**Consent happens at the operator's terminal, on loopback.** The
draft's §11 has the Square run the consent flow. This town has no
Square, and the person with a terminal is the operator, so `townd admin
credential connect --user <name> --type <type>` is the flow: it prints
the provider's authorization URL, listens on `127.0.0.1` for the
redirect, exchanges the code for tokens, seals them, and prints the
credential's id. This is how every installed application does OAuth
without a server of its own, and the provider's loopback rule is what
makes a laptop a valid redirect. It is the draft's open question 5
answered the way sheep answers it: the person's part is one sitting at
their own terminal, and a web page is owed only where a provider will
not redirect to loopback. The hosted box carries this verb to a person
who is not at the box, over the network; nothing in its shape changes.

**The person is told, by the agent's words and by the box.** The
draft's Appendix B has the Square tell a person what a shop needs and
which of their credentials covers it, and says nothing about a
credential they do not have yet. That is the part that costs minutes:
where a token is made, which boxes to tick, which console makes an
OAuth client and which API to enable first. The agent knows, since it
read the provider's docs to write the origin and the scopes, so a need
carries `guidance`, prose for the person in the agent's words: `Make a
personal access token at Figma > Settings > Security, with
file_content:read, and paste it.` It is shown wherever a person meets
the type: the permit's needs, `type approve`'s printout, the prompt of
`credential add` and `connect`, and the agent's own `requests` and
`show`, so the agent can say it to the person before the person goes
to the box. It is marked as the shop's words, since an agent wrote
them, and it says where a secret is made and never where it is sent;
the origin decides that, and the guidance is refused if it holds a URL
the origin does not, so an agent cannot write "paste it at
example.com" beside an origin of api.figma.com. At the box, `permit
show <id>` is the whole of what the person has to do, as a checklist:
the shop's summary, each need with its origin and guidance, and the
commands to type in order with the ids filled in, the done ones
marked. A refused `permit approve` prints the checklist that remains,
not one line. That checklist, not the Square's absence, is what this
project assumes of a person: that they can follow it, at the box.

**Refresh is the gate's, at the sixth step, and not the teller's.**
Vault said the teller's header is set at forward time from whatever the
type says, and that consent would teach it to trade a refresh token
before signing. The teller holds the value in a closure and can write
nothing back, and a refreshed token that is not written back is
refreshed on every call. The gate's sixth step already opens the
binding from the vault for one call; for an `oauth` credential it
opens the row, and when the access token is gone or within a minute of
going, trades the refresh token for a new one, seals the row again,
and hands the runtime the access token as the teller's `token`. The
teller does not change. A call is thirty seconds and an access token an
hour, so a token that expires mid-call is a finding, not a mechanism.

**A refresh the provider refuses is a revocation.** When the token
endpoint answers `invalid_grant`, the person revoked the town at the
provider, or the refresh token expired, and no call will succeed until
they connect again. The town marks the credential revoked with why,
every grant bound to it stops being live by vault's rule, help stops
listing the shop, and the call that found out is denied in gate's words
with one more clause: `not available to this grant: its google-oauth
credential needs connecting again at the box`. Nothing is retried; the
agent learns it the way it learns every narrowing. Any other failure at
the token endpoint, a network fault, a 5xx, is the call's `shop-error`
with the status, and the credential stands.

**Every consent row is the survey's telemetry, and the permit's needs
are the Square's.** The draft measures minutes to first successful
call, "dominated by OAuth setup." `credential connect` writes one audit
row under no pass with the type, the user, and the seconds from URL to
redirect. The permit's needs, the three verbs in order, and their
refusals are what the Square renders on one screen, when it comes.

## The manifest

Spec §8's `credentials` entry grows. A need names a type, and may
define it:

```yaml
credentials:
  - type: github-token                        # a type the town holds
  - type: figma                               # proposed, kind token
    origin: https://api.figma.com
    header: "X-Figma-Token: {token}"
    guidance: |
      Make a personal access token at Figma > Settings > Security >
      Personal access tokens, with file_content:read and
      file_comments:read, and paste it.
  - type: google-oauth                        # proposed, kind oauth
    origin: https://docs.googleapis.com
    header: "Authorization: Bearer {token}"
    oauth:
      authorize: https://accounts.google.com/o/oauth2/v2/auth
      token: https://oauth2.googleapis.com/token
      scopes: [https://www.googleapis.com/auth/documents.readonly]
    guidance: |
      In the Google Cloud console, enable the Google Docs API and make
      an OAuth client of the Desktop type; give the town its client id
      and secret, then connect, which opens Google's consent page.
```

The rules, each a refusal citing §8:

- A need is `{ type }`, `{ type, origin, header }`, or those with
  `oauth: { authorize, token, scopes }`, each with an optional
  `guidance`, and no other key. `origin` and `header` come together or
  not at all; `oauth` needs both; `guidance` needs a definition, since
  a held type carries its own.
- `guidance` is prose for a person, one paragraph, at most six hundred
  characters, and holds no URL whose host is not the origin's, the
  authorize endpoint's, or the token endpoint's: `credentials[0].guidance:
  names example.com, which is not where this type sends; say where the
  secret is made, not where to send it (spec §8)`.
- `origin` is an absolute `http:` or `https:` URL with no query,
  fragment, or userinfo; `header` is `<Name>: <value with {token}>`;
  `authorize` and `token` are `https:` URLs; `scopes` is a non-empty
  list of strings. The checks are `parseOrigin` and
  `parseHeaderTemplate`, vault's.
- A need naming a type the town holds, held or proposed, with no
  definition is met by that type. One with a definition must match the
  town's field for field, `oauth` included, or is refused: `credentials[1]:
  figma is a type this town holds, at https://api.figma.com in
  X-Figma-Token; leave the definition out, or write that (spec §8)`.
- A need naming a type the town does not hold must define it, or is
  refused naming the types the town holds, as vault refused, and
  saying how to propose one.
- One need per type, as before.

The manifest names no client id, no client secret, no redirect: a
registration is the operator's, and a manifest that writes one is
refused with the key named.

The spec is at its line budget, 299 by `test/manifest.test.ts`'s count,
and §8 grows by about fifteen lines, guidance included. §8's dependency paragraph and §7's
prose are tightened to pay for it, the rule kept, as wall tightened §7.

## Proposed and held types

`credential_types` gains `kind` (`token` or `oauth`), `state`
(`proposed` or `held`), `proposed_by` (the shop that proposed it, or
null), `guidance` (the proposer's, or the operator's `--guidance` at
`type add`, or empty), `oauth` (JSON `{ authorize, token, scopes }`,
null for `token`), and `client` (the registration, sealed under the vault key as a row's
value is: JSON `{ id, secret }`, `secret` empty for a public client;
null until given). The seeded row is `token`, `held`.

A type is proposed when a manifest defining it is published by the
hall, or added by `shop add`; `validate` and `test` propose nothing,
since they write nothing. A second manifest defining the same name
identically is met by the proposal; one defining it differently is
refused as above. A proposed type is held by no credential: `credential
add` and `credential connect` at it are refused, `type figma is
proposed by dimitri/figma and not yet the town's; townd admin type
approve figma makes it so`. `type ls` shows kind, state, and proposer.
`type rm` of a proposed type is allowed while no shop names it, as for a
held one while no credential holds it.

`townd admin type approve <name>` makes a proposed type held, printing
its kind, origin, header, for `oauth` its endpoints and scopes, and
its guidance under the line `<shop> says:`, so the operator reads what
they approve, and what they are about to go and make, on the lines
that do it. For an
`oauth` type it takes `--client-id <id>` and the client secret on
stdin, empty for a public client, and is refused without the id. `type
add` gains the same fields for an `oauth` type, `--kind oauth
--authorize <url> --token <url> --scopes a,b --client-id <id>`, the
secret on stdin. A held type's definition is never edited; a change is
`type rm` and `type add`, refused while a credential holds it, as vault
made it.

## Publishing a shop with needs

Hall's path, in `src/publish.ts` and `src/hall.ts`, with the refusal at
step 3 lifted and a door at steps 7 and 9:

1. to 2. The bundle, then the manifest against the spec and this town,
   the need rules above among the refusals.
3. The hall's rules, less one: the namespace is the user's; a need is
   allowed. A need may propose a type; `runtime: town` is still refused.
4. to 5. Dependencies covered by the agent's grants; no dependent
   broken. As before.
6. The staging, as before.
7. The tests. A shop with no needs runs them as hall runs them. A shop
   with needs has no binding yet, since no person made one, so its
   tests do not run: `test` says so per need, `tests wait: dimitri/figma
   needs figma, which no grant of yours binds; they run when a person
   approves your permit`, exit 0 with nothing kept; `publish` says the
   same and goes on.
8. The shop moved into place, the row upserted with `owner` and
   `tested_at` null, proposed types written, grants that stopped being
   live named. As before but for the two columns.
9. The grant. A shop with no needs gets hall's publish grant. A shop
   with needs gets a permit in its place: this pass's pending permit at
   the shop, if any, replaced; every command, no constraints, why
   `published <name> <version>`; and the line `published dimitri/figma
   0.1.0; it needs figma, so a person decides at the box: requested
   prm_…, and town --help shows the answer`. The detail is `published
   dimitri/figma 0.1.0; requested prm_…`.

A republish of a shop with needs that already has a grant a person made
keeps that grant, as hall keeps a person's grant, and it stops being
live by vault's rule if the republish gained a need; the line names it
and says to ask. `tested_at` is cleared by a republish, so approval
runs the tests again.

`town hall show` and `search` say a shop's needs by type, and whether
this pass's user holds a credential of each, `needs figma (none
connected)`, and `show` prints each need's guidance, so an agent
reading before it asks knows what its permit will wait on and what to
tell the person.

## The permit, with needs

`request` is hall's, unchanged in what it takes. `requests` and `permit
ls` gain a `needs` column for a permit at a shop with needs, per type:
`figma: proposed (https://api.figma.com), none connected`, `figma:
held, none connected`, `github-token: cred_…`. The agent's view says
`none connected` and never an id, since an id is the operator's; under
the table, `requests` prints each unmet need's guidance, so the agent
has the words to give the person.

`townd admin permit show <id>` is the checklist: the permit's line as
`permit ls` prints it; the shop's summary; each need on its own lines,
the type, its state, its origin and for `oauth` its scopes, its
guidance under `<shop> says:`, and the user's credential of it or
`none connected`; then `to do:`, the commands in order with the ids
and names filled in, each marked `done` or not:

```
to do:
  done  townd admin type approve figma
        printf '%s\n' "$TOKEN" | townd admin credential add --user dimitri --type figma --label figma
        townd admin permit approve prm_4f… (runs dimitri/figma's 2 tests on it first)
```

For an `oauth` need the lines are `type approve … --client-id <id>`
with the secret on stdin and `credential connect …`, and the guidance
says what to register before either. A permit with nothing left to do
but approve prints that one line. `permit approve <id>` at a shop with
needs works in the same order, and a refusal leaves the permit pending
and prints the checklist that remains, so a person who typed the last
command first is shown the rest and not one line of it:

1. A proposed type among the needs: `figma is proposed and not yet the
   town's; townd admin type approve figma first`.
2. A need with no credential of the pass's user: vault's line, `user
   dimitri holds no figma credential; add one with townd admin
   credential add --user dimitri --type figma`, or `connect one with
   townd admin credential connect …` for an `oauth` type; several,
   `--credential <id>` picks, as `grant new` does.
3. The shop's tests, when `tested_at` is null: run from the shop's
   directory in scratch, with the bindings just chosen opened through
   tellers against the real origins, as `shop add --user` runs them,
   the lines printed `ok`/`not ok` as `shop test` prints them. A
   failure leaves the permit pending, `tests 1/3 failed; the shop needs
   work, and the permit waits`, and every inner call is an audit row
   under an approval row the admin writes. A pass sets `tested_at`.
4. The grant, as hall makes it: the permit's commands or a subset, the
   constraints or more, the bindings, source `permit <id>`, the pass's
   live grant at the shop revoked and named.

`permit deny` is unchanged. The order is the order a person would want
to read: what the type is, whether they hold one, whether the shop
works on it, and only then the grant.

## The oauth kind

`src/oauth.ts` is the token endpoint's client and the authorize URL's
builder, and knows nothing of the store: `authorizeUrl({ authorize,
clientId, redirect, scopes, state, challenge })`, the URL with
`response_type=code`, `code_challenge_method=S256`, `access_type=offline`
and `prompt=consent` so a refresh token comes back; `pkce()`, a verifier
of 32 random bytes and its S256 challenge; `exchange({ token, clientId,
clientSecret, code, verifier, redirect })` and `refresh({ token,
clientId, clientSecret, refreshToken })`, each one POST of a form body,
the answer read as JSON `{ access_token, expires_in, refresh_token?,
scope? }`, a non-2xx answer returned as `{ error, status }` with the
body's `error` field and nothing else, since a body can quote a token.
An `oauth` credential's sealed value is JSON `{ refresh_token,
access_token, expires_at, scope }`; `credentials` gains `scopes` (the
granted ones, plain, for `credential ls`) and `revoked_why`.

`src/consent.ts` is the verb's flow, `townd admin credential connect
--user <name> --type <type> [--label <text>] [--port <n>] [--timeout
<duration>]`:

1. The type must be held and `oauth` with a registration; a `token`
   type is refused naming `credential add`; the user must exist.
2. A listener on `127.0.0.1`, `--port` or a free one, whose redirect
   URI is `http://127.0.0.1:<port>/`. The provider's client must allow
   loopback redirects; Google's desktop client type does, on any port.
3. The authorization URL is printed, on one line, for the person to
   open; the verb opens no browser itself, so what it does is the same
   on every box and in every test. A `state` of sixteen random bytes
   rides in it.
4. The redirect arrives: `state` must match or the request is answered
   404 and ignored; an `error` parameter is the provider's refusal,
   printed and exit 1; a `code` is exchanged at the token endpoint
   with the verifier. The browser is answered with one line of plain
   text, `connected; you can close this tab`, naming nothing.
5. The tokens are sealed as a new credential of the type, its label
   `--label` or the type's name, its scopes the answer's; the id is
   printed on stdout; the listener closes. An answer with no refresh
   token is refused with what to check at the provider, since without
   one the credential dies in an hour.
6. The timeout, five minutes when omitted, ends the wait with exit 1
   and nothing written. One audit row, pass null, shop null, `detail`
   `connected <type> for <user> in <n>s` or `consent refused <why>`.

The client secret and the tokens are in the verb's memory and the
sealed row. The verifier and the state never leave the process. The
code is used once and not kept.

## The gate's sixth step, with a refresh

`openBindings` in `src/gate.ts` opens each binding's row for the
runtime. For a `token` credential the value is the token, as vault
made it. For an `oauth` credential the value is the JSON above; when
`expires_at` is more than sixty seconds away, the access token is the
teller's token; otherwise `refresh` is called with the type's
registration, the row is sealed again with the new access token and
expiry, and the new refresh token when the provider rotated it, and
that access token is the teller's. The refresh happens before any
teller opens and before any process exists, so a denied or malformed
call still refreshes nothing, and gate's counting test still holds.
The audit row's `detail` says `refreshed google-oauth` when one was,
and the `credentials` column is vault's.

`invalid_grant` marks the credential revoked with `revoked_why`
`refresh refused`, and the call is denied as the refinement above
writes it, exit 2, result `denied`; liveness's query already excludes
a revoked credential, so the next `town --help` does not list the shop
and `credential ls` says `revoked (refresh refused)`. Any other refusal
is the call's `shop-error` with the endpoint's status in `detail`,
nothing on the agent's stderr but gate's failure line.

## The gdocs shop

`shops/gdocs/`: the draft's first seed shop, on `google-oauth`, an
`oauth` type the store does not seed, since a registration is the
operator's; the manifest defines it, as above, with the origin
`https://docs.googleapis.com` and the scope
`documents.readonly`. One command, `read --doc-id <id> [--format
text|markdown]`, about eighty lines: a GET of
`$TOWN_CREDENTIAL_GOOGLE_OAUTH/v1/documents/<id>`, the body's
paragraphs walked to text, headings as `#` lines in `markdown`. A
non-2xx answer is exit 1 with the status and nothing else. One test,
`read --doc-id no-such-document` expecting exit 1, which reaches Google
signed and reads nothing; the read is the walk's. The operator adds it
with `shop add shops/gdocs --user dimitri` after connecting, and the
add proposes and, being the operator's, holds the type in one step,
taking the registration as `type add` does.

## The store

Schema 6, and a store made by wall is migrated in place on open:
`credential_types.kind` default `token`, `state` default `held`,
`proposed_by`, `guidance` default empty, `oauth`, `client`; `credentials.scopes`, `revoked_why`;
`shops.tested_at`, set to `added_at` for every existing row, since each
was tested when it was added. Permits are hall's; a permit's needs are
read from the shop's manifest and the user's credentials when listed,
never stored, so an approval reads the town as it is.

## The admin, with two verbs and two grown

- `type add`, grown for `oauth`; `type approve <name> [--client-id
  <id>]`, the secret on stdin; `type ls` with kind, state, and
  proposer; `type rm` as vault's, and of a proposed type while no shop
  names it.
- `credential add`: refused at an `oauth` type, naming `connect`, and
  at a proposed type, naming `approve`. `credential connect`, as above.
  `credential ls` gains `scopes` and shows `revoked (refresh refused)`.
- `permit ls` with needs; `permit show <id>`, the checklist; `permit
  approve` in the order above, printing the checklist that remains on
  a refusal.
- `credential add` and `credential connect` print the type's guidance
  under `<shop> says:` before reading stdin or printing the URL, when
  the type has any, so the person at the prompt is told what to paste
  or what to expect in the browser.
- `type add` takes `--guidance <text>` for a type the operator defines
  themselves, so the seeded and hand-added types can tell a person
  where their token is made too.
- `shop add <dir> --user <name>`: a manifest defining a type the town
  does not hold proposes and holds it in one step, the operator being
  the trust root, and for `oauth` takes `--client-id` and the secret on
  stdin; then vault's path.
- `audit`: rows for `connect` and for an approval's tests, and
  `refreshed <type>` in `detail`.

The server reads the store on every call, so a type approved, a
credential connected, and a permit approved at the box are in the
agent's next `town --help`, and a refresh written by one call is read
by the next.

## Testing it

- **checkout**: the manifest's need shapes, each rule and refusal, a
  definition matching and differing from a held type, a registration
  key refused, guidance without a definition, over length, and naming a
  host the type does not send to; `permit show`'s checklist in each
  state, the done marks, the `oauth` lines, the one-line case, and the
  same text from a refused `permit approve`; guidance printed at `type
  approve`, `credential add`, `connect`, `requests`, and `show`, and
  attributed to the shop; proposed types made by publish and `shop add`, met and
  refused by a second manifest, refused at `credential add`, approved
  with and without a registration; the publish path for a shop with
  needs with a fake runtime: tests waiting, the permit made and
  replaced, the publish grant not made, `tested_at` cleared; `permit
  approve`'s four steps with a fake runtime, each refusal leaving it
  pending, the tests run at step 3 with the binding and their rows
  under the approval; `src/oauth.ts` against a fake authorization
  server in process, `test/helpers/authserver.ts`: the URL's
  parameters, PKCE verified by the fake, the exchange, the refresh, a
  rotated refresh token, `invalid_grant`, a 500; `src/consent.ts` with
  the fake: the redirect with a wrong `state` ignored, `error`, no
  refresh token, the timeout, the browser's answer naming nothing; the
  gate's sixth step with a fake vault and clock: no refresh with a
  minute left, a refresh and the row re-sealed at the boundary, the
  revocation on `invalid_grant` and the denial's words, nothing
  refreshed on a denied call; the store's migration from a wall-era
  database. In process, vitest, fast.
- **command**: journey 1 steps 1 to 8 and journey 2 steps 1 to 9
  against a server the test starts, with a fake origin and the fake
  authorization server on loopback, a scripted agent, a bundle that
  proposes a `token` type and one that proposes an `oauth` type, the
  redirect delivered by the test's own request to the listener, and
  the prying entry from wall as the published shop's entry once, to
  show the value in nothing it printed; journey 3 steps 1 to 7. The
  server, the directory, and the key are gone after.
- **by hand, ⚑ provision**: a Google OAuth client of the desktop type
  the operator registers, `town/gdocs` added on a real consent, one
  document read. The registration and the credential are the
  operator's, and a test never needs them.
- **the walk, ⚑ provision**: a provider with a pasteable token the
  town has never seen, Figma if the conductor has an account and any
  other with a personal token otherwise; a real Claude Code session
  with a hall grant asked to build a shop for it and use it; the
  permit's needs read, the person following `permit show`'s checklist
  and the agent's guidance and nothing else, the type approved, the
  token pasted, the permit approved with the tests running then; the
  agent using the shop; then
  asked to read a Google document's first line, so `town/gdocs` from
  the by-hand step is used by an agent; the token and the tokens
  searched for in the transcript, the directory, the shop's directory,
  and `town.db`. One model session, well under a dollar, and one token
  the person revokes after.

## What this does not do, on purpose

- **The Square.** `permit show`'s checklist is its one screen, verb
  for verb, and a need's guidance is the text on it.
- **A person who has never made a token.** The guidance says where and
  what; it does not teach what a personal access token or an OAuth
  client is. The survey counts the minutes, and a walk where the
  conductor could not follow the checklist is a finding.
- **A person not at the box.** `credential connect` is the operator's
  verb on the operator's terminal; a person connecting to a town on
  another machine, their loopback and the town's store apart, is the
  box's, and the verb's shape is built for the split: the flow on the
  person's side, the sealing on the town's.
- **A provider that refuses loopback.** One that requires a public
  redirect needs a page the town serves, which needs a name and TLS:
  the box's. The walk's providers are chosen so it does not bite.
- **Scope escalation shown as a diff.** A republish that gains a need
  makes the grant not live and asks again, which is the draft's §10.4
  outcome without its screen; a republish that widens an `oauth`
  type's scopes is a differing definition and is refused. The screen
  is the Square's.
- **A registration an agent supplies.** Never: the manifest may
  propose endpoints and scopes, and the client is the operator's.
- **A credential shared across users, or more than one per type on a
  grant.** Vault's open item, the draft's open question 7.
- **Fixture credentials.** The person's credential is the fixture, and
  tests read. The draft's open question 3 stays open for a public
  registry.
- **A `token` credential that expires.** Vault's finding stands: a
  401 reaches the shop and the audit says `shop-error`; a
  `credential-expiring` notice when a provider says when.
- **Revoking at the provider.** `credential rm` revokes in the town;
  the provider's own revocation endpoint is a courtesy for the Square.
