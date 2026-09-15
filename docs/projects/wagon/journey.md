---
status: planned
since: 2026-09-14
see: wagon
note: "written 14 Sep 2026, the evening tent closed: the town's wagon, where a town is packed whole into one document and unpacked into an empty town on a laptop or a box. `townd admin store export --key <file>` prints every user, pass, grant, shop with its files, credential type, credential, permit, call, and state file as one JSON document, the sealed values sealed again under the wagon's key; `store import --key <file>` writes it into an empty town, whole or not at all, at the laptop or over the wire. An agent's grant works at the new town with the address changed and nothing else. The star wagon of the sheep constellation and the second half of the night sky's row 5, the two verbs box said were one verb away. Nothing built."
---

# Wagon — the journeys

The operator's box holds users, a consent, grants, and a shop's state,
and a redeploy keeps them while a deletion loses them; the laptop's
data directory holds the same and can be copied with `cp`, which the
box cannot. **This project makes a town a thing the operator can carry:
one document that holds all of it, made by one verb and taken in by
another, on a laptop or over the wire, so that a backup is an export
and a move is an export and an import.** Nothing an agent sees changes
but the address in its grant file.

Each journey is an acceptance test: the work is done when it can be
walked as written. [design.md](design.md) is the mechanism and
[phases.md](phases.md) the walk. If a journey and the mechanism
disagree, the mechanism is what changes.

Vocabulary the journeys use, on top of the earlier projects':

- **The wagon**: the JSON document `store export` prints and `store
  import` reads.
- **The wagon's key**: the thirty-two-byte file `--key` names, under
  which the wagon's credentials and oauth clients are sealed; made by
  export when missing, never printed, never on the box.
- **An empty town**: no user, pass, grant, credential, permit, call, or
  state; no shop but `town/hall`; no type but the seeded. The only town
  an import writes to.
