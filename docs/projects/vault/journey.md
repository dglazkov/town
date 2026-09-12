---
status: done
since: 2026-09-12
see: vault
note: "written 12 Sep 2026, the day gate closed: the town's vault, where a credential is kept and used on a shop's behalf without the shop ever holding it. Vault phase 0 closed the same day: the vault seals under a key file, the operator adds a credential from stdin, and a shop's teller signs its requests, proven on a fake origin. Vault phase 1 closed after it: grants bind credentials, a removed credential ends them at the next call, and journey 2 was typed by hand on a fixture shop. Vault phase 2 closed the same day: town/github walked by Claude Code on a real token against dglazkov/town, no call denied, the reply on GitHub, narrowed to reads and said so, and the token found in no file searched. Open, owed to containers: on one box a shop can read the key."
---

# Vault — the journeys

Gate proved that a grant file in a directory is a capability: the town
settles who is calling and what they may do before any shop runs. But
gate's one shop needed nothing from outside the box. **This project
gives a shop the outside world, on a person's credential, without the
shop, the agent, or anything either can read ever holding it.** The
town keeps the credential sealed, opens it for one call, and puts it on
the wire itself; the shop sends its requests through a window the town
opens for the call and closes after. One credential type, a GitHub
token; one shop that needs it, `town/github`; the operator at the box
still the whole human side.

Each journey is an acceptance test: the work is done when it can be
walked as written. [design.md](design.md) is the mechanism and
[phases.md](phases.md) the walk. If a journey and the mechanism
disagree, the mechanism is what changes.

Vocabulary the journeys use, on top of gate's:

- **A credential type**: what the town knows about one kind of secret:
  the origin it may be sent to and the header it rides in. The town
  seeds `github-token`; the operator may add others.
- **A credential**: one user's secret of one type, sealed in the vault.
  It has an id and a label and no verb prints its value.
- **The vault**: the sealing: a key file in the data directory and the
  cipher over the rows, so a dump of the database alone holds nothing.
- **A need**: a shop's manifest naming a credential type it calls
  through, under `credentials`.
- **A binding**: on a grant, which credential of the user meets each of
  the shop's needs. Made when the grant is made; gone when the
  credential is.
- **The teller**: the vault's window. For one call, the town opens a
  loopback address per need, hands the shop its URL in the environment,
  forwards what the shop sends to the type's origin with the header
  added, and closes it when the call ends. The shop sends requests; the
  town signs them.

## Journey 1: The connected shop

An agent in a directory with `.town/grant`, told the one sentence. The
pass holds a grant for `town/github`, bound to the user's GitHub token,
with `list.repo`, `show.repo`, and `reply.repo` each `equals
<owner/name>`.

1. `town --help` lists `town/github` with `list`, `show`, `reply`. It
   does not say there is a token, whose it is, or what it is.
2. `town github --help` prints the shop's summary, guidance, the three
   commands with their arguments, and the constraints in words, as gate's help
   writes them: "repo `<owner/name>` only".
3. `town github list --repo <owner/name>` prints the repo's open issues,
   one line each, `#<number> <title>`, and exits 0. GitHub answered a
   request the town signed; the shop sent it unsigned.
4. `town github show --repo <owner/name> --number 3` prints the issue.
   `town github reply --repo <owner/name> --number 3 --body "Seen,
   thanks."` prints the comment's URL, and the comment is on GitHub.
5. `town github list --repo someone-else/repo` is exit 2, the line
   naming the constraint, and no request left the box.
6. The grant narrowed to `list` and `show`: `reply` is exit 2 with
   gate's one line, and `--help` no longer shows it.
7. The walk: the agent, asked to read a repo's open issues and reply to
   one, does it with no call denied; narrowed under it, it says it can
   no longer reply and does not retry.

Acceptance criteria:

- The token appears nowhere the agent can reach: not in the transcript,
  the agent's directory, the shop's stdout or stderr, the environment
  the shop is given, or `--json`. The walk's proof searches the
  transcript, the scratch directory, and the audit database for the
  token's value and finds it nowhere.
- Help for a shop with a need reads as it did in gate: the manifest for
  the grant, nothing about credentials.
- A denied or malformed call opens no teller and sends nothing: the
  gate decides first, as gate's rule says.

## Journey 2: The operator connects a credential

The operator of gate's journey 2, with the same town.

