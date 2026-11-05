#!/usr/bin/env bash
# Scheduled publishing, push side: judge the build job's flip patch and refuse it unless it is nothing but
# `draft: true` -> `draft: false` lines in existing content pages. Prints the commit message
# (`publish: blog/a, use-cases/b`) on success.
#
#   check-flip-patch.sh [--rebased] <patch file> <page list file>
#
# The page list is the build job's own list of the pages it flipped (publish-due.mjs --pages-file): one
# `apps/web/content/<blog|use-cases>/<slug>.md` per line, sorted bytewise, unique, nothing else. The files
# the patch changes must be exactly those pages.
#
# Without --rebased: the patch is applied to the index of the current checkout (the push job commits it).
# The patch itself is judged BEFORE anything is written: its size, the files it names (only
# apps/web/content/<blog|use-cases>/<slug>.md), no create/delete/rename/mode change, one changed line per
# file, and that it applies (git apply --check). Only then does `git apply --index` run, and the checks on
# the result follow (each changed line is the draft line, inside the front matter, of a due page, and the
# pages are the ones the build reported).
#
# With --rebased: HEAD is the flip commit after a retried push's rebase, and the patch is
# that commit's plain diff (`git diff HEAD~1 HEAD`, with `--src-prefix=a/ --dst-prefix=b/`; not a
# format-patch mail, whose header lines are not diff grammar). The same checks run against HEAD~1 (the fetched main, with whatever
# main changed meanwhile: a `published` day moved into the future refuses the flip) on a throwaway index,
# so the working tree, the real index and HEAD stay untouched. HEAD must have exactly one parent, and its
# tree must be exactly HEAD~1 plus that patch.
#
# Runs in the repo root of a clean checkout, in the publish workflow's push job, which holds the deploy
# key: it uses git and coreutils only (no node, no pnpm), and every git command runs with hooks off.
# apps/web/scripts/check-flip-patch.test.mjs covers it.
set -euo pipefail

rebased=
if [ "${1:-}" = "--rebased" ]; then
  rebased=1
  shift
fi
patch=${1:?usage: check-flip-patch.sh [--rebased] <patch> <page list>}
pages=${2:?usage: check-flip-patch.sh [--rebased] <patch> <page list>}
# Today in UTC; FLIP_TODAY only for the tests (the workflow never sets it).
today=${FLIP_TODAY:-$(date -u +%F)}
g() { git -c core.hooksPath=/dev/null "$@"; }
fail() { echo "check-flip-patch: $1" >&2; exit 1; }
page_path='^apps/web/content/(blog|use-cases)/[a-z0-9]+(-[a-z0-9]+)*\.md$'

# 0. The page list: present, not empty, only page paths (a blank line is not one), sorted and unique.
[ -f "$pages" ] && [ -s "$pages" ] || fail "the page list is missing or empty"
if grep -v -E "$page_path" "$pages" >&2; then
  fail "the page list holds lines that are not apps/web/content/<blog|use-cases>/<slug>.md paths (listed above)"
fi
LC_ALL=C sort -u -c "$pages" 2>/dev/null || fail "the page list is not sorted and unique"
listed=$(cat "$pages")