- **A tent**: a box of a ring's own, `pnpm hermetic --ring account
  --keep`, struck after by `--strike`, as tent defined it.

## Journey 1: A town is copied on a laptop

The operator's laptop, a data directory `a/` served on one port, holding
a user, a pass in a grant file at `agent/.town/grant`, `town/memory`
and `town/github` with grants at both, a `github-token` credential
bound to the github grant, a permit once approved, and a dozen calls,
among them `town memory remember "the wagon rolls"` by that pass. A
second directory `b/` that does not exist.

1. `townd admin --data a store export --key wagon.key > wagon.json`
   makes `wagon.key` with mode 600, says so on stderr with the counts,
   and exits 0. `wagon.json` is one JSON document; `grep` over it for
   the credential's value and for the pass's token finds neither. `a`'s
   audit after is the audit before.
2. `townd admin --data b store import --key wagon.key < wagon.json`
   makes `b/`, prints the same counts, exits 0. `townd serve --data b`
   on a second port.
3. The grant file copied to `agent2/.town/grant` with `town` changed to
   the second port and nothing else: `town memory recall` prints `the
   wagon rolls`; `town github show <owner/name> <n>` prints the issue,
   through the credential resealed under `b`'s key; `town --help`
   lists both shops. `townd admin --data b audit` shows `a`'s dozen
   calls before today's two; `user ls`, `pass ls`, `grant ls`, `shop
   ls`, `type ls`, `credential ls --user`, and `permit ls` print what
   `a`'s print, save the address.
4. `b/vault.key` differs from `a/vault.key`, and `b/town.db`'s
   `credentials.sealed` differs from `a`'s: the credential was opened
   and sealed again, not copied.
5. The same import into `a`: refused, `this town holds 1 user and 2
   shops; import writes into an empty town alone`, exit 1, `a`
   unchanged by `sha256sum` over `a/town.db`.
6. Import into a fresh `c/` with another key: refused naming the first
   credential that does not open and the count, exit 1, `c/town.db`
   holds no user. With no `--key`: refused naming the flag. With
   `wagon.json`'s `schema` edited one up, and one down: each refusal's
   sentence from the design, exit 1. With a file that is not a wagon:
   refused naming what it found.
7. `store export --key wagon.key --no-audit` prints a wagon whose
   `calls` is `[]` and whose `audit` is false, and stderr says `calls
   left behind: 14`.

Acceptance criteria:

- Steps 1 to 7 are walked for real on the operator's laptop with a
  real GitHub token, and step 3's `github show` reaches GitHub.
- `wagon.json` holds no credential value and no pass token: the
  conductor's `grep -F` for each finds nothing, and the sealed values
  in it differ byte for byte from `a/town.db`'s.
- `b` is not a copy of `a`'s files: `b/vault.key` was made by the
  import.

## Journey 2: A town moves from a laptop to a box, and back

The same laptop and `a/`, `CLOUDFLARE_API_TOKEN` in the environment,
and a tent pitched and kept: `pnpm hermetic --ring account --keep`,
its address `T`, its operator token under the ring's `home/`.

1. `HOME=<ring>/home townd admin --town T store import --key wagon.key
   < wagon.json` prints the counts, exit 0. `townd admin --town T shop
   ls` names memory and github; `user ls` the user; `credential ls
   --user` the credential, live.
2. The grant file with `town` changed to `T`: `town memory recall`
   prints `the wagon rolls`, from the box's rows; `town github show`
   prints the issue, through the box's window; `townd admin --town T
   audit` shows `a`'s calls, then these.
3. The same import again over `T`: refused as not empty, exit 1.
4. A wagon holding a `runtime: subprocess` shop, from a laptop store
   given `test/fixtures/echo-shop`: refused over `T` naming the shop
   and `runtime: worker`, exit 1, `T`'s store untouched. A wagon with a
   state file carried as `base64`: refused naming its path. A wagon
   over eight megabytes: refused by the pipe before posting, naming the
   size and `--no-audit`.
5. `HOME=<ring>/home townd admin --town T store export --key wagon2.key
   > wagon2.json` prints the counts, its `from` is `T`, and stderr says
   `wagon2.key` was made. `townd admin --data d store import --key
   wagon2.key < wagon2.json`; `townd serve --data d`; the grant file
   pointed at `d`: `memory recall` prints the line, and `audit` shows
   the box's calls with `wall` `isolate`.
6. `pnpm hermetic --strike <tent>`: the listing is the listing before
   the pitch.

Acceptance criteria:

- Steps 1 to 6 are walked for real on a tent, never on the standing
  box, and the tent is struck after.
- `pnpm hermetic --ring account` is green on the commit that changed
  the wire.
- The wagon's key reached the box in no file: `grep -rF` of its bytes
  over the ring's directory finds `wagon.key` and `wagon2.key` alone,
  and the tent's `audit` holds no row for an admin verb.

## Journey 3: The standing box is backed up

The operator's laptop, `~/.town/operator` holding the standing box's
token, the box holding the shepherd's users, consents, and grants.

1. `townd admin --town https://town.dglazkov.workers.dev store export
   --key ~/.town/wagon.key > town-<date>.json` makes the key, prints
   the counts, and exits 0. The box's audit after is the audit before:
   its last row's `at` is unchanged.
2. `townd admin --data e store import --key ~/.town/wagon.key <
   town-<date>.json` prints the same counts. `townd serve --data e`,
   and `user ls`, `shop ls`, `type ls`, `credential ls --user <each>`,
   `permit ls`, and `audit` over `e` print what the box's print, save
   the address; the oauth type's client came through, since `type ls`
   says it is registered.
3. The file and the key are kept apart, the file where a backup goes
   and the key where `~/.town/operator` is, and the README says so in
   one paragraph.

Acceptance criteria:

- Steps 1 and 2 are walked for real on the standing box, which the
  export changes by nothing, and `e` is removed after.
- The wagon file holds no secret the conductor can name: no oauth
  client secret, no token, no operator token; `grep -F` over it for
  each finds nothing.
- The README's operator section holds the two verbs and the backup's
  line, and the box section says the box's export is the only copy of
  a box's credentials an operator can hold.
