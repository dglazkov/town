#!/usr/bin/env bash
# conduct/brief.sh <project> <N> [--any]: the brief for a phase, mechanically.
# Reads docs/projects/<project>/{phases,journey,design}.md and AGENTS.md by the
# conventions status.sh reads them by, and prints to stdout, in order: a first
# line naming the project, the phase, the date, and the commit; the phase's ⚑
# steps, or none; its section verbatim; every journey its **Closes:** names,
# whole; design.md's names table and a map of its headings as `sed -n` lines;
# every finding of every earlier phase, then the Open roster; AGENTS.md and the
# project's own rules verbatim; the paths the phase names; and the tail, which
# lives here and nowhere else. When the phase's **Proof:** paragraph holds
# `pnpm hermetic`, a `## The ring` section follows the phase's, carrying the
# conduct skill's §2 sentence on a Proof that names a walk over the box, which
# lives here too and which test/baton.test.ts reads in both. The conductor
# redirects it and edits it after.
# A <project> holding a "/" is the project's directory itself, which is how the
# test points it at a fixture; AGENTS.md is always this checkout's.
# Exit 2: no such project, file, or phase. Exit 1: the phase's status is not
# NOT STARTED (without --any), a journey it names is not in journey.md, or a
# doc breaks a convention the brief reads by. Nothing reaches stdout then.
# Changes nothing.
set -u
export LC_ALL=C
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
USAGE="usage: brief.sh <project> <phase> [--any]"
NL='
'

P=; N=; ANY=0
for a in "$@"; do
  case $a in
    --any) ANY=1 ;;
    *) if [ -z "$P" ]; then P=$a; elif [ -z "$N" ]; then N=$a; else echo "$USAGE" >&2; exit 2; fi ;;
  esac
done
[ -n "$P" ] && [ -n "$N" ] || { echo "$USAGE" >&2; exit 2; }
case $N in *[!0-9]*) echo "not a phase number: $N ($USAGE)" >&2; exit 2 ;; esac
case $P in
  */*) D=$(cd "$P" 2>/dev/null && pwd) || { echo "no such project directory: $P" >&2; exit 2; }; NAME=$(basename "$D") ;;
  *) D=$ROOT/docs/projects/$P; NAME=$P ;;
esac
PH=$D/phases.md; J=$D/journey.md; DE=$D/design.md; AG=$ROOT/AGENTS.md
for f in "$PH" "$J" "$DE" "$AG"; do [ -f "$f" ] || { echo "no such file: $f" >&2; exit 2; }; done
rel() { case $1 in "$ROOT"/*) printf '%s' "${1#"$ROOT"/}" ;; *) printf '%s' "$1" ;; esac; }
fail() { echo "$NAME phase $N: $1" >&2; exit 1; }

# section <file> <heading prefix>: from the heading to the next "## " outside a
# fence, verbatim, with trailing blank lines and a trailing --- rule dropped
section() {
  awk -v h="$2" '
    function flush() { for (i = 1; i <= nb; i++) print buf[i]; nb = 0 }
    !on { if (index($0, h) == 1) { on = 1; print } ; next }
    /^```/ { fence = !fence }
    !fence && /^## / { exit }
    /^[ \t]*$/ || /^---[ \t]*$/ { buf[++nb] = $0; next }
    { flush(); print }
  ' "$1"
}

# The phase, and the refusals, all before a byte is printed.
PHASE=$(section "$PH" "## Phase $N:")
[ -n "$PHASE" ] || { echo "no phase $N in $PH" >&2; exit 2; }
TITLE=$(printf '%s\n' "$PHASE" | sed -n '1s/^## Phase [0-9]*: *//p')
STATUS=$(printf '%s\n' "$PHASE" | awk '/^\*\*Status: / { s = $0; sub(/^\*\*Status: /, "", s); sub(/[.*].*$/, "", s); print s; exit }')
[ -n "$STATUS" ] || fail "no **Status:** line in $PH"
if [ "$STATUS" != "NOT STARTED" ] && [ "$ANY" = 0 ]; then
  echo "$STATUS: $NAME phase $N is $STATUS in $PH; --any writes the brief anyway" >&2
  exit 1
fi

