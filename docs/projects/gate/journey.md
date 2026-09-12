---
status: partial
since: 2026-09-12
see: gate
note: "written 12 Sep 2026, the day the draft was cut into projects: the town's gate, where a grant is checked. Gate phase 0 closed the same day: the manifest spec, the validator, the runtime contract, and the memory shop passing its own tests, journey 4 steps 1 to 4. The town, the command, and the walk are still to come."
---

# Gate — the journeys

Town gives agents the outside world through **shops**, capabilities
handed to an agent as a CLI. The thesis is that the CLI handed to an
agent *is* the capability: what it can run is what it may do, settled
before it runs anything. **The gate is where that is settled.** This
project is the smallest town that proves it: one server on one box, a
grant file in a directory, the `town` command, and one shop. No
credentials, no Square, no Town Hall; a person puts shops and grants in
at the box. Everything after this project is a shop that needs the
outside world, and a nicer door for the person.

Each journey is an acceptance test: the work is done when it can be
walked as written. [design.md](design.md) is the mechanism and
[phases.md](phases.md) the walk. If a journey and the mechanism
disagree, the mechanism is what changes.

Vocabulary the journeys use:

- **The town**: one process, `townd serve`, with a data directory that is
  the whole of its state.
- **The operator**: the person at the box, running `townd admin` against
  the data directory. Until the Square, the operator is the human.
- **The two binaries**: `town` is the agent's, and carries argv one way
  and output the other; `townd` is the operator's, `serve`, `admin`,
  and `spec`, and is never on an agent's PATH.
- **A shop**: a directory with a manifest, code, and tests, added to the
  town by the operator. This project's one shop is `town/memory`:
  `remember`, `recall`, `list`, `forget`.
- **A pass**: the token an agent holds, made for a user with a label,
  revocable at once. It is what the grant file carries.
- **A grant**: what a pass may do at one shop: a subset of commands, and
  constraints on their arguments. A pass holds one grant per shop.
- **The grant file**: `.town/grant` in the agent's directory, or
  `~/.town/grant`: the town's address and the pass's token, nothing else.
- **A notice**: a line the town writes on stderr, `town-notice: …`, for
  the agent and never the person.
- **The audit**: every call, as a row: pass, shop, command, a hash of the
  arguments, the result class, the latency, the notices.

## Journey 1: The first call

An agent, a coding harness in some directory, is told one sentence: there
is a `town` command, and `town --help` says what it can do. The directory
holds `.town/grant`. Nobody told it about memory.

1. `town --help` prints the shops this pass may use, one line each with
   the commands the grant allows, and nothing else. It does not list
   `forget`, which this grant lacks. It does not mention the town's
   address, the user, or the token.
2. `town memory --help` prints the shop's summary, its guidance, the
   commands the grant allows with their arguments and one line of doc
   each, and the grant's label and constraints in plain words: "keys
   under `notes/` only".
3. `town memory remember --key notes/lunch --value "tacos, Thursday"`
   prints what the shop printed and exits 0.
4. `town memory recall --key notes/lunch` prints `tacos, Thursday`.
5. `town memory forget --key notes/lunch` prints one line, `error:
   command 'forget' is not available to this grant`, and exits 2. The
   shop did not run.
6. `town memory recall --key notes/lunch --json` prints a JSON envelope:
   `ok`, `output`, `notices`, `exit`. With the grant a day from expiry,
   `notices` holds `grant-expires`, and without `--json` the same notice
   is one `town-notice:` line on stderr with stdout untouched.
7. The agent reads what it needs from `--help` and the notices, and
   does what it was asked with no call denied.

Acceptance criteria:

- Nothing in the agent's directory, on its screen, or in its transcript
  is a secret but the token in the grant file; the audit holds a hash of
  the arguments, never the arguments.
- Help never names a command or a constraint the grant does not hold; a
  test renders help for every subset of a shop's commands and reads it.
- A denied call is one line on stderr and exit 2, and the audit shows
  the shop was not run. The exit codes are the draft's: 0, 1 the shop
  or the call failed, 2 denied, 3 the pass is invalid or expired, 4
  sunset.
- The `town` command has no knowledge of any shop: a guard reads its
  source for the words `memory`, `remember`, `recall`, `--key`, and
  finds none. It has no operator verb either: `town serve`, `town
  admin`, and `town spec` are unknown to it and say so, exit 1.
- The walk: a real agent, given the directory and the sentence, does the
  task with no denied call in the audit, and says what it could not do
  when a grant is narrowed under it.

## Journey 2: The operator's box

A person on a laptop wants a town.

