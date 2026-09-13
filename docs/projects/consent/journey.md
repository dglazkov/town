---
status: done
since: 2026-09-13
see: consent
note: "written 13 Sep 2026, the day after wall closed: the town's consent, where a credential the town has never seen is proposed by an agent's manifest, shown to a person with its origin, and connected by that person at their own terminal, pasted once or consented to in a browser; the grant that binds it is a permit, and the town refreshes what expires. Consent phase 0 closed 13 Sep 2026: a token type proposed with the shop, the permit in the publish grant's place, and permit show's checklist typed as printed to a grant with the tests run at approval. Consent phase 1 closed the same day: the oauth kind, connect on loopback, the refresh and the revocation, and town/gdocs, proved against fakes and by hand against Google. Consent phase 2 walked the same day: a real agent proposed a Figma type, a person with no account made the token from its guidance, and gdocs read a real document; journey 4, a republish's guidance and a credential replaced when a token falls short, written after it and closed by consent phase 3 the same day."
---

# Consent — the journeys

Vault proved that a shop can be given the outside world on a person's
credential without ever holding it, and hall that an agent can write a
shop, put it in the town, and ask for what its grants do not allow. But
hall's rule was that a shop an agent sends holds no credential of its
own, and vault's types were the operator's alone, seeded or typed at
the box. **This project lets an agent's manifest propose a credential
type the town has never seen, lets a person read where the secret
would go and say yes, tells that person, in the agent's words and as a
checklist at the box, where the secret is made and what to type, lets
them connect it at their own terminal, pasted once or consented to in
a browser, and keeps the grant that binds the two a permit, decided
and never a side effect.**
One new kind of type, `oauth`, whose secret is a refresh token the town
trades for access tokens before a call; one new shop, `town/gdocs`, the
draft's first seed; the operator at the box still the whole human side.

Each journey is an acceptance test: the work is done when it can be
walked as written. [design.md](design.md) is the mechanism and
[phases.md](phases.md) the walk. If a journey and the mechanism
disagree, the mechanism is what changes.

Vocabulary the journeys use, on top of vault's and hall's:

- **A kind**: what a type's secret is. `token`, a value a person pastes,
  vault's kind; or `oauth`, a refresh token the town holds and trades.
- **A proposed type**: a type an agent's manifest defined, held by the
  town as a proposal until a person approves it, and by no credential
  before then.
- **A registration**: an `oauth` type's app at the provider, the client
  id and the sealed client secret, the operator's and never an agent's.
- **A consent**: `townd admin credential connect`, which prints the
  provider's authorization URL, catches the redirect on loopback, and
  seals what comes back.
- **A need's guidance**: prose the agent wrote beside a type's
  definition, for the person: where the secret is made and what to
  allow, or what to register. Shown as the shop's words wherever a
  person meets the type.
- **A permit's needs**: what a permit at a shop with needs waits on, per
  type: whether the type is the town's, whether the user holds a
  credential of it, and the guidance.
- **The checklist**: `townd admin permit show <id>`: a permit's needs
  as the commands to type, in order, ids filled in, done ones marked.
  A refused `permit approve` prints what remains of it.
- **A refresh**: the town trading an `oauth` credential's refresh token
  for a new access token, before a call, when the old one is about to
  expire.

## Journey 1: The agent's shop needs a credential the town has never seen

An agent in a directory with `.town/grant`, told the one sentence, on
hall's stage: dimitri's pass holds `town/hall` with every command and
`town/memory` with `remember`, `recall`, and `list`. The town holds
`town/hall`, `town/memory`, `town/github`, and one type, `github-token`.
The person asks for a shop over a provider the town has no type for.

1. `town hall spec` §8 says a need may define its type: `origin` and
   `header`, and for an `oauth` type its `authorize` and `token`
   endpoints and `scopes`, with `guidance` for the person who will make
   the secret; that a definition of a type the town holds must match
   it or be left out; and that a registration is never the
   manifest's.
