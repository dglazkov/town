# Wall — the design

**12 September 2026.** Wall phase 0 closed. The project's status lives
in [journey.md](journey.md)'s front matter. The journeys are the
acceptance suite, this doc is the argument, and [phases.md](phases.md)
is the walk. It is cut from the draft's §13 in
[../../drafts/town-design-doc.md](../../drafts/town-design-doc.md),
and built on what [gate](../gate/design.md), [vault](../vault/design.md),
[compose](../compose/design.md), and [hall](../hall/design.md) left:
the runtime's contract, the teller, the clerk, the audit, the admin,
and a shop an agent wrote. Earlier docs call this project *containers*;
it is named here for what it adds. Where this doc refines the draft,
it says so and why, and the draft stays as it was.

The thesis in one line: **the runtime contract is already the list of
everything a shop gets; this project makes the list a wall. A shop's
process can read its own directory, read and write its state, and
reach the windows the town opened for the call, and nothing else on
the box: not the data directory, not the key, not the operator's home,
not the network, not another port on loopback, not the town itself.
The contract in the spec does not change a word; what changes is that
it stops being a promise.**

Every project before this one deferred the same debt here. Gate wrote
the contract and said the sandbox is a promise until it is a
mechanism, and that the mechanism, when it comes, replaces the process
and keeps the list. Vault's one open finding is `test/exfil.test.ts`:
on one box a shop's entry reads `vault.key` and `town.db` from its own
directory's grandparent and unseals every credential with them. Hall
closed on the case: a published shop is the agent's own code moved a
directory over, and the first shop an agent wrote is the first shop
nobody read. This project closes vault's finding, on this box, by
mechanism, and leaves the exfil test asserting the opposite of what it
asserts today.

## The names

| Word | What it is | Where it lives |
| --- | --- | --- |
| the wall | what encloses a shop's process: given a spawn and an enclosure, it returns the spawn to make | `src/wall.ts` |
| an enclosure | what one process may read, may read and write, and may reach: paths and loopback ports | `src/wall.ts`, built by the runtime per call |
| a wall's kind | `seatbelt`, macOS's `sandbox-exec` with a profile made per call; or `none`, the spawn unchanged | `townd serve --wall <kind>`, `townd admin --wall <kind>` |
| the profile | the Seatbelt text for one call, written from the enclosure | made in `src/wall.ts`, never on disk |
| the walled row | the audit's `wall` column: the kind a call's process ran under, or `-` when none ran | `src/schema.ts` schema 5, `src/audit.ts` |

## What the draft says, and what this project refines

**A wall, not a container.** The draft's §13.2 mitigates threat 2, a
shop exceeding its declared capabilities, with "a container with an
egress allowlist from the manifest," and §13.3 says the trust model
holds only once the sandbox enforces the manifest. The town on this
box cannot give a container its windows. The tellers and the clerk are
listeners on the host's loopback, and a Docker container on Docker
Desktop reaches them only with the network a shop must not have: a
container with no network reaches nothing on the host, and a unix
socket in a bind mount is refused by the file sharing outright. The
Docker shapes that would work, the town itself inside a container on
an internal network, or a forwarding sidecar per call, are the hosted
box's shape, and a box away. What this box has is Seatbelt,
`/usr/bin/sandbox-exec`, on every Mac: a profile applied to one
process and inherited by everything it starts, with a deny of the
filesystem by path and of the network by port. Measured before this
doc was written: under a profile made for the call, Node read the
shop's file and was refused the key, the home, `~/.ssh`, a listing of
the home, a write to the shop's directory, a write to `/tmp`, every
loopback port but the call's, and the internet; it read and wrote its
state and reached its port; and the whole run took a hundred and fifty
milliseconds, of which Node's own start is fifty. So the mechanism is
Seatbelt, behind a seam that names what every mechanism must give, so
that the Linux box gets its own without the runtime changing.

**No egress at all.** The draft's allowlist is derived from the
manifest. In this town no shop reaches an origin itself: a credential
is a need, the teller is the way to its origin, and the origins are the
town's `credential_types`. A shop with no need reaches nothing, and a
shop with a need reaches its teller, which reaches one origin. So the
wall's network rule is the shortest one: the call's windows, by port,
and nothing else. A shop that wants a public origin with no credential
is a need whose type has no token, a teller that signs nothing, and a
later project's; no shop in the repo wants it today.

**The wall hides what people wrote, not the system.** A profile that
denies everything and allows what Node needs aborts Node at startup,
and the list of what it needs is long and Apple's to change. The
profile is the other way up: allow the box, then deny the home, the
temporary directories, the volumes, and the data directory, then allow
back the shop's directory, the state, Node's own directory, the town's
own install, and the call's directory. `/usr`, `/System`, `/Library`,
`/etc`, and `/Applications` stay readable, as they are to any process
of the operator's. What the wall hides is everything a person or the
town wrote on this box. An operator whose secrets live outside those
places has a finding to make, and the deny list is one line to grow.
Writing is the other way round again, since the box is allowed only to
be read: every write is denied but the state's and `/dev/null`, so a
shop cannot leave a program where the operator will run it,
`/opt/homebrew/bin` and `/Users/Shared` being writable by the operator
and so by an unwalled shop. Measured before wall phase 0 began, under
the profile as first written: a walled Node wrote to both.

