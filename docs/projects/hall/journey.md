---
status: planned
since: 2026-09-12
see: hall
note: "written 12 Sep 2026, the day compose closed: the town's hall, where an agent finds, writes, publishes, and asks for shops, as a shop the town is born with. Nothing built yet; hall phase 0 is next."
---

# Hall — the journeys

Gate proved that a grant file in a directory is a capability, vault that
a shop can be given the outside world without holding a credential, and
compose that a shop can call other shops as the agent that called it
and never as more. Every shop in the town so far was written by a
builder and put in by the operator at the box. **This project lets an
agent write a shop, send it to the town, run it, and ask for what its
grants do not allow, with a person deciding.** Town Hall is a shop the
town is born with, `town/hall`, granted and narrowed like any other; a
shop an agent publishes is tested with the agent's own grants, named
for the agent's user, and held by that agent alone; and a permit is a
grant proposed by an agent and decided by the operator at the box.

Each journey is an acceptance test: the work is done when it can be
walked as written. [design.md](design.md) is the mechanism and
[phases.md](phases.md) the walk. If a journey and the mechanism
disagree, the mechanism is what changes.

Vocabulary the journeys use, on top of gate's, vault's, and compose's:

- **The hall**: `town/hall`, the shop in every town from its first open,
  whose commands run in the town's process. Its help, denials, and
  audit rows are a shop's.
- **A bundle**: a shop's directory sent on stdin as a tar of plain text
  files, `tar --format ustar -cf - -C <dir> . | town hall <command>`.
- **A namespace**: the first part of a shop's name. `town/` is the
  operator's; a user's is their name, so dimitri's agent publishes
  `dimitri/todo`.
- **The publish grant**: the grant a pass gains at a shop it published,
  every command and no constraints, remade at each publish.
- **A permit**: a grant an agent proposed with `request`: shop,
  commands, constraints, why. Pending until the operator approves it,
  as asked or narrower, or denies it.
- **A grant's source**: who made it: the operator, a publish, or a
  permit.

## Journey 1: The agent writes a shop

An agent in a directory with `.town/grant`, told the one sentence. The
pass is dimitri's and holds two grants: `town/hall` with every command,
and `town/memory` with `remember`, `recall`, and `list`, no constraints.
The town holds `town/hall` and `town/memory`.

1. `town --help` lists hall and memory with their commands. `town hall
   --help` prints the hall's summary, its guidance with the one `tar`
   line, its eight commands with their arguments, and the grant's
   label. Nothing in it names the town's address, the user, or a
   directory on the box.
2. `town hall search` lists every shop in the town, one line each: the
   name, the summary, the commands in brackets, and what this pass
   holds there, `held: remember, recall, list` or `held: all`. `town
   hall search --query todo` lists nothing and says so, exit 0. `town
   hall show --shop town/memory` prints memory's help as a full grant
   would read it, `forget` included, and says which commands this pass
   holds.
3. `town hall spec` prints the manifest spec, byte for byte what `townd
   spec` prints.
4. The agent writes `todo/manifest.yaml` and `todo/main.mjs` with the
   shell. `tar --format ustar -cf - -C todo . | town hall validate`
   prints one line per refusal, each citing a spec section, and exits
   1; a name of `town/todo` is refused as `name: town/todo is not under
   your namespace; write dimitri/todo instead (spec §2)`. Fixed and sent
   again: `ok dimitri/todo 0.1.0: add, done, list`, exit 0. The town
   has no new shop.
5. `… | town hall test` prints `ok <name>` or `not ok <name>: <why>` per
   test and exits 0 when all pass, 1 otherwise. The town has no new
   shop and no new state.
6. `… | town hall publish` prints the test lines, then `published
   dimitri/todo 0.1.0; town todo --help says what it does`, exit 0.
   `town --help` now lists `dimitri/todo` with `add`, `done`, and
   `list`; `town todo add --item milk` runs the agent's own code under
   the runtime contract and prints what it printed. A manifest with a
   fourth command sent again replaces the shop, and `town --help` lists
   four commands; the grant followed the shop.
7. `town hall request --shop town/memory --commands forget --why "to
   clear finished items"` prints `requested prm_…; a person decides at
   the box, and town --help shows the answer`. `town hall requests`
   lists it as pending. Approved at the box, `town --help` lists
   `forget` under memory and `requests` says `approved as <grant id>`;
   denied, `requests` says `denied` and help is unchanged.
8. The walk: the agent, asked to build a shop that keeps a to-do list,
   put it in the town, and use it, gets there and uses it; asked then
   to do something memory's grant does not allow, it asks with
   `request` instead of giving up or working around, and after the
   permit is approved it does it. The round trips through `validate`
   and `publish`, and each refusal's section, are read from the audit
   and recorded.

Acceptance criteria:

- Everything the hall tells an agent is derived: help from its
  manifest, refusals from the validator with their sections, the
  namespace from the pass's user, the held commands from the grants.
  Nothing in it names the box's paths, the data directory, or a token.
- A published shop is held by the publishing pass at exactly its
  commands, and by no other pass, until a person grants it.
- Every hall call is an audit row under the agent's pass with a
  `detail` the survey can count: `refused §…`, `tests n/m`, `published
  <name> <version>`, `requested <id>`. A publish's test calls are rows
  whose parent is the publish.

