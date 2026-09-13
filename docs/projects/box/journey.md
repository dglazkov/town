---
status: partial
since: 2026-09-13
see: box
note: "written 13 Sep 2026, the day consent closed: the town's box, where the town leaves the laptop as one Cloudflare Worker with the store in a Durable Object, a shop run in an isolate whose only way out is the window the town opened for the call, the operator's verbs over the wire with a token of their own, and a consent landing at the town's own address; `runtime: worker` beside `runtime: subprocess`, and the four shops made worker shops that run on both boxes. Measured in docs/spikes/box before a word was written. Box phase 0 closed journey 3 the same day: the store over a `Sql` seam and positional throughout, the shelf, the key source, the window's rule, schema 7, `runtime: worker` in spec §7, and the four shops as worker shops run through `bin/main.js` within the seatbelt, every earlier test green. Box phase 1 ran a worker shop in an isolate in workerd, in a third test ring: memory, github, and gdocs passing every test through a window to a fake origin behind the Worker's own fetch, the state and its eight-megabyte cap, the four exits alike on both boxes, and wall's prying shop finding its env strings alone and no request leaving but the window's."
---

# Box — the journeys

Gate put the town on one laptop, vault gave a shop the outside world on
a credential it never holds, compose let shops call shops, hall let an
agent write one, wall enclosed its process, and consent let a
credential the town had never seen enter it by a person's yes. Every
one of them ran on a laptop, listening on loopback, and said what that
cost: the agent shares the box with the town, a person not at the box
cannot connect a credential, a provider that refuses loopback has no
way in, and a sheep in a cell on Cloudflare cannot reach the town at
all. **This project puts the town on a Cloudflare Worker: the store in
an object, a shop in an isolate loaded for the call with exactly the
bindings its manifest earns and no other way out, the operator's verbs
over the wire with a token of their own, and a consent that lands at
the town's address; `runtime: worker` beside `runtime: subprocess`, so
one shop runs on both boxes; and `town` unchanged.**

Each journey is an acceptance test: the work is done when it can be
walked as written. [design.md](design.md) is the mechanism and
[phases.md](phases.md) the walk. If a journey and the mechanism
disagree, the mechanism is what changes.

Vocabulary the journeys use, on top of the earlier projects':

- **The box**: the town as one Worker on the operator's Cloudflare
  account, deployed by `pnpm box deploy`, and the object in it that
  holds the store, the shops' files, and every shop's state.
- **A laptop**: the town as the six projects before this one built it,
  `townd serve` over a data directory, shops walled by Seatbelt.
- **A worker shop**: a shop whose manifest says `runtime: worker`: its
  entry exports `main`, and it runs as a process on a laptop and in an
  isolate on the box. A subprocess shop runs on a laptop alone.
- **The isolate**: a worker shop's process on the box: a Worker loaded
  for the call, gone after it.
- **The window**: on the box, the call's one way out: every `fetch` the
  shop makes goes to it, and it forwards a need's requests to the
  need's origin, answers a shop's own calls as the clerk did, and
  refuses everything else by URL.
- **The wire**: `townd admin --town <url>`: the operator's verbs posted
  to the box with the operator's token and printed as they come back.
- **The operator's token**: made once at the deploy, kept at
  `~/.town/operator`, shown once.
- **The landing**: `https://<box>/consent/<state>`, where a provider's
  redirect arrives.
- **The prying shop**: wall's fixture, an entry that prints everything
  it can reach and every refusal, written as a worker shop.

## Journey 1: The operator's box is a Worker

The operator at this laptop, with a Cloudflare account, this checkout,
and nothing of the town's deployed.

1. `pnpm box deploy` with no `CLOUDFLARE_API_TOKEN` in the environment
   prints what it needs and what it costs, the token's permissions by
   name, and exits 2 having made nothing. **⚑ provision** from here on.
