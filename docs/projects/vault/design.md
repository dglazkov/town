# Vault — the design

**12 September 2026.** Planned: nothing built. The project's status lives
in [journey.md](journey.md)'s front matter. The journeys are the
acceptance suite, this doc is the argument, and [phases.md](phases.md)
is the walk. It is cut from the draft's §10 and §13 in
[../../drafts/town-design-doc.md](../../drafts/town-design-doc.md), and
built on what [gate](../gate/design.md) left: the manifest, the gate,
the runtime's contract, the audit, and the admin. Where this doc refines
the draft, it says so and why, and the draft stays as it was.

The thesis in one line: **a shop is given the outside world and never
a credential. The town keeps the secret sealed, opens it for one call,
and puts it on the wire itself, at a window it opens for the call and
closes after; what the shop is handed is an address, and an address
exfiltrated is nothing.**

The draft's pilot puts credentials, OAuth, a container runtime with an
egress proxy, and the Square's consent screens in one release. This
project is the credential mechanism alone, with the one credential
that needs no second mechanism to obtain: a token a person makes in a
browser and pastes once. OAuth is a consent flow, a refresh loop, and an
app registration; it is a project of its own, **consent**, that adds a
type to the table this project makes and brings the draft's
`town/gdocs` with it. Containers and egress are the network boundary;
this project is the credential boundary, and it says plainly which of
the two it is.

## The names

| Word | What it is | Where it lives |
| --- | --- | --- |
| a credential type | one kind of secret: the origin it may be sent to, the header it rides in | `credential_types` table; `townd admin type` |
| a credential | one user's secret of one type, sealed | `credentials` table; `townd admin credential` |
| the vault | the sealing: a key file and AES-256-GCM over the rows | `src/vault.ts`; `<data>/vault.key` |
| a need | a manifest's `credentials` entry: a type the shop calls through | `manifest.credentials` |
| a binding | on a grant, the credential that meets each need | `grants.credentials` |
| the teller | the vault's window: a loopback listener for one call that signs and forwards | `src/teller.ts` |
| the github shop | the second shop: a repository's issues, through a GitHub token | `shops/github/` |

Everything else keeps gate's name and place. The runtime gains an
option; the gate gains a step; the audit gains a column; the admin
gains two nouns.

## What the draft says, and what this project refines

**A type is the trust unit for where a secret may go.** The draft's
§10.1 has typed credentials (`google-oauth`, `github-token`) and shops
declaring the types they need. This project makes the type carry the
one fact that matters for exfiltration: the origin. A shop names a
type; it never names a host. If a manifest could say "send the user's
GitHub token to this host," the host would be the attack, and the
person approving the grant would have to read it. Instead the type says
`https://api.github.com` and the manifest says `github-token`, and the
worst a shop can do with the user's token is talk to GitHub as the
user, which is what it was granted.

**Types are the operator's, seeded.** The draft's hosted town owns the
type vocabulary. On one box the operator is the trust root, so the
table is seeded with `github-token` and `townd admin type add` puts
another in: a self-hoster's internal API, or a `command` test's fake
origin on loopback. The seeded rows are what the hosted box ships;
the verb is what makes the tests honest, since a test that needs a
real GitHub proves GitHub works.

**The runtime's proxy is a per-call window, not a proxy.** The draft's
§10.2 has the runtime provide "an HTTP proxy that adds auth headers for
allowed hosts." An HTTP proxy in the `HTTP_PROXY` sense tunnels TLS and
cannot add a header without breaking the tunnel. What a shop is handed
instead is a base URL on loopback per need: it sends plain HTTP to the
town, and the town speaks TLS to the origin with the header set. The
draft's post-pilot "scoped handle" is this, one step earlier: the
handle is a URL.

**The binding is made with the grant.** The draft's §10.1 has the
Square offer "grant existing Google credential to this shop." Here
`grant new` does it: one credential of the type, bound; several, the
operator picks; none, refused with what to add. The Square, when it
comes, renders this choice; the verb is its contract.