1. `townd admin type ls` prints `github-token`, its origin
   `https://api.github.com`, and its header, seeded when the store was
   made. `townd admin type add internal --origin
   https://api.example.internal --header 'Authorization: Bearer
   {token}'` adds another; `type rm internal` removes it, and is refused
   while a credential of that type exists.
2. `townd admin credential add --user dimitri --type github-token
   --label "dimitri's PAT"` reads the secret from stdin, the whole of
   it with one trailing newline trimmed, and prints the credential's id.
   The secret is never an argument. On first use the vault makes
   `<data>/vault.key`, mode 600.
3. `townd admin credential ls` shows the id, user, type, label, when it
   was added, and the grants bound to it. No verb prints a value.
   `strings <data>/town.db` does not contain the secret.
4. `townd admin shop add shops/github --user dimitri` validates the
   manifest, which names a need of type `github-token`, and runs the
   shop's tests through a teller against GitHub for real, on dimitri's
   credential. Without `--user`, or with a user who holds no credential
   of that type, the add is refused with a line saying so. A manifest
   naming a type the town does not hold is refused with the line naming
   the types it does.
5. `townd admin grant new --pass <id> --shop town/github --constraint
   'list.repo equals <owner/name>' …` binds dimitri's one `github-token`
   credential to the grant. With two credentials of the type, the verb
   asks for `--credential <id>`; with none, it refuses and says what to
   add. `grant ls` shows the binding by id and type.
6. `townd admin audit --shop town/github` shows each call's rows with a
   new column: the types the call's tellers served and how many
   requests each forwarded. Never a value, never a path.
7. `townd admin credential rm <id>` revokes every grant bound to it and
   names them. The agent's next `town github …` is exit 2 and `town
   --help` no longer lists the shop. Nothing was restarted.
8. The server stopped, the data directory copied, `townd serve --data
   <copy>` started: the same town, credentials included, since the key
   travels with the directory. A copy of `town.db` alone opens nothing.

Acceptance criteria:

- Every operator verb works with the server stopped and running, as in
  gate; the database and the key file are the meeting point.
- A `command` test walks steps 1 to 8 against a server it starts, with
  a fake origin on loopback added as a type in step 1, so the ring
  needs no token and no network.
- A store made by gate opens under vault with its users, passes,
  grants, shops, and audit intact, and gains the new tables and
  columns.

## Journey 3: The shop never holds it

A shop author writes to the runtime contract, which grew by one line.

1. `townd spec` §7 now says: for each need, one more environment name,
   `TOWN_CREDENTIAL_<TYPE>` (the type upper-cased, `-` to `_`), whose
   value is a base URL on loopback. The shop sends to that URL the
   request it would have sent to the origin, with no credential of its
   own, and the town adds the header. The URL lives as long as the call.
   Spec §8 now refuses `depends` alone, naming compose.
2. The teller forwards method, path, query, headers, and body both ways,
   streaming, and passes the origin's status through. It replaces any
   `Authorization` the shop sets with the type's, so a shop cannot send
   a header of its own choosing to the origin.
3. The base URL carries a random segment the call alone knows; a request
   to the port without it is 404 with an empty body. The teller listens
   on `127.0.0.1` only, and refuses a request whose `Host` names
   anywhere else.
4. When the call ends, by exit, failure, or the thirty-second limit, the
   teller is closed and a request to its URL is refused at the socket.
   Two calls, or two needs of one call, never share a URL.
5. A test swaps the shop's entry for one that prints its environment,
   argv, stdin, everything under `TOWN_STATE`, and everything it can
   read under the data directory, then asserts the credential's value is
   in none of it, while a request the entry sends through the teller
   arrives at the fake origin with the header set.
6. `townd admin shop test <dir> --user <name>` runs a shop's tests with
   that user's credentials through tellers against the real origins;
   the spec says a test must be one the author could run a thousand
   times, so a test reads and never writes.

Acceptance criteria:

- The environment a shop gets is exactly gate's three names plus one
  per need, and a test asserts the set.
- No credential value is ever in a process's argv, environment, or
  stdin, in the audit, in a shop's state directory, or on stderr; the
  runtime holds it in memory for the call and the teller alone reads it.
- A denied call, a malformed call, and a call on a dead pass open no
  teller: the same swapped-entry test as gate's journey 3, with the
  teller's listen counted.