## Journey 2: The operator decides

The operator of compose's journey 2, at the box, with the same town.

1. A store made new has `town/hall` in `townd admin shop ls`, version
   this town's, owner `-`; a store made by compose opens under hall
   with its rows and gains the permits table, `shops.owner`,
   `grants.source`, and the hall's row. `shop rm town/hall` is refused
   as the town's own; `shop add` of a directory whose manifest is named
   `town/hall`, or says `runtime: town`, is refused the same way.
2. `townd admin grant new --pass <id> --shop town/hall --commands
   spec,validate,test,publish` makes a hall grant as at any shop; the
   agent's `town hall request …` is then `error: command 'request' is
   not available to this grant`, exit 2, and its help lists four
   commands.
3. `townd admin permit ls` shows the agent's request: id, pass, user,
   shop, commands, constraints, why, asked, `pending`. `permit approve
   <id>` makes the grant and prints its id; `grant ls` shows it with
   source `permit <id>` and the permit as `approved`. `permit approve
   <id> --commands recall` at a permit that asked `remember,recall`
   makes a grant at `recall` alone; `--commands forget` at that permit
   is refused as wider than asked. When the pass already holds a grant
   at the shop, approve revokes it and names it. `permit deny <id>`
   records the decision; a decided permit is not decided again.
4. `permit approve` at a composed shop whose dependencies the pass does
   not hold is refused in `grant new`'s words, and the permit stays
   pending; the same for a shop with a need the user has no credential
   for.
5. `shop ls` shows `dimitri/todo` with owner `dimitri`. `grant ls` shows
   the pass's grant at it with source `publish`. `shop rm dimitri/todo`
   removes it; the grant reaches nothing after, and `town --help` does
   not list it.
6. `audit --shop town/hall` lists the agent's hall calls with their
   details; `audit --call <the publish's id>` prints the publish and,
   under it, the calls its tests made at memory, each with the agent's
   pass. `user add Dimitri_G` is refused, since the name is not a
   namespace.

Acceptance criteria:

- Every operator verb works with the server stopped and running; the
  database is the meeting point.
- A `command` test walks steps 1 to 6 against a server it starts, on
  the memory shop and fixtures, so the ring needs no token and no
  network.
- A store made by compose opens under hall with everything intact and
  gains the table, the columns, and the row.

## Journey 3: The hall is a shop, and never more

A person who wants to know what an agent with a hall grant can do.

1. A pass with no grant at the hall: `town hall spec` is "not available
   to this grant", exit 2, and help does not list the hall. A hall
   grant with `request.shop prefix town/`: `town hall request --shop
   alice/notes` is exit 2 with the constraint's line, and the permit
   was not made.
2. A bundle whose manifest declares `credentials` is refused naming the
   rule and the two ways around it; one named under `town/` or another
   user's name is refused naming the name to write; one with `runtime:
   town` is refused. None is written anywhere.
3. A bundle whose manifest depends on a shop this pass holds no grant
   at, or holds without a command it declares, is refused before any
   test runs, naming the shop and the command. A bundle whose test
   calls a dependency with a value the agent's constraints refuse fails
   that test with the agent's constraint line, and the audit shows the
   inner call `denied` under the hall's call; the town's shop at that
   dependency ran no process for it.
4. A bundle holding a path with `..`, an absolute path, a symbolic link,
   a pax or GNU header, or no `manifest.yaml` at its root is refused
   with a line naming what was found and the `tar` command to use.
   After every refusal the town's shops directory holds no staging.
5. A published shop runs as `town/memory` runs: the environment is
   exactly the contract's three names, plus `TOWN_GRANT` when and only
   when it has dependencies; its state is under the town's state root
   for the shop and the user; its stderr is in its audit row; thirty
   seconds and it is stopped. A published fixture whose entry prints
   its environment, argv, stdin, and every file it can read under
   `TOWN_STATE` finds the agent's token in none of it.
6. The publish grant is at the shop's commands, no constraints, source
   `publish`, and only on the publishing pass: a second pass of the
   same user does not list the shop until a person grants it. A publish
   over a shop where the pass holds a grant the operator or a permit
   made leaves that grant as it is and says so.
7. A published recipe over `town/memory` is live by compose's rule:
   with the pass's memory grant narrowed under it to `recall`, `town
   --help` lists the recipe no more and its calls are "not available";
   granted `remember` again, it is back.
8. `runtime: town` is the town's alone: a manifest sent to the hall or
   given to `shop add` with it is refused; a manifest depending on
   `town/hall` is refused at the validator, so the hall answers agents
   and never a shop's clerk or a shop test's tree.

Acceptance criteria:

- A sent shop is tested and run with nothing the agent does not hold:
  every inner call of its tests carries the agent's pass and the
  agent's effective grant, enumerated by a test; no test grant of
  declared commands exists at the hall.
- No pass holds a grant no person made, other than the publish grant at
  a shop the pass itself published; a test enumerates the sources of
  every grant after each journey.
- The agent's binary still knows nothing: the guard passes with `hall`,
  `publish`, and `permit` among the forbidden words, and its one new
  line names no shop.