2. `CLOUDFLARE_API_TOKEN=… pnpm box deploy --name town-<name>` deploys
   the Worker, makes the two secrets, writes `~/.town/operator` with
   mode 600, prints the operator's token once and the box's address,
   and reads `town` from the address's `GET /`. Run again, it redeploys
   and keeps both secrets; the report says so. The deploy pulls no
   image and builds nothing native.
3. `townd admin --town <url> user add dimitri` prints what it prints at
   a laptop. `townd admin --town <url> shop add shops/memory` is
   refused: `over --town a shop comes from stdin: tar --format ustar
   -cf - -C shops/memory . | townd admin --town <url> shop add -`. Typed
   as printed, `shop add -` validates the manifest, runs the shop's
   five tests in isolates, and adds it; `shop ls` shows it. The same for
   `shops/github` with `--user dimitri` after `credential add`, and for
   `shops/watch`.
4. `shop add -` of a shop whose manifest says `runtime: subprocess` is
   refused: `runtime: subprocess runs on a laptop; this box runs a
   shop in an isolate: write runtime: worker (spec §7)`. Nothing added.
5. `townd admin --town <url> pass new --user dimitri --label
   "research assistant" > ~/work/.town/grant` writes a grant file whose
   `town` is the box's address; `grant new --pass <id> --shop
   town/memory --commands remember,recall,list` makes the grant. In
   `~/work`, `town --help` lists the shop with its three commands and
   the pass's label. `town memory remember --key t/a --value hello`
   exits 0; `town memory recall --key t/a` prints `hello`; from another
   directory with a copy of the grant file, `recall` prints the same:
   the state is the box's, not the directory's.
6. `townd admin --town <url> audit` prints the rows with `isolate` in
   the `wall` column for every call that ran, and `-` for the hall's
   and the denied.
7. `townd admin --town <url> grant revoke <id>`: the next `town memory
   recall` is denied in gate's words, and `town --help` no longer lists
   the shop. `pass revoke` makes the grant file paper.
8. `townd admin --town <url> …` with `~/.town/operator` moved away and
   no `$TOWN_OPERATOR` is refused naming both; with a wrong token it
   prints `the operator token is refused`, exit 1, and the box wrote no
   row. `townd admin --town <url> --data <dir> …` is refused as one or
   the other; `--wall` over `--town` is refused as not the operator's to
   choose.
9. Every answer of the box carries `x-town-build` with the commit the
   deploy was made from.
10. `pnpm box delete --name town-<name>` lists what it removes, waits
    for the name typed at a terminal, deletes the Worker, and removes
    `~/.town/operator`. The address answers nothing after; the account
    lists no Worker of that name.

Acceptance criteria:

- Nothing is on the account without `CLOUDFLARE_API_TOKEN`, and a
  proof that deploys to a throwaway name deletes it; the operator's
  own box is the one deploy that stays.
- Steps 3 to 9 run as a `command` test against `wrangler dev` on a
  free port with the secrets set as vars, through the built `town` and
  `townd`; the operator's journey needs no account to prove.
- `src/cli.ts` learns nothing: no `box`, no `worker`, no `isolate`, no
  `wrangler`, no `operator`; the guard says so.

## Journey 2: A shop within its isolate

The box of journey 1 after step 3, with dimitri's pass holding
`town/hall`, `town/memory`, and `town/github`.

1. The prying shop, published by dimitri's agent as a worker shop with
   no needs: its report names its own files under `/bundle` readable,
   its state readable and writable, a write beside its own entry
   refused, `fetch` of any address throwing the runtime's line that it
   is not permitted to reach the internet, `node:child_process`'s
   `spawnSync` not implemented, and its environment exactly
   `TOWN_STATE` and `TOWN_USER`. Its audit row says `isolate`.
2. The same shop with a need for `github-token`, granted on dimitri's
   credential: its environment gains `TOWN_CREDENTIAL_GITHUB_TOKEN`, a
   URL under `http://window/`; a request under it reaches the origin
   with the type's header set from the token; a request to
   `https://api.github.com` itself, or to any other address, is
   answered 403 naming the call and never leaves the box. The token is
   in nothing the shop printed and in no row of the store but the
   sealed one.