**Sealing is a seatbelt on one box.** The draft's §10.2 says encrypted
at rest with per-user keys. This project seals every row under one key
in `<data>/vault.key`, mode 600, made on first use. That makes a dump
of `town.db` hold nothing, and keeps the copy in gate's journey 2 step 7
whole, since the key travels with the directory. It is not a boundary:
whoever reads the directory reads the key, and on one box that includes
a shop, whose directory is under it; vault phase 1's exfil test unseals a
credential from what a swapped entry could read. The boundary is the hosted
box's, where the key leaves the disk for a service that holds it, and
per-user keys come with users who are not the operator.

**Tests run for real.** The draft's §7.6 has fixture credentials the
town provides. This project has an operator with a real credential and
`shop add --user <name>`: the shop's tests run through a teller against
the real origin on that user's credential. The spec says a test must be
one its author could run a thousand times, so tests read and never
write; a write is proven by the walk. Fixture accounts are the hosted
box's problem, and the draft's open question 3.

## The manifest

One field joins v0, and the spec's §8 is rewritten to refuse `depends`
alone:

```yaml
credentials:
  - type: github-token
```

A list of needs, each a `type` the town holds; a type it does not hold
is refused with the line naming the ones it does, `credentials[0].type:
'github-tokens' is not a type this town holds; write one of
(github-token) instead (spec §8)`. One need per type. The rest of the
manifest is gate's, and the rule that a shop's prose names no command
still holds.

The github shop's manifest:

```yaml
name: town/github
version: 0.1.0
summary: Issues on a GitHub repository.
guidance: |
  A repo is `owner/name`, and an issue is its number as GitHub shows
  it. A body is Markdown; a long one comes on stdin.
runtime: subprocess
entry: ./main.mjs
credentials:
  - type: github-token
commands:
  - name: list
    summary: List a repository's issues, open ones by default.
    effect: read
    args:
      - { name: repo, type: string, required: true, doc: "owner/name", constrainable: [equals, one_of, prefix, regex] }
      - { name: state, type: enum, values: [open, closed, all], default: open }
      - { name: limit, type: int, default: 20, constrainable: [equals, one_of] }
    output: text
  - name: show
    summary: Print one issue: title, state, author, body.
    effect: read
    args:
      - { name: repo, type: string, required: true, constrainable: [equals, one_of, prefix, regex] }
      - { name: number, type: int, required: true }
    output: text
  - name: reply
    summary: Add a comment to an issue.
    effect: write
    args:
      - { name: repo, type: string, required: true, constrainable: [equals, one_of, prefix, regex] }
      - { name: number, type: int, required: true }
      - { name: body, type: string, doc: "Markdown. Reads stdin if omitted.", constrainable: [max_length] }
    output: text
tests:
  - name: list prints numbered lines
    run: list --repo octocat/Hello-World --state all --limit 3
    expect: { contains: "#" }
  - name: show prints a title
    run: show --repo octocat/Hello-World --number 1
    expect: { exit: 0 }
  - name: a missing repo fails
    run: list --repo octocat/no-such-repo-here
    expect: { exit: 1 }
```

The fixture repository is GitHub's own example; the builder checks it
answers as the tests expect and picks another public one if not. The
tests read. `reply` is proven on the walk, on a repository the user
names.

## The vault

`src/vault.ts`: `sealCredential(key, id, value)` and
`openCredential(key, id, row)`, AES-256-GCM under a 32-byte key with a
fresh 12-byte nonce per row and the credential's id as associated data,
so a row moved to another id does not open. The key is
`<data>/vault.key`, made with mode 600 by the first verb that needs it,
read by `townd admin` when a verb needs it and by `townd serve` at
start, or, when the operator made the key after the server started, on
the first call that opens a binding, then kept; a data directory whose
`credentials` table has rows and no key is refused by both with the one
line that says the key is missing and what it is.

The store gains `credential_types(name, origin, header, added_at)`,
seeded with `github-token`, `https://api.github.com`, `Authorization:
Bearer {token}`; `credentials(id, user_id, type, label, sealed,
created_at, revoked_at)`; `grants.credentials`, JSON `{ "<type>":
"<credential id>" }`; and `calls.credentials`, JSON `[{ "type", "requests" }]`.
`meta.schema` is written as `2`, gate's store having written none, and
a database made by gate is migrated in place by `ALTER TABLE` on open: gate's rows keep
working and gain empty bindings. A type's name is lowercase letters,
digits, and `-`; its header is `<Name>: <value with {token}>`, and the
seeded row is the shape.

