// The manifest spec, v0: the whole of what a shop author reads before
// writing a shop. `townd spec` prints it; every validator refusal cites
// one of its numbered sections. Keep it under three hundred lines.

export const SPEC = `# Shop manifest v0

A shop is a capability handed to an agent as a command. This document
is everything needed to write one: the manifest's fields, their types,
an example of each, the contract the entry runs under, and how the
shop's tests are run. Validator refusals name a section below, as
"(spec §n)"; reread that section and write what the refusal says.

## 1. What a shop is

A shop is a directory:

    manifest.yaml     the declaration, this document's subject
    main.mjs          the entry the manifest names (any name)
    ...               anything else the entry needs

Everything an agent sees about the shop (its help, its arguments, what
a grant may allow) comes from the manifest. The entry never prints help
and never parses anything the manifest did not declare.

## 2. Top-level fields

Every field below is required unless marked optional. No other field is
accepted.

    name: town/memory
      string, "<namespace>/<shop>", each part lowercase letters,
      digits, and "-", starting with a letter. The last part names
      the shop to an agent; it may not be serve, admin, or spec.

    version: 0.1.0
      string, semver "<major>.<minor>.<patch>".

    summary: Short notes, kept by key.
      string, one line, what the shop is for.

    guidance: |
      Keys are paths, like \`notes/lunch\`.
      optional string, any number of lines: when to use the shop,
      recipes, pitfalls. Shown in the shop's help.

    summary and guidance never name one of the shop's commands as a
    whole word, in any case. A grant may hide any command and help
    prints this prose whole, so a word about one command belongs in
    that command's summary or an argument's doc.

    runtime: subprocess
      the only value in v0.

    entry: ./main.mjs
      string, a path relative to the shop's directory, inside it.
      See §7 for how it is run.

    commands:
      a non-empty list of commands, §3.

    tests:
      a non-empty list of tests, §6.

    credentials:
      optional list of needs: the credential types the shop calls
      through, §8.

    depends:
      not held by this town yet, §8.

## 3. Commands

    - name: remember
      summary: Store a value under a key.
      effect: write
      args: [ ... ]
      output: text

    name     string, lowercase letters, digits, "-", starting with a
             letter; unique in the manifest. The agent types it first.
    summary  string, one line.
    effect   one of: read, write, destructive. read changes nothing;
             write adds or changes; destructive removes or overwrites
             what cannot be recovered.
    args     optional list of arguments, §4. Omitted means none.
    output   one of: text, json. What stdout carries.

## 4. Arguments

    - { name: key, type: string, required: true, doc: "A path-like key.",
        constrainable: [prefix, regex, max_length] }
    - { name: format, type: enum, values: [text, markdown], default: text }

    name           string, lowercase letters, digits, "-", starting with
                   a letter; unique in the command. Typed as --<name>.
                   Not json, grant, or help: the town command takes
                   those flags for itself wherever they stand.
    type           one of: string, int, bool, enum.
    required       optional bool, default false.
    doc            optional string, one line, shown in help.
    default        optional, a value of the argument's type; fills the
                   argument when it is omitted. Not with required: true.
    values         a non-empty list of strings; required when type is
                   enum and refused otherwise.
    constrainable  optional list of the constraint kinds a grant may put
                   on this argument, §5.

How an agent types arguments, and how they are checked:

    --name value     every type; for bool, value is true or false
    --name=value     the same
    --name           bool only: true

- A value is the next word whatever it looks like; "--value --x"
  gives value "--x".
- string: any text. int: an optional "-" and digits. bool: true or
  false. enum: exactly one of values.
- Refused before anything runs: a required argument missing, an
  argument the command does not declare, a word that is not an
  argument, an argument given twice, a value of the wrong type, an
  enum value not in values.

The canonical form (what the entry receives, §7) is the command, then
"--name value" for each argument in manifest order, defaults filled,
bools written as true or false. An argument omitted with no default is
left out.

## 5. Constraints

A grant may narrow an argument with a constraint the argument lists in
constrainable. The kinds are built into the town:

    equals      the value is exactly this         string, int, enum
    one_of      the value is one of these         string, int, enum
    prefix      the value starts with this        string
    regex       the value matches this pattern    string
    max_length  the value is at most this long    string

A bool takes none. The town checks constraints before the entry runs;
the shop does not implement them. A kind not in this list is refused.

## 6. Tests

    tests:
      - name: roundtrip
        run: |
          remember --key t/a --value hello
          recall --key t/a
        expect: { contains: hello }

    name    string, unique in the manifest.
    run     string, one call per line: "<command> <arguments>", as an
            agent would type it after the shop's name.
    expect  exactly one of:
              contains: <string>   the last line's stdout contains it
              equals: <string>     the last line's stdout, less one
                                   trailing newline, is exactly it
              exit: <int>          the last line's exit code

How a test runs:

- Blank lines are skipped. Each line's words are split as a shell
  would, with 'single' and "double" quotes and backslash escapes, and
  nothing expanded: no $VARIABLES, no pipes, no substitution.
- Each line is parsed against the manifest (§4) and run through the
  runtime (§7). A line that does not parse fails the test.
- All lines of one test share one scratch state, made empty for that
  test and deleted after. Tests do not share state with each other.
- Every line but the last must exit 0, or the test fails naming it.
- Lines get empty stdin.

The tests are the shop's only tests. They must pass for the shop to be
added to a town; \`townd admin shop test <dir>\` runs them and prints one
line per test, "ok <name>" or "not ok <name>: <why>". A shop with needs
(§8) is tested with \`--data <dir> --user <name>\`: its tests run through
the town on that user's credentials, against the real origins. So a
test must be one its author could run a thousand times: it reads and
never writes.

## 7. The runtime contract

The town runs the entry as a process, from the shop's directory, once
per call:

- argv: the command, then its arguments in canonical form (§4). The
  arguments are already checked; parse "--name value" pairs and nothing
  more clever. The command is argv's first word after the entry.
- entry: a .mjs or .js entry runs under the town's own Node, so
  process.argv.slice(2) is the canonical argv. Any other file is
  executed directly and must be executable; its arguments are the
  canonical argv.
- environment: exactly three names, plus one per need (§8), and
  nothing else:
    TOWN_STATE  a directory made before the call, private to this shop
                and this user. Keep all state here; it persists across
                calls. Nothing outside it is yours.
    TOWN_USER   an opaque id for the calling user.
    PATH        the town's own.
    TOWN_CREDENTIAL_<TYPE>
                per need, the type upper-cased with "-" as "_": a base
                URL on loopback that lives as long as the call.
- stdin: the call's stdin, as sent, empty when none. Over one megabyte
  is refused before the entry runs.
- stdout: the result, passed to the agent as it is.
- stderr: the shop's own log. Kept by the town in its audit, and shown
  to the agent only when the call fails. The audit never holds an
  argument, so never write an argument's value to stderr: say "no value
  under that key", not the key.
- exit code: 0 is success; anything else is a failure, and the agent
  sees exit 1.
- time: thirty seconds. Then the entry and every process it started
  are killed, and the call fails.

## 8. Credentials and dependencies

A shop never holds a credential. It names the types it needs, and on
each call the town opens a window per need that signs and forwards:

    credentials:
      - type: github-token

    credentials  optional list of needs, each { type: <name> } and no
                 other key, one per type. A type is the town's: the
                 origin its secret may be sent to and the header it
                 rides in. A type the town does not hold is refused,
                 naming the ones it does.

The shop's side: send to $TOWN_CREDENTIAL_<TYPE> (§7) the request you
would have sent to the type's origin, path and all, with no credential
of your own; the town adds it. A GET of
$TOWN_CREDENTIAL_GITHUB_TOKEN/repos/octocat/Hello-World reaches
https://api.github.com/repos/octocat/Hello-World signed. Method, query,
headers, and body go both ways, streamed, and the origin's status comes
back as it is. An Authorization the shop sets is replaced by the
type's. Do not write the URL to stderr: stderr is kept in the audit, and
the URL, though dead by then, is the shape of a secret.

    depends      other shops this one calls through the town. Not held
                 by this town yet: a non-empty depends is refused, and
                 project compose brings them.

## 9. A full example

    name: town/memory
    version: 0.1.0
    summary: Short notes, kept by key.
    guidance: |
      Keys are paths, like \`notes/lunch\`, and a prefix such as \`notes/\`
      gathers the keys under it. A value is one line; a longer one comes on
      stdin.
    runtime: subprocess
    entry: ./main.mjs
    commands:
      - name: remember
        summary: Store a value under a key.
        effect: write
        args:
          - { name: key, type: string, required: true, doc: "A path-like key.", constrainable: [prefix, regex, max_length] }
          - { name: value, type: string, doc: "The value. Reads stdin if omitted." }
        output: text
      - name: recall
        summary: Print the value under a key.
        effect: read
        args:
          - { name: key, type: string, required: true, constrainable: [prefix, regex] }
        output: text
      - name: list
        summary: List keys, optionally under a prefix.
        effect: read
        args:
          - { name: prefix, type: string, constrainable: [prefix] }
        output: text
      - name: forget
        summary: Delete a key.
        effect: destructive
        args:
          - { name: key, type: string, required: true, constrainable: [prefix] }
        output: text
    tests:
      - name: roundtrip
        run: |
          remember --key t/a --value hello
          recall --key t/a
        expect: { contains: hello }
      - name: forget removes
        run: |
          remember --key t/b --value x
          forget --key t/b
          recall --key t/b
        expect: { exit: 1 }

The entry, main.mjs, reads process.argv.slice(2), keeps one file per key
under TOWN_STATE, writes the value to stdout for recall, and exits 1
with a line on stderr, naming no key, when a key has no value.
`;

/** The numbered sections the spec holds, e.g. [1, 2, ..., 9]. */
export function specSections(): number[] {
  return [...SPEC.matchAll(/^## (\d+)\. /gm)].map((m) => Number(m[1]));
}