**A box without a wall says so.** The draft's promise was silent; a
mechanism that is absent must not be. `townd serve` and `townd admin`
take `--wall seatbelt` or `--wall none`, and without the flag use the
wall the box has. A box with none, Linux today, refuses to serve and
to add a shop: `this box has no wall; a shop would run with the box's
authority. Write --wall none to run it anyway.` Said out loud, the town
runs as it did before this project, and every audit row says `none`.

**The contract keeps every word and gains a paragraph.** Spec §7
already says "Nothing outside it is yours." It now says what that
means: the town walls the entry, so a path outside the shop's directory
and `TOWN_STATE` is refused, and so is every address but the ones in
its environment. An agent writing a shop reads the same list, and
learns that the list is all there is.

## The wall

`src/wall.ts`:

```ts
export type WallKind = "seatbelt" | "none";

export interface Enclosure {
  /** Directories the process may read: the shop's, Node's, the town's install, the call's. */
  reads: string[];
  /** Directories it may read and write: its state. */
  writes: string[];
  /** Loopback ports it may connect to: its tellers' and its clerk's. */
  ports: number[];
}

export interface Wall {
  readonly kind: WallKind;
  /** The spawn to make for `file` with `args` so that it runs within `within`. */
  enclose(file: string, args: readonly string[], within: Enclosure): { file: string; args: string[] };
}

/** The wall this box has: seatbelt where /usr/bin/sandbox-exec is, null otherwise. */
export function wallOnThisBox(): WallKind | null;

/** A wall of the kind, hiding `data` when given; throws when the kind is not this box's to give. */
export function openWall(kind: WallKind, opts: { data?: string }): Wall;
```

`none` returns the spawn it was given. `seatbelt` returns
`/usr/bin/sandbox-exec` with `-p <profile>` and then the spawn, where
the profile is:

```
(version 1)
(allow default)
(deny network*)
(allow network-outbound (remote ip "localhost:<port>"))        ; one per port
(deny signal)
(allow signal (target same-sandbox))
(deny file-write*)
(allow file-write* (literal "/dev/null"))
(deny file-read* file-write*
  (subpath "<home>") (subpath "/tmp") (subpath "/private/tmp")
  (subpath "/private/var/folders") (subpath "/Volumes")
  (subpath "<data>"))                                          ; when given
(allow file-read-metadata (literal "<ancestor>"))              ; one per ancestor of a read or write
(allow file-read* (subpath "<read>"))                           ; one per read
(allow file-read* file-write* (subpath "<write>"))              ; one per write
```

Seatbelt's rule is that the last match wins, so an allow below a deny
opens a subpath inside a hidden one: the shop's directory is under the
data directory and the state is under it too, and both are allowed
back by name. Each directory above a read or a write may be stat'ed,
not listed or read: Node finds its entry by `realpath`, which `lstat`s
every ancestor, and under the deny alone an entry anywhere below the
home or `/tmp` fails to start, `EPERM` on the ancestor, measured before
wall phase 0 began. Every path in the profile is absolute and real
(`realpath`), since Seatbelt matches the path a process opens, and
`/tmp` on this box is `/private/tmp`. A path or a port that would break
the profile's text, a quote or a newline, is refused before any process
exists. Signals reach the process's own sandbox and nothing else, so a
shop can end what it started and cannot end the town. The profile
rides in argv, so it is visible to `ps` on the box; it names paths and
ports and holds no secret.

What the wall does not do: it does not hide the process list, the
system's files, or the clock; it does not limit memory or CPU; and it
does not stop a shop from exec'ing what it can read, `/bin/sh` and
`/usr/bin/curl` included, since those run inside the same wall and are
refused the same things.

## The runtime, walled

`run(...)` takes `wall: Wall`, required, and there is no default: nothing
runs unwalled because a caller forgot. The runtime builds the enclosure
after it has opened the windows and before the process exists:

- **reads**: the shop's directory; Node's own directory, the parent of
  `process.execPath`'s directory, so an `.mjs` entry runs; the town's
  install, `TOWN_BIN`'s grandparent, so a composed shop's `town` runs;
  and the call's directory when there is one, for the grant and the
  shim.
- **writes**: the state directory.
- **ports**: each teller's port and the clerk's, read from their URLs.

Then `spawn` is given what `wall.enclose` returns, with the same `cwd`,
environment, stdio, and `detached`. The rest of the runtime is as it
was: the group is killed at the limit and on exit, and `sandbox-exec`
execs the entry in place, so the group is the same group. The result
gains `wall: WallKind`, so the gate can write the row.