# 1. The patch itself, before any file or index is written.
[ "$(wc -c < "$patch")" -lt 65536 ] || fail "the patch is too large to be a flip"
# No NUL byte (awk and the shell below read the patch as text), and every line fits the unified-diff grammar of
# a `git diff`: file headers (`diff --git a/P b/P`, the extended mode/rename/index lines, `---`, `+++`), `@@`
# hunk headers, then exactly the number of ` `, `-` and `+` lines the header states, and `\ No newline at end of
# file` right after a hunk line. Anything else, a stray or blank line included, is refused, and so is a second
# hunk for one file. (Whether a file may be touched at all is judged below, from what git reads out of the patch.)
[ "$(LC_ALL=C tr -d '\000' < "$patch" | wc -c)" -eq "$(wc -c < "$patch")" ] || fail "the patch contains a NUL byte"
# Plain POSIX awk (GitHub's runners use mawk): no intervals, no gensub.
if ! grammar=$(LC_ALL=C awk '
  function bad(why) { printf "line %d: %s\n", NR, why; failed = 1; exit 1 }
  {
    if ($0 == "\\ No newline at end of file") {
      if (!prev) bad("a no-newline marker that follows no hunk line")
      prev = 0
      next
    }
    if (nold > 0 || nnew > 0) {
      c = substr($0, 1, 1)
      if (c == " ") { nold--; nnew-- }
      else if (c == "-") { nold-- }
      else if (c == "+") { nnew-- }
      else bad("a line inside a hunk that is not a context, removed or added line")
      if (nold < 0 || nnew < 0) bad("more lines in the hunk than its header states")
      prev = 1
      next
    }
    prev = 0
    if ($0 ~ /^diff --git a\/[^ ]+ b\/[^ ]+$/) { stage = 1; hunks = 0; next }
    if (stage == 1 && $0 ~ /^(old mode|new mode|new file mode|deleted file mode|similarity index|dissimilarity index|rename from|rename to|copy from|copy to) /) next
    if (stage == 1 && $0 ~ /^index [0-9a-f]+\.\.[0-9a-f]+( [0-7]+)?$/) next
    if (stage == 1 && $0 ~ /^--- /) { stage = 2; next }
    if (stage == 2 && $0 ~ /^\+\+\+ /) { stage = 3; next }
    if (stage == 3 && $0 ~ /^@@ -[0-9]+(,[0-9]+)? \+[0-9]+(,[0-9]+)? @@( .*)?$/) {
      hunks++
      if (hunks > 1) bad("more than one hunk for a file")
      h = $0
      sub(/^@@ -/, "", h)
      split(h, part, " ")
      split(part[1], o, ",")
      nold = (o[2] == "") ? 1 : o[2] + 0
      sub(/^\+/, "", part[2])
      split(part[2], n, ",")
      nnew = (n[2] == "") ? 1 : n[2] + 0
      next
    }
    bad("a line that is not part of a unified diff")
  }
  END {
    if (failed) exit 1
    if (nold > 0 || nnew > 0) { print "the last hunk is shorter than its header states"; exit 1 }
  }' "$patch"); then
  printf 'check-flip-patch: %s\n' "$grammar" >&2
  fail "the patch does not fit the unified-diff grammar"
fi
# `git apply --numstat` only reads the patch: `<added> TAB <removed> TAB <path>` per file. A quoted,
# renamed or binary entry can't match the page path or the one-line pattern below.
numstat=$(g apply --numstat "$patch" 2>/dev/null) && [ -n "$numstat" ] || fail "the patch changes nothing or is not a readable patch"
if printf '%s\n' "$numstat" | cut -f3- | grep -v -E "$page_path" >&2; then
  fail "the patch touches files other than apps/web/content/<blog|use-cases>/<slug>.md (listed above)"
fi
[ -z "$(g apply --summary "$patch")" ] || fail "the patch creates, deletes, renames or changes the mode of a file"
[ "$(printf '%s\n' "$numstat" | awk -F'\t' '$1 != 1 || $2 != 1 { n++ } END { print n + 0 }')" = 0 ] ||
  fail "every file must change exactly one line"

if [ -n "$rebased" ]; then
  # The base is HEAD~1. A throwaway index holds base + patch; the work tree and the real index stay as they are.
  base=$(g rev-parse --verify -q 'HEAD~1^{commit}') || fail "HEAD has no parent commit"
  [ "$(g rev-list --parents -n 1 HEAD | wc -w | tr -d ' ')" = 2 ] || fail "HEAD must be exactly one commit on top of its base"
  idxdir=$(mktemp -d)
  trap 'rm -rf "$idxdir"' EXIT
  export GIT_INDEX_FILE=$idxdir/index
  g read-tree "$base"
  apply_to=(--cached)
else
  base=HEAD
  apply_to=(--index)
fi

g apply --check "${apply_to[@]}" "$patch" >&2 || fail "the patch does not apply to this commit"
g apply "${apply_to[@]}" "$patch" >&2 || fail "the patch does not apply to this commit"

# 2. The result of the apply (the staged tree), against the base. Everything below re-checks the same
# facts on what git actually wrote.
files=$(g diff --cached --name-only "$base")
[ -n "$files" ] || fail "the patch changes nothing"
if printf '%s\n' "$files" | grep -v -E "$page_path" >&2; then
  fail "the patch touches files other than apps/web/content/<blog|use-cases>/<slug>.md (listed above)"
fi
[ -z "$(g diff --cached --summary "$base")" ] || fail "the patch creates, deletes, renames or changes the mode of a file"

count=$(printf '%s\n' "$files" | wc -l | tr -d ' ')
one_line=$(g diff --cached --numstat "$base" | grep -c -E '^1[[:space:]]+1[[:space:]]' || true)
[ "$one_line" = "$count" ] || fail "every file must change exactly one line"

# The changed lines only (file and hunk headers left out).
changes=$(g diff --cached -U0 --no-color "$base" | awk '/^diff --git/{h=1; next} /^@@/{h=0; next} !h{print}')
removed=$(printf '%s\n' "$changes" | grep '^-' || true)
added=$(printf '%s\n' "$changes" | grep '^+' || true)
other=$(printf '%s\n' "$changes" | grep -v -E '^[-+]' || true)
[ -z "$other" ] || fail "the patch has lines that are neither removed nor added"
drafts=$(printf '%s\n' "$removed" | grep -c -E '^-draft:[[:space:]]*true([[:space:]]*#.*)?[[:space:]]*$' || true)
[ "$drafts" = "$count" ] || fail "the patch changes something other than a draft: true line"
# Each added line is its removed line with true turned to false, nothing else.
[ "$(printf '%s\n' "$removed" | sed -E 's/^-(draft:[[:space:]]*)true/+\1false/')" = "$added" ] ||
  fail "the added lines are not the removed draft lines turned to draft: false"

# Each flipped line is the page's own `draft:` line, inside its front matter (not a `draft: true` in the
# body, a code sample say), and the page is due: its `published` day (UTC) is today or earlier.
# Every reader below consumes its whole input (no early `exit`, `q` or `head`): under pipefail, a reader
# that quits early kills `git show` with SIGPIPE on a page larger than the pipe buffer.
while IFS= read -r f; do
  changed=$(g diff --cached -U0 --no-color "$base" -- "$f" | awk '!n && match($0, /^@@ -[0-9]+/) { n = substr($0, 5, RLENGTH - 4) } END { print n }')
  # Plain POSIX awk (GitHub's runners use mawk): no character classes, no escapes beyond \t and \r.
  front_end=$(g show "$base:$f" | awk 'NR == 1 && $0 !~ /^---[ \t\r]*$/ { bad = 1 } NR > 1 && !bad && !end && /^---[ \t\r]*$/ { end = NR } END { if (end) print end }')
  [ -n "$front_end" ] || fail "$f has no front matter"
  [ -n "$changed" ] && [ "$changed" -gt 1 ] && [ "$changed" -lt "$front_end" ] ||
    fail "$f: the flipped line ($changed) is outside the front matter (lines 2-$((front_end - 1)))"
  published=$(g show "$base:$f" | awk -v end="$front_end" -v q="'" '
    NR > 1 && NR < end && !p && /^published:/ {
      s = $0; sub(/^published:[ \t]*/, "", s); gsub(/"/, "", s); gsub(q, "", s); s = substr(s, 1, 10)
      if (s ~ /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]$/) p = s
    }
    END { print p }')
  [ -n "$published" ] || fail "$f has no published day"
  [[ ! "$published" > "$today" ]] || fail "$f isn't due: published $published is after today, $today (UTC)"
done <<<"$files"

# The staged pages must be exactly the pages in the build job's page list, and the commit message names them.
slugs_of() { sed -E 's#^apps/web/content/([a-z-]+/[a-z0-9-]+)\.md$#\1#' | paste -sd, - | sed 's/,/, /g'; }
derived=$(printf '%s\n' "$files" | LC_ALL=C sort | slugs_of)
[ "$(printf '%s\n' "$files" | LC_ALL=C sort)" = "$listed" ] ||
  fail "the pages in the patch ($derived) are not the pages in the page list ($(printf '%s\n' "$listed" | slugs_of))"

# The rebased commit is exactly the base plus the checked patch, nothing more.
if [ -n "$rebased" ]; then
  [ "$(g write-tree)" = "$(g rev-parse 'HEAD^{tree}')" ] || fail "the rebased commit holds more than the checked patch"
fi

echo "publish: $derived"