2. The agent writes `figma/manifest.yaml` with `credentials: [{ type:
   figma, origin: https://api.figma.com, header: "X-Figma-Token:
   {token}", guidance: "Make a personal access token at Figma >
   Settings > Security, with file_content:read, and paste it." }]` and
   an entry that sends to `$TOWN_CREDENTIAL_FIGMA`. `… | town hall
   validate` prints `ok dimitri/figma 0.1.0: file, comments`, exit 0.
   A guidance that says to paste the token at a page on another host is
   refused naming the host and the rule. The same manifest with
   `type: github-token` and an origin of `https://api.figma.com` is
   refused: `credentials[0]: github-token is a type this town holds, at
   https://api.github.com in Authorization; leave the definition out,
   or write that (spec §8)`. One with `client_id` under `oauth` is
   refused naming the key.
3. `… | town hall test` prints `tests wait: dimitri/figma needs figma,
   which no grant of yours binds; they run when a person approves your
   permit`, exit 0. Nothing in the town changed.
4. `… | town hall publish` prints the same line, then `published
   dimitri/figma 0.1.0; it needs figma, so a person decides at the box:
   requested prm_…, and town --help shows the answer`, exit 0. `town
   --help` does not list the shop. `town hall requests` lists the
   permit, `pending`, with needs `figma: proposed
   (https://api.figma.com), none connected`, and under the table the
   need's guidance as `dimitri/figma says: Make a personal access token
   …`. `town hall show --shop dimitri/figma` prints the shop's help,
   `needs figma (none connected)`, and the same guidance.
5. A second publish, the manifest's origin changed to
   `https://api.figma.com/v2`, is refused as a differing definition,
   naming what the town holds; the origin a person will read is the one
   the agent first wrote. A second publish with a new command replaces
   the shop and the pending permit, which now asks for three commands.
6. Approved at the box, after the type is approved and a credential
   pasted: `town --help` lists `dimitri/figma`, `requests` says
   `approved as grt_…`, and `town figma file --key <key>` prints what
   Figma answered to a request the town signed. The shop's process saw
   an address and no token: an entry that prints its environment
   finds `TOWN_CREDENTIAL_FIGMA` and a loopback URL.
