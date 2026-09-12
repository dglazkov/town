---
status: partial
since: 2026-09-12
see: compose
note: "written 12 Sep 2026, the day vault closed: the town's compose, where a shop calls other shops through the town as the agent that called it, cut to what its manifest declared and never more. Compose phase 0 closed the same day: `depends` validated, the clerk, `TOWN_GRANT` and `town` on a shop's PATH, `effective` cutting every depth from the agent's own, and `shop test` running the tree in scratch, all in process. Compose phase 1 closed the same day: liveness needing the dependencies, the denial one level down in the agent's words, the audit as a call tree, and the admin's refusals, walked on fixture shops against a running town. Compose phase 2, the watch shop and the walk on a real token, is next."
---

# Compose — the journeys

Gate proved that a grant file in a directory is a capability, and vault
that a shop can be given the outside world without holding a
credential. Both projects' shops were leaves: each did its work alone.
**This project lets a shop call other shops, through the town, as the
agent that called it and never as more.** A shop declares what it
depends on; for one call the town hands it a grant cut from its
caller's own and `town` on its PATH, and nothing else; every call it
makes passes the same gate the agent's did, with the agent's
constraints still on it, and dies with the call. One new shop,
`town/watch`, a recipe over `town/github` and `town/memory`; the
operator at the box still the whole human side.

Each journey is an acceptance test: the work is done when it can be
walked as written. [design.md](design.md) is the mechanism and
[phases.md](phases.md) the walk. If a journey and the mechanism
disagree, the mechanism is what changes.

Vocabulary the journeys use, on top of gate's and vault's:

- **A dependency**: a manifest's `depends` entry: a shop this one calls
  and the commands it calls there. Declared, never inferred.
- **The clerk**: the town's window for a shop's own calls. For one
  call, the town opens a loopback address, writes a grant file that
  names it, puts `town` first on the shop's PATH, and answers what the
  shop sends there as the gate would answer the agent. It closes when
  the call ends.
- **The effective grant**: what a shop may do at a dependency: the
  agent's grant there, cut to the commands the manifest declared, the
  agent's constraints kept. Computed on every call, stored nowhere.
- **A call tree**: an agent's call and every call a shop made in its
  service, each an audit row naming its parent.
- **Live** gains a fourth reason a grant is not: its shop depends on a
  shop the pass holds no live grant at covering the declared commands.

## Journey 1: The composed shop

An agent in a directory with `.town/grant`, told the one sentence. The
pass holds three grants: `town/watch` with `mark` and `changes`;
`town/github` with `list` and `show`, `list.repo` and `show.repo` each
`equals <owner/name>`; `town/memory` with `remember`, `recall`, and
`list`.

1. `town --help` lists the three shops with their commands. It does not
   say which depends on which.
2. `town watch --help` prints the shop's summary, guidance, its two
   commands with their arguments, and the grant's constraints in words,
   as gate's help writes them. Help itself says nothing of github,
   memory, or a dependency; the guidance's prose says where the last
   look is kept, as the second criterion allows.
3. `town watch mark --repo <owner/name>` prints how many open issues it
   remembered, exit 0. The town made two calls on the agent's behalf:
   `github list` under the agent's github grant, and `memory remember`
   under the agent's memory grant. The audit has three rows, the inner
   two naming the outer as their parent.
4. An issue closed on GitHub by hand. `town watch changes --repo
   <owner/name>` prints the issue under `closed:` and `opened: none`,
   exit 0.