# The journeys: every `journey <N>` in the **Closes:** paragraph, lines joined,
# deduplicated, in order of first mention.
CLOSES=$(printf '%s\n' "$PHASE" | awk '/^\*\*Closes:\*\*/ { on = 1 } on && /^[ \t]*$/ { exit } on { printf "%s ", $0 }')
[ -n "$CLOSES" ] || fail "no **Closes:** paragraph in $PH"
JNUMS=$(printf '%s\n' "$CLOSES" | awk '{
  s = $0
  while (match(s, /[Jj]ourney +[0-9]+/)) {
    m = substr(s, RSTART, RLENGTH); sub(/^[Jj]ourney +/, "", m)
    if (!(m in seen)) { seen[m] = 1; printf "%s ", m }
    s = substr(s, RSTART + RLENGTH)
  }
}')
JOURNEYS=
for j in $JNUMS; do
  s=$(section "$J" "## Journey $j:")
  [ -n "$s" ] || fail "closes journey $j, and $J has no \"## Journey $j:\""
  if [ -z "$JOURNEYS" ]; then JOURNEYS=$s; else JOURNEYS=$JOURNEYS$NL$NL$s; fi
done
[ -n "$JOURNEYS" ] || JOURNEYS="none: the **Closes:** paragraph names no journey"

# The ring: when the **Proof:** paragraph, lines joined, holds `pnpm hermetic`,
# the conduct skill's §2 sentence on a walk over the box, as it stands there.
PROOF=$(printf '%s\n' "$PHASE" | awk '/^\*\*Proof:\*\*/ { on = 1 } on && /^[ \t]*$/ { exit } on { printf "%s ", $0 }' | tr -s ' \t' '  ')
RING=
case $PROOF in
  *"pnpm hermetic"*) RING="## The ring

The phase's Proof names \`pnpm hermetic\`, so the conduct skill's §2 binds it:

A Proof that names a walk over the box writes the ring's line,
\`pnpm hermetic --ring agent --sheep <dir> --repo <owner/name> --issue <n>\`,
with the github token on its stdin; the conductor types it, never the
builder, since the ring pitches a tent on the account and spends money,
and the findings record the ring's exit and the stage's report.

" ;;
esac

# The design's names table, whole, and every heading with its line range: to
# the line before the next heading of its level or higher, fences skipped.
NAMES=$(section "$DE" "## The names" | awk '/^\|/ { on = 1; print; next } on { exit }')
[ -n "$NAMES" ] || fail "$DE has no \"## The names\" table"
MAP=$(awk -v path="$DE" -v q="'" '
  /^[ \t]*```/ { fence = !fence; next }
  fence { next }
  /^#+ / { n++; at[n] = NR; lv = 0; while (substr($0, lv + 1, 1) == "#") lv++; level[n] = lv; text[n] = $0 }
  END {
    for (i = 1; i <= n; i++) {
      e = NR
      for (k = i + 1; k <= n; k++) if (level[k] <= level[i]) { e = at[k] - 1; break }
      printf "sed -n %s%d,%dp%s %s  # %s\n", q, at[i], e, q, path, text[i]
    }
  }
' "$DE")