1. `townd serve --data ~/town` starts it on `127.0.0.1:7000` and prints
   the address. `GET /` answers `town`. The data directory holds the
   database, the shops' code, and the shops' state, and nothing else on
   the machine belongs to the town.
2. `townd admin --data ~/town shop add shops/memory` validates the
   manifest, runs the shop's own tests through the runtime, and adds
   `town/memory`. A manifest with a mistake is refused with a message
   that says what is wrong and what to write instead; a shop whose tests
   fail is refused with the failing test named.
3. `townd admin user add dimitri`, then `townd admin pass new --user
   dimitri --label "research assistant"` prints a grant file to stdout,
   the one time the token is shown, and its id on stderr.
4. `townd admin grant new --pass <id> --shop town/memory --commands
   remember,recall,list --constraint 'remember.key prefix notes/'
   --constraint 'recall.key prefix notes/' --expires 30d` adds the grant.
   `townd admin grant ls` shows it with its last use.
5. The agent of journey 1 works. `townd admin audit --pass <id>` lists
   its calls, newest last, with the columns of the vocabulary.
6. `townd admin grant revoke <id>`: the agent's next `town memory …` is
   exit 2 and `town --help` no longer lists memory. `townd admin pass
   revoke <id>`: the next call of any kind is exit 3, one line, and the
   grant file is now paper.
7. The server is stopped, the data directory copied to another path,
   `townd serve --data <copy>` started: the same town, every grant and
   every memory in it.

Acceptance criteria:

- Revocation is seen by the next call, with no restart and no cache.
- Every call, allowed or denied, is one audit row, and a call the shop
  ran has the shop's exit code as its result class.
- The `admin` verbs work with the server stopped and with it running;
  the database is the meeting point.
- The data directory is the operator's capability and lives outside
  any directory an agent works in; `townd serve` refuses a data
  directory that has a `.town/grant` in it or in any directory above
  it, since that is an agent's directory by definition, and the README
  says why.
- A `command` test walks steps 1 to 7 against a server it starts on a
  free port, with a data directory it makes and deletes.

## Journey 3: The narrow grant

The operator gives an agent less than the shop offers.

1. A grant with commands `recall` alone: `town memory --help` shows
   `recall` and no other; `remember` is exit 2 with the one line.
2. A grant with `remember.key prefix notes/`: `remember --key notes/a`
   runs; `remember --key secret/a` is exit 2, and the line names the
   constraint: `error: --key must start with 'notes/' under this grant`.
   `--help` says the same in its constraints paragraph.
3. The five built-in kinds each do what their name says, on a string
   argument: `equals`, `one_of`, `prefix`, `regex`, `max_length`. A grant
   naming a kind the argument's manifest does not mark `constrainable`
   is refused when made, not when called.
4. A required argument missing, an unknown argument, a value of the
   wrong type: exit 1, with a `usage:` line rendered from the manifest
   for the grant, and the shop not run.
5. An expired pass: exit 3 on any call, and the audit row says so.

Acceptance criteria:

- Every check happens before the shop's process exists: a test replaces
  the shop's entry with one that writes a file and asserts the file was
  not written on any denied or malformed call.
- The wording of every denial is one sentence, from one function, and a
  test enumerates them.

## Journey 4: The shop's contract

A shop author, an agent in a later project and the operator in this one,
writes a shop from the manifest spec and nothing else.

1. `townd spec` prints manifest v0: every field, its type, an example,
   and the runtime contract in the same document. It is what an agent
   reads before writing a shop, and it is under three hundred lines.
2. The shop is a directory: `manifest.yaml`, an entry the manifest
   names, tests in the manifest. The runtime runs the entry as a
   process: the command and its arguments as `argv` in canonical form,
   `TOWN_STATE` a directory private to this shop and this user, `TOWN_USER`
   an opaque id, `PATH`, and no other environment. The call's stdin is
   the process's stdin. Stdout is the result. Stderr is the shop's own
   log, kept in the audit, and shown to the agent only when the shop
   fails.
3. `townd admin shop test shops/memory` runs the manifest's tests through
   the runtime against a scratch state and prints one line per test.
4. `town/memory` is written to this contract and nothing more: a file
   per key under `TOWN_STATE`, `list` with an optional `--prefix`,
   `forget` with `effect: destructive`.
5. The same shop added to a second town works there unchanged.

Acceptance criteria:

- Everything an agent sees about a shop comes from the manifest: a test
  changes `guidance` and a command's `doc` and reads the change in
  `--help` with no other file touched.
- A manifest naming a credential or a dependency is refused with a line
  saying this town holds neither yet and which project brings them.
- The shop's tests are the only tests of the shop; the town's suite runs
  them through `shop test` and asserts nothing about memory's internals.