3. `town watch mark --repo octocat/Hello-World` on dimitri's pass with
   grants at `town/watch`, `town/github`, and `town/memory`: the watch
   shop reads `TOWN_GRANT`, posts its own calls to the town in it with
   the bearer in it, and each is decided by the gate as dimitri cut by
   watch's manifest and recorded under watch's call; `audit --call`
   prints the tree. A call watch's grant does not cover is denied one
   level down in compose's words, and the agent reads them.
4. `town memory remember --key big` with a value that would leave the
   state over eight megabytes fails with the cap's line, and `recall`
   of a key written before still answers: the state stayed as it was.
5. A worker shop whose entry does its work at the top level is exit 1
   at every call with spec §7's line that the entry exports no `main`;
   its stderr is in the audit. A shop whose entry does not parse is
   exit 1 with the runtime's line.
6. A call that runs past thirty seconds of wall clock is ended and
   says so, as on a laptop; the CPU limit is the platform's, proved
   on the deployed box in journey 5 and skipped by name in the ring.
7. Two users' states at one shop are two sets of rows: dimitri's
   `recall` never sees alice's key, and a key of `../escape` is refused
   by the shop as on a laptop, since `/tmp/state` is the same directory
   rule.
8. The exfil test, turned a second time: the prying entry under
   `runIsolate` reads its files and its state, is refused the store,
   the secret, and the network, sends four requests of which one
   arrives at the origin signed and three are refused, and its audit
   row says `isolate`. There is no `--wall none` on the box and no
   mutation that opens it; the test that proves the wall is the one
   that loads the shop with a `globalOutbound` of the town's own
   `fetch` and watches the request leave.

Acceptance criteria:

- Every step runs in workerd through the vitest pool, in the `box`
  ring, with a fake origin behind the Worker's own `fetch`; the ring
  needs no account and no network.
- The isolate's `env` holds strings alone: a test reads every value the
  entry was given and finds no binding, no stub, and no function.
- The token reaches the window's props and the origin's header and
  nothing else: a grep of the isolate's `env`, its stdout, its stderr,
  and its state after the call finds it in none.

## Journey 3: One shop on both boxes

The operator at a laptop with the town of consent, its data directory
and its four shops.

1. `shops/memory/manifest.yaml` says `runtime: worker`, and
   `shops/memory/main.mjs` exports `default async function main()`
   around the program it had, its imports kept; the same for github,
   watch, and gdocs. `townd admin shop add shops/memory` runs its five
   tests as it did, each as a process under the town's own Node through
   `bin/main.js`, within the box's seatbelt; a call to it under a grant
   runs the same way, and `townd admin audit` says `seatbelt` on its
   row. Every `command` test of gate, vault, compose,
   hall, wall, and consent passes unchanged in what it asserts.
2. `townd spec` §7 has one paragraph more: `runtime: worker`, the
   program as a function, what it may not do at the top level, and what
   is the same; and one line in the environment's list that on the box
   there is no `PATH` and a shop with dependencies posts to the town in
   `TOWN_GRANT` itself. A manifest with `runtime: box` is refused naming
   `subprocess` and `worker`.
3. A worker shop whose `main` returns 3 exits 3; one that throws exits 1
   with the error's line on stderr; one that calls `process.exit(2)`
   exits 2; one whose entry exports no `main` exits 1 with spec §7's
   line, on a laptop as on the box.
4. A subprocess shop still runs on a laptop as it did: `shops/` keeps
   none, and the test fixtures keep one, so the runtime's first list is
   still proved.
5. The store opened by consent opens under box with every row intact
   and its schema at 7; `src/schema.ts` loads no `node:sqlite` itself,
   and every query in the store is positional.

Acceptance criteria:

