// The manifest spec, v0: the whole of what a shop author reads before
// writing a shop. `townd spec` prints it; every validator refusal cites
// one of its numbered sections. Keep it under three hundred lines.

export const SPEC = `# Shop manifest v0

A shop is a capability handed to an agent as a command. This document
is everything needed to write one: the manifest's fields, the contract
the entry runs under, and how its tests run. A validator refusal names
a section, "(spec §n)"; reread it and write what the refusal says.

## 1. What a shop is

A shop is a directory of text files:

    manifest.yaml     the declaration, this document's subject
    main.mjs          the entry the manifest names (any name)
    ...               anything else the entry needs

Everything an agent sees about the shop (its help, its arguments, what
a grant may allow) comes from the manifest. The entry never prints help
and never parses anything the manifest did not declare.

## 2. Top-level fields

Every field is required unless marked optional; no other is accepted.

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

    summary and guidance never name a command of the shop as a whole
    word, in any case: a grant may hide any command and help prints
    this prose whole, so say it in a command's summary or an arg's doc.

    runtime: worker
      worker, the program a function the entry exports; or subprocess,
      the entry run as a process. §7 says how each is run.

    entry: ./main.mjs
      string, a path relative to the shop's directory, inside it.

    commands:
      a non-empty list of commands, §3.

    tests:
      a non-empty list of tests, §6.

    credentials:
      optional list of needs: the credential types it calls through, §8.

    depends:
      optional list of dependencies: the shops it calls through, §8.

## 3. Commands

    - { name: remember, summary: Store a value under a key.,
        effect: write, args: [ ... ], output: text }

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

- A value is the next word, whatever it looks like: "--value --x".
- string: any text. int: an optional "-" and digits. bool: true or
  false. enum: exactly one of values.
- Refused before anything runs: a required argument missing, an
  argument the command does not declare, a word that is not an
  argument, an argument given twice, a value of the wrong type, an
  enum value not in values.

The canonical form (what the entry receives, §7): the command, then
"--name value" per argument in manifest order, defaults filled, bools as
true or false; an argument omitted with no default is left out.

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

These are the shop's only tests, and must pass for it to join a town.
With needs (§8) they run on a person's credentials against the real
origins, so a test reads and never writes. Dependencies run in the
test's scratch state.

## 7. The runtime contract

The town runs the entry as a process from the shop's directory, per call:

- argv: the command, then its arguments in canonical form (§4), already
  checked: parse "--name value" pairs and nothing more clever.
- entry: a .mjs or .js entry runs under the town's own Node, argv as
  process.argv.slice(2); any other file must be executable.
- environment: these names, and nothing else:
    TOWN_STATE  a directory private to this shop and this user, made
                before the call. Keep all state here; it persists.
    TOWN_USER   an opaque id for the calling user.
    PATH        the town's own; with dependencies, \`town\` comes first.
                On the box there is none: post to the town in TOWN_GRANT.
    TOWN_CREDENTIAL_<TYPE>
                per need, upper-cased, "-" as "_": a loopback URL (§8).
    TOWN_GRANT  with dependencies, a grant file for this call alone.
- stdin: the call's stdin, text, empty when none; over one megabyte is
  refused before the entry runs.
- stdout: the result, passed to the agent as it is.
- stderr: the shop's log, in the audit, shown to the agent only when the
  call fails. Never write a value there: "no value under that key".
- exit code: 0 is success; anything else fails, and the agent sees exit 1.
- time: thirty seconds; then the entry and all it started are killed.

runtime: worker is this contract with the program a function: the entry
exports default async function main(), called once per call; its return
is the exit code (none is 0), a throw exit 1 with the error's line on
stderr. Outside main, only imports and definitions: no await, I/O, or
timers. The rest is the same on every box. An entry with no main exits
1: "the entry exports no main; write export default async function
main() around the program (spec §7)".

The town walls the entry and all it starts. It reads only its directory,
TOWN_STATE, and the box's system files; writes only TOWN_STATE; reaches
only the addresses above; signals only what it started. The rest is refused.

## 8. Credentials and dependencies

A shop never holds a credential, and calls other shops only through the
town. It names the credential types it needs and the shops it calls:

    credentials:
      - type: github-token
      - type: figma
        origin: https://api.figma.com
        header: "X-Figma-Token: {token}"
        guidance: Make a personal access token at Figma > Settings >
          Security, with file_content:read, and paste it.
    depends:
      - shop: town/memory
        commands: [remember, recall]

    credentials  optional list of needs, one per type. A type is the
                 origin its secret may be sent to and the header it
                 rides in. { type } names a type the town holds. With
                 origin (an http: or https: URL, no query) and header
                 (with {token}) it defines one: exactly as the town
                 holds it, or, for a type it lacks, a proposal.
      guidance   with a definition, one paragraph of at most 600 characters
                 for whoever makes the secret: where, and what to allow. It
                 names no host, bare or in a URL, the type does not send to;
                 the proposing shop's republish writes it onto the type.
      oauth      with a definition, for an OAuth type: { authorize, token,
                 scopes }, two https: URLs and a list; never a client id,
                 secret, or redirect: a registration is the operator's.
    depends      optional list, each { shop, commands } and no other key,
                 one per shop, never this shop nor town/hall: a shop the
                 town holds and a non-empty list of its commands.

A need: send $TOWN_CREDENTIAL_<TYPE> (§7) the request you would send the
type's origin, path and all, with no credential; the town signs it, and
refreshes an OAuth type's token first. A GET of
$TOWN_CREDENTIAL_GITHUB_TOKEN/repos/octocat/Hello-World reaches
https://api.github.com/repos/octocat/Hello-World signed. Method, query,
headers, body, and status pass both ways as they are, streamed; an
Authorization you set is replaced. Keep the URL out of stderr, which the
audit keeps: dead by then, it is a secret's shape.

A shop published with needs waits for a person: its tests run, and a
grant at it is made, when a person approves the permit its publish asks.

A dependency: call it as an agent would, \`town <shop> <command> …\`;
\`town --help\` shows the agent's grant cut to what you declared. What you
did not declare, or a value outside the agent's constraints, is exit 2
with a line: pass it on, and no other stderr of town's.

## 9. A full example

    name: town/memory
    version: 0.1.0
    summary: Short notes, kept by key.
    guidance: |
      Keys are paths, like \`notes/lunch\`, and a prefix such as \`notes/\`
      gathers the keys under it. A value is one line; a longer one comes on
      stdin.
    runtime: worker
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

Its main.mjs exports main, which reads process.argv.slice(2), keeps a
file per key under TOWN_STATE, writes the value to stdout for recall, and
exits 1 with a line on stderr, naming no key, when a key has no value.
`;

/** The numbered sections the spec holds, e.g. [1, 2, ..., 9]. */
export function specSections(): number[] {
  return [...SPEC.matchAll(/^## (\d+)\. /gm)].map((m) => Number(m[1]));
}