# The findings of every phase before this one, verbatim, under the phase's
# name; then every Open in phases.md.
FINDINGS=$(awk -v stop="## Phase $N:" -v name="$NAME" '
  function emit(s) { if (out++) print ""; printf "%s", s }
  function flush() { if (f) { emit(buf); f = 0; buf = "" } }
  index($0, stop) == 1 { flush(); exit }
  /^## / { flush(); inF = 0; title = $0; sub(/^## Phase /, name " phase ", title); sub(/^## /, "", title); head = 0; next }
  /^\*\*Findings:\*\*/ { flush(); inF = 1; next }
  /^\*\*Formerly:/ { flush(); inF = 0; next }
  inF && /^- \*\*20[0-9][0-9]-/ {
    flush()
    if (!head) { emit("### " title "\n"); head = 1 }
    f = 1; buf = $0 "\n"; next
  }
  inF && f && /^  / { buf = buf $0 "\n"; next }
  inF && f { flush() }
' "$PH")
[ -n "$FINDINGS" ] || FINDINGS="none: no phase before $NAME phase $N has a finding"
OPENS=$(awk '
  function flush() { if (f) { if (out++) print ""; printf "%s", buf; f = 0; buf = "" } }
  /^- \*\*20[0-9][0-9]-[0-9][0-9]-[0-9][0-9] / && index($0, " — Open") { flush(); f = 1; buf = $0 "\n"; next }
  f && /^  / { buf = buf $0 "\n"; next }
  { flush() }
  END { flush() }
' "$PH")
[ -n "$OPENS" ] || OPENS="none"

# The ⚑ steps: every paragraph of the phase's section that holds one.
FLAGS=$(printf '%s\n' "$PHASE" | awk '
  function end() { if (hit) { if (out++) print ""; printf "%s", para } ; para = ""; hit = 0 }
  /^[ \t]*$/ { end(); next }
  { para = para $0 "\n"; if (index($0, "⚑")) hit = 1 }
  END { end() }
')
[ -n "$FLAGS" ] || FLAGS="none"

# The project's own rules: phases.md to its first --- rule.
RULES=$(awk '/^---[ \t]*$/ { exit } { print }' "$PH")

# What you own: every path under the seven roots the section names inside
# backticks, deduplicated, in order of first mention.
OWNED=$(printf '%s\n' "$PHASE" | awk '
  { text = text $0 " " }
  END {
    n = split(text, parts, "`")
    for (i = 2; i <= n; i += 2) {
      k = split(parts[i], words, /[ \t]+/)
      for (t = 1; t <= k; t++) {
        w = words[t]
        if (w !~ /^(src|test|scripts|shops|bin|\.claude|docs\/drafts)\//) continue
        match(w, /^[A-Za-z0-9_.*\/@+-]+/); w = substr(w, 1, RLENGTH); sub(/\.+$/, "", w)
        if (!(w in seen)) { seen[w] = 1; print "- `" w "`" }
      }
    }
  }
')
[ -n "$OWNED" ] || OWNED="- none: the phase names no path under src/, test/, scripts/, shops/, bin/, .claude/, or docs/drafts/"

SHA=$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null) || fail "git rev-parse --short HEAD failed in $ROOT"
DATE=$(date +%Y-%m-%d)

cat <<EOF
# $NAME phase $N: $TITLE — briefed $DATE at $SHA

## Asked before the phase starts

The ⚑ steps of this phase, asked out loud with the price before it starts:

$FLAGS

## The phase ($(rel "$PH"), verbatim)

$PHASE

${RING}## The journeys it closes ($(rel "$J"), verbatim)

$JOURNEYS

## The mechanism ($(rel "$DE"))

The names, verbatim:

$NAMES

Every heading, to read by path:

\`\`\`
$MAP
\`\`\`

## Findings so far that bind you

Every finding of every earlier phase, verbatim:

$FINDINGS

The Open roster, every Open in $(rel "$PH"):

$OPENS

## House rules

$(cat "$AG")

The project's own rules ($(rel "$PH"), verbatim):

$RULES

## What you own

$OWNED

EOF
# The tail, verbatim from the conduct skill's §1 as it stood at 5a69c92; the
# skill points here and quotes it no longer, and test/baton.test.ts pins it.
cat <<'TAIL'
Nothing under docs/projects/: the
conductor writes the record. Nothing under vendor/ or any vendored
dependency unless the phase says that is the work. No other project's
code.

## Where you stop
- At each ⚑ step without a yes above: build up to it, report.
- When the proof would need a facade: something that passes the named
  test but is not the thing (a fixture that cannot fail, a shim that
  answers the test's question and no other). Stop and say so; that is a
  finding, not a failure.
- When the design turns out wrong: stop, say what you found and what
  you would change. The conductor changes the design, not you.

## What you return
1. What was built: files, and one paragraph of how it works.
2. The proof, as exact commands from the repo root, with the output you
   saw, exit codes included. Not "tests pass": the command and the line
   that says so.
3. What you could not do and why, and where you stopped.
4. Candidate findings: dated one-liners, one claim each, about forty
   words. The conductor keeps, rewrites, or drops them.
5. Anything a later phase should know that the docs do not say.
TAIL