- `pnpm test` is green on both rings with the four shops as worker
  shops, and the walk fixtures of the earlier projects need no change.
- A proof that finds a worker shop passing on one box and failing on
  the other for a reason spec §7 does not name has found the bug.

## Journey 4: A consent lands at the town

The operator of journey 1, at this laptop, with a Google OAuth client
of the web kind whose redirect URI is the box's landing.

1. `printf '%s\n' "$CLIENT_SECRET" | townd admin --town <url> type add
   google-oauth --kind oauth --authorize … --token … --scopes … --client-id
   <id>` holds the type with its registration sealed in the object, as
   at a laptop; `type ls` shows it.
2. `townd admin --town <url> credential connect --user dimitri --type
   google-oauth` prints the type's guidance and one URL, whose
   `redirect_uri` is `https://<box>/consent`, and waits. Opened and
   consented to in a browser on this laptop, the redirect lands at the
   box, the browser reads `connected; you can close this tab`, and the
   verb prints the credential's id. `credential ls` shows it with its
   scopes and no value. Refused at the provider, the verb prints the
   provider's error and exit 1, and nothing was written. Left alone
   five minutes, exit 1 the same. A second request to the same landing
   is refused as already done.
3. `tar … -C shops/gdocs . | townd admin --town <url> shop add - --user
   dimitri` runs the shop's test in an isolate through the window
   against Google on dimitri's credential and adds it; `town gdocs read
   --doc-id <id>` under a grant prints a document's text. An hour on,
   the next call's audit row says `refreshed google-oauth`: the refresh
   ran in the object and the row was sealed again.
4. A landing with a `state` the object does not hold, or with `error`
   from the provider, answers the browser in consent's words and writes
   nothing; the audit shows the consent as one row, pass `-`, `detail`
   `connected google-oauth for dimitri in <n>s`.
5. `townd admin --data <dir> credential connect` at a laptop still
   listens on loopback and lands there; the flow's words are the same
   in both.

Acceptance criteria:

- Steps 1, 2's refusals and timeout, and 4 run in the `box` ring with a
  fake authorization server behind the Worker's `fetch`, the redirect delivered by
  the test's own request to the landing; step 3's refresh runs there
  with the clock var moved an hour.
- Steps 2 and 3 are walked by hand once, on the deployed box, with a
  real Google registration; the test never needs it.
- The registration's secret and the tokens are in no answer the wire
  returned, no line the pipe printed, and no row but the sealed ones.

## Journey 5: The first agent on the box

A real Claude Code session in a directory on this laptop with a grant
file naming the deployed box, told the one sentence; dimitri's pass
holds `town/hall` in full and `town/memory` with its three commands;
the box holds `town/gdocs` from journey 4 and dimitri's consent.

1. Asked to write a shop that reports what it can see of where it
   runs, put it in the town, and run it, the agent reads `town hall
   spec`, writes a worker shop, since §7 says what a shop on this town
   is, gets it through `validate`, publishes it, and runs it; its report
   names its own directory and its state readable and everything else
   refused, and the agent says so in its own words. The audit over the
   wire shows the publish, the tests under it, and the call, every row
   that ran `isolate`.
2. Asked to read the first line of a Google document, the agent finds
   `town/gdocs` in `town hall search`, asks with `town hall request`, a
   permit the operator approves over the wire, and reads the line with
   no call denied.
3. Asked to fetch a page from the web and say what it says, the agent
   tries and reports that its shops cannot reach the web, as wall's
   agent did.
4. `grep -r` for the pass's token beyond the grant file, the operator's
   token, and Google's tokens over the transcript and the directory
   finds none of them.

Acceptance criteria:

- The walk is walked for real, at the shepherd's cost of one model
  session, well under a dollar, and the transcript is read for what the
  agent said about `runtime: worker` and about what its shop reached.
- Every row of the audit for the session is read over the wire, and the
  count of `isolate` rows is recorded as a finding with the cost the
  platform reported for the day.