7. A manifest proposing an `oauth` type, `google-oauth` with Google's
   endpoints and one scope, validates and publishes the same way; its
   permit's needs say `google-oauth: proposed
   (https://docs.googleapis.com), none connected`, and once the type
   is the town's and a credential connected, `approved`.
8. The walk: the agent, asked to build a shop for a provider the town
   has no type for and use it, reads the spec, proposes the type in
   its manifest with guidance it wrote from the provider's docs,
   publishes, and tells the person a permit waits at the box, where to
   make the token and what to allow, and that `townd admin permit show`
   at the box lists the rest; the person makes the token from what the
   agent said and follows the checklist and nothing else; the agent
   then uses the shop with no call denied. Asked then to
   read the first line of a Google document, it finds `town/gdocs` in
   `town --help` and reads it.

Acceptance criteria:

- Everything the agent learns about a type it proposed is what it
  wrote and the permit's state; nothing names a credential's id, the
  operator's registration, or a path on the box.
- Every word a person is told about where to make a secret is the
  shop's, attributed to it, and names no host the type does not send
  to.
- No grant at a shop with needs exists that a person did not make: the
  publish grant is made at a shop with no needs alone, and a test
  enumerates the sources of every grant after each step.
- Every publish of a shop with needs is an audit row whose `detail`
  the survey can count: `published dimitri/figma 0.1.0; requested
  prm_…`.

## Journey 2: The operator consents

The operator of hall's journey 2, at the box, with the town of
journey 1 after step 4.

1. `townd admin type ls` shows `github-token` as `token`, `held`, and
   `figma` as `token`, `proposed`, `dimitri/figma`, with its origin and
   header. `townd admin credential add --user dimitri --type figma` is
   refused: `type figma is proposed by dimitri/figma and not yet the
   town's; townd admin type approve figma makes it so`.
2. `townd admin permit ls` shows the permit with needs `figma: proposed
   (https://api.figma.com), none connected`. `townd admin permit show
   <id>` prints the checklist: the shop's summary; the need, its
   origin, `dimitri/figma says: Make a personal access token at Figma >
   Settings > Security …`, `none connected`; then `to do:` with three
   commands in order, `type approve figma`, `credential add --user
   dimitri --type figma` with the token on stdin, and `permit approve
   <id>` noting the tests it will run, none marked done. `permit
   approve <id>` typed first is refused, `figma is proposed and not yet
   the town's`, and prints the same three lines under `to do:`; the
   permit stays pending.
3. `townd admin type approve figma` prints the type's kind, origin,
   header, and guidance, and makes it held. `permit show <id>` marks
   the first line `done`. `permit approve <id>` is now refused with
   vault's line, `user dimitri holds no figma credential`, and the two
   lines that remain.
4. `printf '%s\n' "$TOKEN" | townd admin credential add --user dimitri
   --type figma --label "dimitri's figma token"` prints the guidance
   under `dimitri/figma says:` on stderr before reading stdin, then the
   id on stdout. `permit show <id>` marks two lines `done`. `permit
   approve <id>` runs the shop's tests on it, `ok`/`not ok` per test,
   through tellers against the origin; on a failure the permit stays
   pending and the line says the shop needs work; on a pass it makes
   the grant and prints its id. `grant ls` shows the binding
   `figma=cred_…` and source `permit <id>`. `audit --call <the
   approval's row>` shows the tests' calls under it.
5. A manifest proposing an `oauth` type, published by the agent: `type
   ls` shows `google-oauth` as `oauth`, `proposed`, with its endpoints
   and scopes. `type approve google-oauth` without `--client-id` is
   refused naming it; `printf '%s\n' "$SECRET" | type approve
   google-oauth --client-id <id>` makes it held, the secret sealed.
   `credential add` at it is refused naming `connect`.
6. `townd admin credential connect --user dimitri --type google-oauth`
   prints the type's guidance under the shop's name, then one URL, and
   waits. Opened in a browser and consented to, the
   redirect lands on `127.0.0.1`, the browser reads `connected; you can
   close this tab`, and the verb prints the credential's id. `credential
   ls` shows it with its granted scopes and no value. Refused at the
   provider, the verb prints the provider's error and exit 1, and
   nothing was written. Left alone five minutes, exit 1 the same.
7. `townd admin shop add shops/gdocs --user dimitri --client-id <id>`,
   the secret on stdin as `type approve` takes it, holds `google-oauth`
   as the manifest defines it when the town lacks it, and says so; while
   dimitri holds no credential of it, the add is then refused naming
   `credential connect`, the type held and the shop not added. After
   connecting, the same `shop add` runs the shop's one test through a
   teller against Google on dimitri's credential and adds the shop; with
   the type already held, as vault's `shop add` runs.
8. `townd admin type rm figma` is refused while dimitri's credential
   holds it; `credential rm` of a credential an approval's tests ran on
   names the grant that stops being live. `type rm` of a proposed type
   no shop names removes it.
9. `townd admin audit` shows the consent as one row, pass `-`, `detail`
   `connected google-oauth for dimitri in <n>s`, and a later call at
   `town/gdocs` with `refreshed google-oauth` in its detail once the
   access token has aged an hour.

Acceptance criteria:

- Every operator verb works with the server stopped and running; the
  database and the key file are the meeting point, and a type
  approved, a credential connected, or a permit approved at the box is
  in the agent's next `town --help`.
- A `command` test walks steps 1 to 9 against a server it starts, with
  a fake origin and a fake authorization server on loopback, the
  redirect delivered by the test's own request to the listener, so the
  ring needs no registration, no token, and no network.
- The checklist is enough: the same test, given a permit, types only
  the commands `permit show` printed, in the order printed, and ends
  with the grant made; and the walk's conductor does the same by hand
  with no other source.
- A store made by wall opens under consent with every row intact,
  every existing type `token` and `held`, every existing shop
  `tested_at` its `added_at`.

## Journey 3: The town signs with a token it refreshes

A shop author, and a person who wants to know what the town does with a
refresh token.

1. An `oauth` credential's sealed value is the refresh token, the access
   token, its expiry, and the granted scope, and no verb prints any of
   them; `strings town.db` holds none. The registration's secret is
   sealed the same way.
2. A call at a shop bound to an `oauth` credential whose access token
   has more than a minute left opens a teller on that token and
   refreshes nothing. One whose token is within a minute of expiry, or
   past it, trades the refresh token at the type's token endpoint
   first, with the registration, seals the new access token and expiry
   into the row, keeps a rotated refresh token when the provider sends
   one, and opens the teller on the new token; the audit's detail says
   `refreshed google-oauth`. The refresh happens before any teller
   opens and before any process exists, so a denied or malformed call
   refreshes nothing, and gate's counting test says so.
3. The shop's environment is vault's: `TOWN_CREDENTIAL_GOOGLE_OAUTH` and
   a loopback URL. Nothing the shop can read holds the access token,
   the refresh token, or the secret; the prying entry, published on the
   type and run walled, prints none of them.
4. A refresh the endpoint answers `invalid_grant` marks the credential
   revoked, `revoked_why` `refresh refused`; the call is exit 2 with
   `not available to this grant: its google-oauth credential needs
   connecting again at the box`; `town --help` no longer lists the
   shop; `credential ls` says `revoked (refresh refused)`. A refresh
   the endpoint answers 500 is the call's `shop-error` with the status
   in `detail`, the credential untouched, and the next call tries
   again.
5. The consent's authorization URL carries `response_type=code`, a
   `state` of sixteen random bytes, an S256 code challenge, the type's
   scopes, and the loopback redirect; the redirect is answered only
   when `state` matches, and the exchange sends the verifier. A
   redirect with the wrong `state`, a second redirect, or a request to
   any other path is 404 with an empty body.
6. The listener is on `127.0.0.1` alone and closes when the verb ends,
   by success, refusal, or the timeout; after it, the port refuses.
7. `townd spec` §8 says all of it, guidance included, in about fifteen
   more lines, and the spec is still under three hundred by the test's
   count.

Acceptance criteria:

- No refresh token, access token, or client secret is ever in a
  process's argv, environment, or stdin, in the audit, in a shop's
  state, or on stderr; the gate holds the access token in memory for
  the call and the teller alone reads it.
- The teller does not change: `src/teller.ts` is untouched by this
  project, and its tests pass as vault wrote them.
- `src/cli.ts` learns nothing: the guard passes with `consent`,
  `connect`, `oauth`, and `refresh` among the forbidden words.

## Journey 4: The token falls short

The town of journey 2 after step 4: `dimitri/figma` published by the
agent with guidance asking for `file_content:read`, the type held, the
credential `credential_A` pasted, the permit approved. Its `comments`
needs a scope that token lacks. This is what consent phase 2's walk
found.

1. `town figma comments --key <key>` is exit 1 with the provider's 403
   in the shop's words; the audit says `shop-error`. `name` answers.
2. The agent fixes its guidance to name both scopes and republishes with
   the same definition: `published dimitri/figma 0.2.0; figma's
   guidance is now dimitri/figma 0.2.0's`, and the person's grant
   stands, the line ending `if the shop needs a new secret, town hall
   request --shop dimitri/figma asks a person`. `townd admin type
   approve`'s printout and `credential add`'s prompt now print the new
   words. A shop that did not propose `figma`, publishing other guidance
   beside the same definition, leaves the type's words as they are, and
   its own permit shows its own.
3. The agent tells the person to make a token with both scopes, and runs
   `town hall request --shop dimitri/figma`. `townd admin permit show
   <id>` prints the need with `dimitri's: credential_A`, the guidance in
   the new words, and under `to do:` the line `or, to use a new secret
   instead:` with `printf '%s\n' "$TOKEN" | townd admin credential add
   --user dimitri --type figma --label figma --replace credential_A`,
   then the approve line.
4. Typed as printed, the replacement prints `credential_B` and
   `grant_… at dimitri/figma now uses credential_B`; `credential ls`
   shows `credential_A` `revoked (replaced by credential_B)`; the approve
   line runs the shop's tests on `credential_B` and makes the grant; and
   `town figma comments` answers.
5. `--replace` of a revoked credential, of another type's, or of another
   user's is refused naming which, and nothing is written. `credential
   connect --replace` replaces an `oauth` credential the same way.

Acceptance criteria:

- The checklist is enough: a `command` test replays steps 1 to 4 against
  a fake origin that answers `comments` only for a wide token, types
  only the lines `permit show` printed, and ends with `comments`
  answered.
- After a replacement, no unrevoked grant reads a revoked credential,
  and every grant that read the old one reads the new one with its
  shop, commands, constraints, and source unchanged.
- Every word a person is told about where to make a secret is still the
  shop's and still names no host the type does not send to.