5. `town watch mark --repo someone-else/repo` is exit 2, and the line is
   github's constraint line, `error: --repo must be '<owner/name>' under
   this grant`. The agent's limit at github is watch's limit too, in
   the same words, and no request left the box.
6. The memory grant narrowed to `recall`: `town --help` no longer lists
   watch, `town watch mark …` is "not available to this grant", exit 2,
   and github and memory answer as before. A memory grant with
   `remember` again, and watch is back. Nothing was restarted.
7. The walk: the agent, asked to remember a repository's issues and
   later to say what changed, does it with no call denied; asked to do
   the same for a repository its grant does not name, it says it cannot
   and does not retry; with memory narrowed under it, it says watch is
   no longer available.

Acceptance criteria:

- A shop's call is the agent's call. Every inner row in the audit
  carries the agent's pass and the agent's grant at the dependency, and
  names its parent; nothing in the audit or in help names a pass or a
  grant that is not the agent's.
- Help for a composed shop reads as gate's: the manifest for the grant,
  nothing about dependencies. What a shop keeps in another shop is the
  guidance's to say in prose.
- A denial one level down is the agent's denial: exit 2, the same line
  the agent would have been told calling the dependency itself.

## Journey 2: The operator composes a shop

The operator of vault's journey 2, with the same town, `town/github`
and `town/memory` already in it.

1. `townd admin shop add shops/watch --user dimitri` validates the
   manifest, which names two dependencies, `town/github` at `list` and
   `town/memory` at `remember` and `recall`; each must be a shop in the
   town that has the commands named. Its tests run with the shop given
   a grant at each dependency of exactly the declared commands, the
   whole tree against a scratch state, github's calls through a teller
   on dimitri's credential, so `--user` is needed as vault says. A
   dependency not in the town is refused naming `shop add`; a command
   the dependency lacks is refused naming the ones it has; a shop that
   depends on itself, or on a shop that depends on it, is refused
   naming the loop.
2. `townd admin shop ls` shows each shop's dependencies as
   `town/github[list] town/memory[remember,recall]`.
3. `townd admin grant new --pass <id> --shop town/watch` is refused
   while the pass holds no live grant at `town/github` covering `list`,
   or at `town/memory` covering `remember` and `recall`, and says which
   and the verb that fixes it. With both held it is made, as gate's
   `grant new` makes one.
4. `townd admin grant revoke <memory grant>`: `grant ls` shows watch's
   grant `not live: town/memory not granted`; the agent's next `town
   watch …` is exit 2 and `town --help` lists watch no more. A new
   memory grant with `remember` and `recall`, and `grant ls` shows it
   live again. A memory grant with `recall` alone: `not live:
   town/memory lacks remember`.
5. `townd admin audit --pass <id>` shows watch's call and the two calls
   its shop made, each with the call's id and its parent's. `townd admin
   audit --call <id>` prints one call and every call made in its
   service, indented by depth. No row names a pass that `pass ls` does
   not list.
6. `townd admin shop rm town/memory` is refused while `town/watch`
   depends on it, naming it. `shop add` of a `town/memory` without
   `remember` is refused the same way: every shop in the town has every
   dependency it declares, as it has every type.
7. The server stopped, the data directory copied, `townd serve --data
   <copy>` started: the same town. A store made by vault opens with its
   rows and gains the columns.

Acceptance criteria:

- Every operator verb works with the server stopped and running, as in
  gate; the database is the meeting point.
- A `command` test walks steps 1 to 7 against a server it starts, on
  fixture shops and a fake origin, so the ring needs no token and no
  network.
- A store made by vault opens under compose with its users, passes,
  grants, shops, credentials, and audit intact, and gains the new
  columns.

## Journey 3: The shop is an agent

A shop author writes to the runtime contract, which grew by one line.

1. `townd spec` §7 now says: when the manifest has dependencies, one
   more environment name, `TOWN_GRANT`, the path of a grant file the
   call alone can use, and `town` first on PATH; a shop without
   dependencies has neither. §8 now says what `depends` is and that a
   shop calls a dependency as an agent does, `town <shop> <command> …`,
   and is answered as one.
2. Inside a shop's call, `town --help` lists exactly the shop's
   dependencies with exactly the declared commands, and `town <shop>
   --help` shows the agent's constraints there in words.
3. A shop that calls a command it did not declare at a dependency, or
   a shop it did not declare, is told "not available to this grant",
   exit 2, whatever the agent holds.
4. A shop's call runs under the agent's constraints at the dependency:
   a value outside them is exit 2 with the constraint's line, and no
   dependency process ran. When the shop then fails, the agent's call
   is exit 2 with that line.
5. The grant file's town is a loopback address the call alone knows,
   and its token is good there alone: sent to the town's own port it is
   an invalid pass, exit 3; after the call ends, the address refuses at
   the socket. Two calls never share an address or a token, and the
   agent's own token is never given to a shop.
6. The tree ends with the call: when the outer call ends, by exit,
   failure, or its thirty seconds, every call still running in its
   service is killed with it.
7. At depth two, a shop calling a shop that calls a third, the effective
   grant is cut from the agent's own by the calling shop's manifest and
   never widened by the shop above.
8. A test swaps a composed shop's entry for one that prints its
   environment, argv, stdin, its grant file, and every file it can read
   under `TOWN_STATE` and the data directory, then asserts the agent's
   token is in none of it and the call's token opens nothing once the
   call is over.
9. `townd admin shop test <dir>` of a shop with dependencies runs the
   tree against a scratch state, so a test that writes to a dependency
   writes scratch; a dependency with a need runs on the user's
   credential as vault says, so the tree's tests read at the origin and
   never write.

Acceptance criteria:

- The environment a shop gets is exactly gate's three names, plus one
  per need, plus `TOWN_GRANT` when and only when it has dependencies;
  a test asserts the set.
- A shop holds a token good at the clerk alone and dead after; the
  agent's pass token reaches no process.
- A shop can do at a dependency no more than its caller could: the
  effective grant at every depth is a subset of the agent's, in
  commands and in constraints, enumerated by a test.