A credential's value enters the town once, on the stdin of `townd
admin credential add`, the whole of stdin with one trailing newline
trimmed. It is never an argument, so it is never in a shell's history
or a process list. It leaves the store only into the gate's memory for
one call. No verb prints it; `credential ls` prints the id, user, type,
label, creation time, and the grants bound to it.

## The teller

`src/teller.ts`: `openTeller({ origin, header, token })` returns `{ url,
requests, close }`. It listens on `127.0.0.1` on a free port, and `url`
is `http://127.0.0.1:<port>/<nonce>` with sixteen random bytes in the
nonce. For a request whose path begins with the nonce, it forwards the
method, the path after the nonce, the query, the headers with `Host`,
`Authorization`, and the hop-by-hop set removed, and the body,
streamed, to the origin over `https:` (or the scheme the origin
carries), with the type's header set from the token; it writes back the
origin's status, headers, and body, streamed. A request without the
nonce is 404 with an empty body. A request whose `Host` is not the
listener is 404. `requests` counts what it forwarded. `close()` stops
the listener and aborts anything in flight; after it, the port refuses.

The teller replaces `Authorization` rather than refusing a request that
sets one, because the spec's promise is that the town signs, and a shop
that signs on its own cannot get anything past the window except what
the type allows; the audit is not told, since nothing reached the
origin that the type did not allow. Headers other than `Authorization`
pass through, since GitHub's `Accept` and `X-GitHub-Api-Version` are
the shop's to set.

What the teller is not: a network boundary. The shop is a process on
the box and can open any socket it likes, as gate's process could. What
the teller makes true is that the credential is not among the things
it can send, because it never had one. The egress allowlist the draft's
§13.2 wants is the container's, a later project, and it will use this
table's origins as its list.

## The runtime contract, grown by one line

`run(...)` takes `credentials: [{ type, origin, header, token }]`. Before
the process exists it opens a teller per entry; the environment is
gate's three names plus `TOWN_CREDENTIAL_<TYPE>` per entry, the type
upper-cased with `-` to `_`, its value the teller's URL; after the
process is gone, by exit, failure, or the limit, every teller is closed
and the result carries `[{ type, requests }]`. Spec §7's environment
line reads: "exactly three names, plus one per need." The token is in
the runtime's memory and the teller's closure and in no string the
process is given.

The shop's side, in the spec: send to `$TOWN_CREDENTIAL_GITHUB_TOKEN`
the request you would have sent to `https://api.github.com`, path and
all, with no credential of your own; the town adds it. Do not write the
URL to stderr, since stderr is kept on the audit and the URL, though
dead by then, is the shape of a secret.

## The gate, with a binding

A grant is **live** when it is not revoked, not expired, and every
credential it binds is not revoked. Every place gate reads "the pass's
grants" reads its live grants: help does not list a shop whose grant is
not live, and a call to it is gate's "not available to this grant."
So `credential rm` revokes nothing itself; it marks the credential, and
the grants bound to it stop being live at the next call, which is what
the verb prints. The agent learns nothing new: a shop it could use is
one it cannot, in gate's sentence.

The gate's six steps stay in order and the sixth grows: before the
runtime, the grant's bindings are opened from the vault, each
credential's row to its value, and handed to the runtime with the
type's origin and header. A binding whose type the manifest no longer
names is ignored; a need the bindings do not meet makes the grant not
live, so a `shop add` that adds a need to a shop with grants prints
the grants that stopped being live and what makes new ones. Nothing is
opened before step 6: a denied, malformed, or dead call opens no
teller, and the swapped-entry test counts listens.

The audit row gains `credentials`: the types served and how many
requests each teller forwarded. Not the paths, which can carry an
argument; not the values, ever.

## The admin, with two nouns

