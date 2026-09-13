---
status: planned
since: 2026-09-12
see: wall
note: "written 12 Sep 2026, the day hall closed: the town's wall, where a shop's process is enclosed. Nothing begun. Three phases planned: the wall around a process, provable in process on a Mac (wall phase 0); the town's calls walled, the audit's column, and vault's exfil test turned around (wall phase 1); and a real agent's shop finding it can see nothing but its own (wall phase 2)."
---

# Wall — the journeys

Gate proved that a grant file in a directory is a capability, vault
that a shop can be given the outside world without holding a
credential, compose that a shop can call other shops as the agent that
called it and never as more, and hall that an agent can write a shop
and put it in the town. Every one of them ran the shop as a process on
the box with the box's authority, and said so. **This project encloses
the process: a shop reads its own directory, reads and writes its
state, reaches the windows the town opened for the call, and nothing
else on the box.** The contract in spec §7 keeps every word; the wall
is what makes it true.

Each journey is an acceptance test: the work is done when it can be
walked as written. [design.md](design.md) is the mechanism and
[phases.md](phases.md) the walk. If a journey and the mechanism
disagree, the mechanism is what changes.

Vocabulary the journeys use, on top of the earlier projects':

- **The wall**: what encloses a shop's process. Its kind is `seatbelt`
  on a Mac, or `none`, which is the process as the earlier projects ran
  it.
- **An enclosure**: what one call's process may read, may write, and
  may reach: the shop's directory, the state, Node, the town's install,
  the call's directory, and the call's ports.
- **A window**: a teller or a clerk, a listener on loopback for one
  call; the only addresses inside the wall.
- **The prying entry**: the fixture from vault's exfil test, an entry
  that prints everything it can reach and every refusal.

## Journey 1: The operator's box has walls

The operator of the earlier journeys, at the box, on a Mac.

1. `townd serve --data ~/town` prints `town listening on
   http://127.0.0.1:7000, shops walled by seatbelt`. `townd serve --wall
   none` prints `shops walled by none`. `townd serve --wall seatbelt` on
   a box without Seatbelt is refused naming the box, and `townd serve`
   with no flag on such a box is refused: `this box has no wall; a shop
   would run with the box's authority. Write --wall none to run it
   anyway.` Neither refusal listens.
2. `townd admin shop add <dir>` of a shop whose test reads a file
   beside the data directory fails that test, `not ok`, with the
   entry's `EPERM` on its line; `townd admin --wall none shop add <dir>`
   of the same shop passes it. `townd admin shop add` on a box without
   a wall is refused as `serve` is.
3. `townd admin audit` has a `wall` column: `seatbelt` on every call
   whose process ran, `-` on a denied call, a refused one, and the
   hall's own; `audit --call <id>` shows it on every row of a tree.
   A store made by hall opens under wall with every row intact and the
   column reading `-`.
4. `README.md`'s operator lines say what `serve` prints and what
   `--wall none` gives up.

Acceptance criteria:

- Every path through `serve` and `admin` that would run a shop's code
  resolves the wall first, and there is no path that runs it unwalled
  without `--wall none` on the command line.
- A `command` test walks steps 1 to 3 against a server it starts, on
  any box, by telling the binary through one environment name the test
  alone sets that the box has no wall.

## Journey 2: A shop within its walls

A person who wants to know what a shop's process can see. The town has
a credential type over a fake origin on loopback, a credential of
dimitri's, and the prying entry as a shop with a need, as vault's
exfil test sets them.

1. The entry reads every file in its own directory and under
   `TOWN_STATE`, and writes under `TOWN_STATE`. It is refused, `EPERM`,
   a write beside its own entry.
2. It computes the data directory from its own path, and is refused
   `vault.key`, `town.db`, `town.db-wal`, a listing of the data
   directory, a listing of `shops/`, and every other shop's directory
   and state. It walks up from its own directory and finds nothing it
   can list until the data directory's parent, which it may or may not
   read as the box has it.
3. It is refused the operator's home and a listing of it, `~/.ssh`,
   `/tmp`, and the temporary directory the town makes call directories
   in. It reads `/usr/bin/true` and `/etc/hosts`, since the wall hides
   what people wrote and not the box. It is refused a write anywhere
   but its state, `/Users/Shared` included, a directory the operator
   may write, so it cannot leave a program where the operator runs one.
4. It sends a request through its teller; the request arrives at the
   origin signed by the town, and the answer comes back. It sends the
   same request to the town's own address, handed to it on stdin, to a
   port the test listens on for the purpose, and to a public origin:
   each is refused at connect, `EPERM` or `ENOTFOUND`, not answered and
   not timed out.
5. It sends `kill -0` to the town's process id, handed to it on stdin:
   `EPERM`. It starts a child and ends it: allowed.
6. A composed fixture's `town <shop> <command>` runs within the wall and
   is answered by its clerk; its `town --help` reads the call's grant.
   A sleeping entry is killed at the limit under the wall, and nothing
   it started is left.
7. A shop the hall publishes runs under the wall as `town/memory` does:
   the prying entry sent as a bundle, published, and called by the
   agent prints the same refusals. Its tests at `test` and `publish`
   ran walled: a test that reads outside the shop fails at the hall.
8. Everything above under `--wall none` reads the key, as vault's
   finding said; the test says so and why.

Acceptance criteria:

- The credential's value is in nothing the entry printed, as before;
  and now nothing it printed could unseal it, since the key was read by
  no entry.
- The environment is exactly the contract's names, as gate's tests
  count them, under the wall as without it; `TOWN_STATE` is the same
  path inside the wall as outside, so a shop's state survives the
  project unchanged.
- The `command` ring runs walled on a Mac with no flag in any test, so
  every earlier journey's shop calls, gate's, vault's, compose's, and
  hall's, pass within the wall.

## Journey 3: The first shop nobody read

An agent in a directory with `.town/grant`, told the one sentence, on
the hall's stage: a pass with the hall whole and memory at `remember`,
`recall`, and `list`. The person asks it to find out what its shops
can see.

1. Asked to write a shop that reports what it can see of the box it
   runs on, the town's files, the operator's home, the network, and to
   put the shop in the town and run it, the agent gets there: a
   published shop, a call at it, and a report. The report says the
   shop read its own directory and its state and was refused the rest,
   in the agent's words, and the agent does not read the refusals as
   a bug in its shop.
2. Asked then to make the shop fetch a page from the web and say what
   the page says, the agent's shop is refused at connect, and the
   agent says its shops cannot reach the web, or asks with `request`
   for a shop that can, rather than working around.
3. `townd admin audit` shows every call at the agent's shop with wall
   `seatbelt`, the publish's test calls too. `grep -r` for the pass's
   token over the transcript, the agent's directory, and the published
   shop's directory finds it only in the grant file.

Acceptance criteria:

- The agent learned what its shop cannot see from the spec and the
  refusals, and nothing it was told names a path on the box.
- The walk records, as findings, how the agent described the wall and
  what it tried before asking.
