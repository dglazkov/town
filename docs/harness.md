# The harness contract

A **harness** is any program an agent runs as `town`. This document is
the whole of what one must do: what it reads, what it posts to the town,
what it prints, and what it refuses. It is written for someone building a
harness in any language, from this page alone.

The sections are numbered because conformance cites them: `node
scripts/conform.mjs -- <your harness>`, run from a checkout of town,
runs your harness once per check and prints `ok <check> (§<n>)` or `FAIL
<check> (§<n>): …` naming the section a check proves. [Running
conformance](#running-conformance), at the end, says how.

Every example below is one of those checks, against the check shop
`test/conform` that conformance adds to a town for its run. Its commands
are `echo --text <string>` (prints the text and one newline), `cat`
(prints stdin back), `count` (prints the byte length of stdin), `fail`
(writes a line on stderr and exits 1), and `hidden`, which the grant
conformance makes leaves out. That grant also holds `echo --text` to at
most 64 characters, and its pass expires in three days.

## §1. What a harness is

A person who runs a town handed an agent a **grant**: the town's address
and a bearer token for a pass. The pass holds grants at shops, each a set
of commands and limits on their arguments. The agent types `town` and
words; the harness sends the words, and stdin when there is some, to the
town, prints what comes back, and exits with the code it was given.

The harness knows no shop, no command, and no argument. The town decides
everything and renders everything, help included: `town` with no words is
sent like any call, with `argv` empty, and the town answers with help for
the grant.

```
$ town
test/conform  Answers conformance's checks with output exact enough to compare. [echo, cat, count, fail]

`town <shop> --help` shows a shop's commands and this grant's limits; a shop answers to its last part, as in `town conform --help`.
```

(`hidden` is not listed: the grant lacks it. Stderr carries the notice of
§9.)

## §2. The grant

A harness takes its grant from the environment variable `TOWN_GRANT`,
holding the grant itself:

```json
{
  "town": "http://127.0.0.1:7000",
  "token": "Xq3v9LwT2bK7nRfYp4sJ8dHc6mZa1uGe5oNiW0tBkEy"
}
```

- `TOWN_GRANT` holds a grant when its first character that is not white
  space is `{` and it parses as a JSON object whose `town` is a URL and
  whose `token` is a string.
- White space, newlines included, may surround the JSON: the operator's
  `townd admin pass new` prints it indented, with a newline after, and
  `TOWN_GRANT="$(townd admin pass new …)"` is how it is handed over.
- No `TOWN_GRANT`, and no grant from anywhere else the harness looks
  (§10): refuse, exit 3 (§7).
- A `TOWN_GRANT` that holds no grant, whether JSON that is not one (a
  `town` that is not a URL, say) or a bare token pasted where the grant
  was meant: refuse, exit 3 (§7). The refusal **never prints what `TOWN_GRANT`
  holds**, nor any part of it, on either stream, with or without
  `--json`: what it holds is very likely a token.

Where a harness looks for a grant beyond this, a path in `TOWN_GRANT`, a
grant file, a flag, is its own (§10).

## §3. The words

Every word the harness was run with goes to the town in `argv`, in order,
exactly as the harness received it, except `--json`:

- An empty word is sent as `""`.
- A word with spaces is one word: `"  two  words  "` stays whole, spaces
  at either end included.
- A word that is not ASCII is sent as the same Unicode text:
  `héllo·wörld,世界🌍`.
- A word beginning with `--` is sent like any other; `--help` is the
  town's to answer (§1).
- `--json`, wherever it stands, before, among, or after the other words,
  is the harness's: it is taken out of `argv`, and the request says
  `"json": true` (§5).

| typed | `argv` sent | `json` |
| --- | --- | --- |
| `town conform echo --text ""` | `["conform", "echo", "--text", ""]` | `false` |
| `town conform --help` | `["conform", "--help"]` | `false` |
| `town --json conform echo --text hi` | `["conform", "echo", "--text", "hi"]` | `true` |
| `town conform echo --json --text hi` | `["conform", "echo", "--text", "hi"]` | `true` |
| `town conform echo --text hi --json` | `["conform", "echo", "--text", "hi"]` | `true` |

All three `--json` calls print the same line on stdout, and nothing on
stderr:

```
{"ok":true,"output":"hi\n","notices":[{"kind":"pass-expires","expires":"2026-09-17T17:38:03Z"}],"exit":0}
```

## §4. Stdin

Whether stdin is read depends on what it is:

- **A pipe** (`printf hi | town …`) or **a regular file** (`town … <
  file`): read to the end and sent.
- **Anything else**, a terminal, a character device such as `/dev/null`,
  or a socket: not read, and the call is made at once. An agent's tool
  runner may hand its commands a socket that never closes; a harness that
  reads it waits forever.

What was read is sent as text in `stdin` (§5):

- Exactly as read: quotes, backslashes, tabs, carriage returns, and
  newlines kept, nothing trimmed, no newline added. Piped to `town
  conform cat`, `he said "hi" and<tab>left\ a backslash, \n not a
  newline,<CR><LF>and two lines after<LF><LF>` comes back byte for byte.
- Nothing read, or nothing there, is `"stdin": null`.
- Bytes that are not valid UTF-8 are refused before any request is made:
  exit 1 (§7). The town carries text.
- The harness sets no limit of its own. The town refuses stdin over one
  mebibyte (1 048 576 bytes) in its own words, as an answer (§6): 900 000
  bytes piped to `town conform count` print `900000`, and 1 100 000 bytes
  are exit 1 with

```
town-notice: pass-expires expires=2026-09-17T17:38:03Z
error: stdin is 1100000 bytes, over the one megabyte limit
```

## §5. The request

One call is one request:

```
POST <town>/call
authorization: Bearer <token>
content-type: application/json

{"argv":["conform","echo","--text","hello"],"stdin":null,"json":false}
```

- `<town>` is the grant's `town`. The path is `/call` at that address,
  whether the grant writes it with a trailing slash or without:
  `http://127.0.0.1:7000` and `http://127.0.0.1:7000/` both post to
  `http://127.0.0.1:7000/call`.
- `<token>` is the grant's `token`, as it is.
- The body is a JSON object of `argv` (§3), an array of strings;
  `stdin` (§4), a string or `null`; and `json` (§3), a boolean.

## §6. The answer

The town answers a call with a JSON object of three fields:

```json
{"stdout":"","stderr":"town-notice: pass-expires expires=2026-09-17T17:38:03Z\nerror: test/conform fail failed\nconform: failed on purpose\n","exit":1}
```

- Write `stdout` to stdout and `stderr` to stderr, each exactly as given,
  adding nothing and removing nothing; then exit with `exit`.
- The answer is the three fields whatever the HTTP status. A response
  that is not a JSON object holding a string `stdout`, a string `stderr`,
  and a number `exit`, or no response at all, is a town that did not
  answer (§7).
- With `"json": true` the town has already made `stdout` one line, the
  envelope, and `stderr` empty; the harness prints them the same way. The
  envelope is `ok`, `output` (what the shop printed), `notices` (§9),
  `exit`, and, when `exit` is not 0, `error`:

```
$ town --json conform hidden
{"ok":false,"output":"","notices":[{"kind":"pass-expires","expires":"2026-09-17T17:38:03Z"}],"exit":2,"error":"error: command 'hidden' is not available to this grant"}
$ echo $?
2
```

## §7. The harness's own refusals

Four refusals are the harness's, made without an answer from the town:

| refusal | exit |
| --- | --- |
| no grant (§2) | 3 |
| a `TOWN_GRANT` that holds no grant (§2) | 3 |
| stdin that is not UTF-8 (§4), before any request | 1 |
| a town that did not answer (§6) | 1 |

- Each is one line on stderr, and nothing on stdout. Its words are the
  harness's own; a refusal of `TOWN_GRANT` never holds its contents (§2).
- With `--json` anywhere in the words, the line goes instead into an
  envelope on stdout, one line of JSON and a newline, with stderr empty:

```
{"ok":false,"output":"","notices":[],"exit":3,"error":"error: no grant file: …"}
```

  exactly the five fields `ok` (`false`), `output` (`""`), `notices`
  (`[]`), `exit` (the refusal's code), and `error` (the line).

## §8. The exit codes

A harness exits with the answer's `exit` unchanged, or with its own
refusal's code (§7). What each means:

| exit | meaning |
| --- | --- |
| 0 | the call succeeded |
| 1 | a call the shop's arguments refuse, a shop that failed or ran out of time, stdin over the limit, the town's own failure; or the harness's refusal of stdin or of a town that did not answer |
| 2 | a denial by the grant: a command it lacks, or a value outside one of its limits |
| 3 | a pass that is not valid (its token unknown, revoked, or expired), or no grant to make one |

In the town's words:

```
$ town conform echo
town-notice: pass-expires expires=2026-09-17T17:38:03Z
error: --text is required
usage: town conform echo --text <string>
$ echo $?
1
$ town conform hidden
town-notice: pass-expires expires=2026-09-17T17:38:03Z
error: command 'hidden' is not available to this grant
$ echo $?
2
$ town conform echo --text xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
town-notice: pass-expires expires=2026-09-17T17:38:03Z
error: --text must be at most 64 characters under this grant
$ echo $?
2
$ TOWN_GRANT="$REVOKED" town conform echo --text hi
error: this pass is not valid: its token is unknown, revoked, or expired
$ echo $?
3
```

## §9. Notices

The town tells the agent about what is coming, such as a pass about to
expire, in notices. In an answer's `stderr` they are lines at the head,
before anything else; in the envelope they are objects in `notices`:

```
$ town conform echo --text hello
hello
town-notice: pass-expires expires=2026-09-17T17:38:03Z
```

(`hello` on stdout; the notice on stderr.) A harness passes notice lines
through like the rest of `stderr`: it neither parses them nor drops them,
on a call that succeeds as on one that does not.

## §10. What a harness may add, and what it may not

A harness may add, without breaking the contract:

- **Its own ways to find a grant**: `TOWN_GRANT` holding the path of a
  file with the grant in it, a grant file it looks for, a flag such as
  `--grant <path>`. A flag it takes is a word it does not send (§3); a
  shop's arguments are never named `json`, `grant`, or `help`, so
  `--grant` is free to take. Never a flag holding the grant itself: argv
  is in the agent's transcript and the process table.
- **A timeout**, longer than the thirty seconds the town gives a shop.

A harness may not:

- render help, or answer any word the town answers (§1);
- parse, check, or rewrite a shop's command or arguments (§3);
- **retry a call**. A call is posted once whatever its answer, since a
  command that wrote may write again: `town conform fail` exits 1 and
  leaves one row in the town's audit, not two;
- print what `TOWN_GRANT` holds (§2).

## Running conformance

From a checkout of town, built (`pnpm install && pnpm build`):

```
node scripts/conform.mjs -- ./town                 # your harness, as a command and its first words
node scripts/conform.mjs -- python3 /path/to/town.py
node scripts/conform.mjs --list                    # each check and its section; runs nothing
```

The script starts a town on a free port over a directory of its own,
adds the check shop, makes the user `conform`, pass A (`conform A`,
expiring in three days, with the grant described at the top), and pass B
(`conform B`), revoked at once. It runs your harness once per check,
with the check's words appended, from an empty directory under an empty
`HOME`, with its own environment less every `TOWN_*` variable and
`TOWN_GRANT` set as the check says: pass A's grant, pass B's, a value
that is not a grant, a bare token, a grant whose town is a port nothing
listens on, or unset. Stdin is `/dev/null`, a pipe, a regular file, or a
socket held open and never written. A word of the harness command that
names a file relative to where you run the script is made absolute.

```
ok help (§1)
FAIL stdin-socket (§4): expected exit 0, stdout "held\n" / came no exit within 20 s, killed
…
not conformant: 1 of 30 checks failed
```

It ends `conformant: <N> checks`, exit 0, or `not conformant: <k> of <N>
checks failed`, exit 1, and either way revokes pass A, removes the check
shop, stops the town, and removes its directory. Exit 2 is no verdict: a
harness command that cannot be run at all (said before any town is
started), or a town that could not be set up.

`--town <url>` runs the same checks against a town already running, every
operator verb sent with `townd admin --town <url>`, which reads the
operator's token from `$TOWN_OPERATOR` or `~/.town/operator`. `--wall
<kind>` is passed to the town the script starts.