`src/shoptest.ts` passes the wall through, so a shop's tests at `shop
add` and at the hall's `test` and `publish` run walled: they are the
shop's code too. `src/gate.ts` carries the wall in `GateDeps`, beside
the runtime, and the hall's test tree inherits it. `runtime: town` is
not walled: the hall's commands are the town's own and run in its
process, as hall says.

## The operator's binary, and the audit

`townd serve [--data <dir>] [--port <n>] [--wall <kind>]` and `townd
admin [--data <dir>] [--wall <kind>] <verb>`. With no flag, the wall is
`wallOnThisBox()`, and null is the refusal above, printed before any
listen or any verb. `--wall seatbelt` on a box without it is refused
naming the box. `serve` prints the kind on its first line: `town
listening on http://127.0.0.1:7000, shops walled by seatbelt`. `--wall
none` prints `shops walled by none`, and the test helper that starts a
town for the `command` ring passes nothing, so the whole ring runs
walled on a Mac.

The audit's row gains `wall`, schema 5: `seatbelt` or `none` for a call
whose process ran, `-` for a call decided before one (denied, refused,
the hall's own) and for a compose-era row. `townd admin audit` prints
it as a column, and `audit --call` prints it on every row of the tree,
so a shop's calls under a publish show their wall too. The migration
adds the column; a store made by hall opens under wall with everything
intact.

## The exfil test, turned around

Vault's `test/exfil.test.ts` swaps a shop's entry for one that prints
everything it can reach and asserts, today, that `vault.key` and
`town.db` were among it and that the credential unseals from the dump.
This project turns those assertions around and keeps the rest. The
prying entry reads its own directory and its state and prints them;
walks up from its own directory as far as the data directory's parent,
recording what was unreadable and why; tries the key and the database
by the paths it computes; tries the operator's home, a listing of it,
`/tmp`, and a write beside its own entry; and sends four requests: one
through its teller, which arrives signed; one to the town's own address,
handed to it on stdin; one to a port the test listens on for the
purpose; and one to a public origin. It prints every result. The test
asserts the shop's files and the state were read, that the key and the
database were `EPERM`, that no file under the data directory but the
shop's own was read, that the home and `/tmp` were refused, that the
teller's request arrived signed and the other three were refused, and
that the audit row says `seatbelt`. The `unsealFromDump` half is
deleted: there is nothing in the dump to unseal from. The same fixture,
under `--wall none`, still reads the key; that is the mutation that
proves the wall is doing the work, and the test runs it too, naming
the box's authority as the reason it can.

## Testing it

- **checkout**: `test/wall.test.ts`, on a box with Seatbelt: a prying
  fixture run under `openWall("seatbelt", …)` and asserted line by
  line as the table in the refinement above, reads and writes and
  ports; the profile's text for a given enclosure; a path with a quote
  refused; `openWall("seatbelt")` on a box without it refused. On a box
  without Seatbelt, these say so and skip. `test/runtime.test.ts` grown:
  `run` refuses without a wall by type, builds the enclosure the design
  names, and under the box's wall the fixture that prints its
  environment still sees the contract's three names and nothing more; a
  composed fixture's `town` runs within the wall; the limit still kills
  the group under it. `test/store.test.ts`, schema 5 and the migration
  of a hall-era store. In process, vitest, fast.
- **command**: `test/exfil.test.ts` as above, both ways; `test/box.test.ts`
  grown: `serve` printing its wall, `--wall none` printing `none`, the
  refusal on a box without one, provable on any box with a fake
  `wallOnThisBox` through an environment name the test alone sets;
  `townd admin audit` printing the column; a `shop add` whose test
  reads outside the shop failing under the wall and passing under
  `--wall none`; the hall's `publish` of a prying shop, whose own test
  finds it cannot read the data directory.
- **the walk**: a real Claude Code session with a hall grant and a
  memory grant, asked to write a shop that reports what it can see of
  the box it runs on, the town's files, the operator's home, the
  network, and put it in the town and run it; then asked to make the
  shop fetch a page from the web and say what the page says. The audit
  read for the walled rows, the transcript for what the agent said
  when its shop was refused. One model session, well under a dollar,
  no token.

## What this does not do, on purpose

- **A Linux wall.** `wallOnThisBox()` is null on Linux; the hosted box
  brings its mechanism, Landlock with its port rules or `bwrap`, behind
  the same seam, and the profile above is its specification.
- **Containers.** The draft's word for this, and the hosted box's
  shape: the town in one, shops in siblings on an internal network. On
  this box the wall is Seatbelt; on that one the seam takes both.
- **Egress a shop declares.** A need whose type has no token, a teller
  that signs nothing: a later project's, and the manifest field with it.
- **Hiding the system.** `/usr`, `/System`, `/Library`, `/etc`, and the
  process list are the box's, readable by any process of the
  operator's. A finding if a box keeps a secret there.
- **Memory, CPU, and disk.** The limit is thirty seconds; the rest is
  the box's.
- **A key held off the box.** Vault's other way to the same finding.
  With the wall, a shop cannot read the key; the operator's other
  processes still can, and that is the operator's authority.
- **The Square.** The `wall` column and `serve`'s first line are its
  contract.