- `type add <name> --origin <url> --header '<Name>: <value with
  {token}>'`; `type ls`; `type rm <name>`, refused while a credential of
  the type exists.
- `credential add --user <name> --type <type> [--label <text>]`, the
  value from stdin, the id on stdout; `credential ls [--user <name>]`;
  `credential rm <id>`, printing the grants that stop being live.
- `grant new` at a shop with needs: for each need, the user's one
  credential of the type is bound; with several, `--credential <id>`
  (repeatable) picks; with none, refused: `user dimitri holds no
  github-token credential; add one with townd admin credential add`.
  `grant ls` shows bindings as `<type>=<id>`.
- `shop test <dir> --user <name>` and `shop add <dir> --user <name>`:
  the user's credentials meet the manifest's needs, `--credential <id>`
  picking among several as at `grant new`, and the tests run through
  tellers against the real origins. A shop with needs and no
  `--user`, or a user who lacks one, is refused with the line. A shop
  without needs takes no `--user`, as in gate.

## The github shop

`shops/github/`: the manifest above and `main.mjs`, about eighty lines:
`fetch` against `process.env.TOWN_CREDENTIAL_GITHUB_TOKEN` with
`Accept: application/vnd.github+json`, `list` printing `#<number>
<title>` per issue with pull requests filtered out, `show` printing
title, state, author, and body, `reply` posting the body from `--body`
or stdin and printing the comment's `html_url`. A non-2xx answer is
exit 1 with the status and GitHub's `message` on stderr and nothing
else, since stderr is the audit's and a message can quote a body. It
reads no environment but the teller's URL and sets no `Authorization`.

## Testing it

- **checkout**: the manifest's `credentials` parsed and refused by
  type; the vault's seal and open, the wrong id refusing, the key file's
  mode; the teller against a fake origin on loopback: the header set,
  the shop's own `Authorization` replaced, the nonce required, `Host`
  checked, bodies streamed both ways, status through, closed after; the
  runtime's environment exactly three names plus one per need and the
  token in none of them; the store's migration from a gate-era
  database; the gate's step 6 with a fake runtime and a fake vault,
  liveness by binding. In process, vitest, fast.
- **command**: journey 2 steps 1 to 8 against a server the test starts,
  a fake origin on loopback added as a type in step 1 and a fixture
  shop with a need of that type; journey 3's swapped entry that prints
  everything it can reach and finds no token, while its one request
  arrives at the fake origin signed; gate's journey 3 denials with the
  teller's listen counted. The server, the directory, and the key are
  gone after.
- **the walk**: a real GitHub fine-grained token the user makes, scoped
  to one repository with issues read and write; the github shop added
  on it, its tests hitting GitHub; a real Claude Code session in a
  scratch directory with a grant for the shop, asked to read the
  repository's open issues and reply to one; the reply read on GitHub;
  the grant narrowed to reads and a second ask; the token searched for
  in the transcript, the scratch directory, and `town.db` and its WAL.
  It costs one model session, well under a dollar, and one token the
  user revokes after.

## What this does not do, on purpose

- **OAuth.** A consent flow, a refresh loop, an app registration, and
  the draft's `town/gdocs`: project **consent**, which adds a type
  whose value is a refresh token and teaches the teller to trade it
  for an access token before signing. The teller's shape is built for
  it: the header is set at forward time, from whatever the type says.
- **The Square.** `credential add` and the binding at `grant new` are
  its contract, as gate's admin verbs were.
- **Egress and containers.** The teller is the credential boundary. The
  network boundary is a later project, and this project's
  `credential_types.origin` is its allowlist.
- **Dependencies.** A shop calling another with its caller's grant:
  project **compose**, still refused by the validator with its name.
- **A credential that expires.** A fine-grained token has a lifetime; a
  401 from the origin reaches the shop, which fails with the status, and
  the audit says `shop-error`. A `credential-expiring` notice needs the
  origin to say when, which GitHub does in a header; a finding when it
  bites, a notice kind after.
- **Per-user keys, a key held off the box.** The hosted box's.
- **More than one credential per type on a grant, a credential shared
  across users.** The draft's open question 7.
