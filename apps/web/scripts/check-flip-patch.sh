#!/usr/bin/env bash
# Scheduled publishing, push side: apply the build job's flip patch to the index and refuse it unless it
# is nothing but `draft: true` -> `draft: false` lines in existing content pages. Prints the commit
# message (`publish: blog/a, use-cases/b`) on success.
#
#   check-flip-patch.sh <patch file> "<slugs the build job reported, comma and space separated>"
#
# Runs in the repo root of a clean checkout, in the publish workflow's push job, which holds the deploy
# key: it uses git and coreutils only (no node, no pnpm), and every git command runs with hooks off.
# apps/web/scripts/check-flip-patch.test.mjs covers it.
set -euo pipefail

patch=${1:?usage: check-flip-patch.sh <patch> <slugs>}
slugs=${2:?usage: check-flip-patch.sh <patch> <slugs>}
# Today in UTC; FLIP_TODAY only for the tests (the workflow never sets it).
today=${FLIP_TODAY:-$(date -u +%F)}
g() { git -c core.hooksPath=/dev/null "$@"; }
fail() { echo "check-flip-patch: $1" >&2; exit 1; }

[ "$(wc -c < "$patch")" -lt 65536 ] || fail "the patch is too large to be a flip"
g apply --index "$patch" >&2 || fail "the patch does not apply to this commit"

files=$(g diff --cached --name-only)
[ -n "$files" ] || fail "the patch changes nothing"
if printf '%s\n' "$files" | grep -v -E '^apps/web/content/(blog|use-cases)/[a-z0-9]+(-[a-z0-9]+)*\.md$' >&2; then
  fail "the patch touches files other than apps/web/content/<blog|use-cases>/<slug>.md (listed above)"
fi
[ -z "$(g diff --cached --summary)" ] || fail "the patch creates, deletes, renames or changes the mode of a file"

count=$(printf '%s\n' "$files" | wc -l | tr -d ' ')
one_line=$(g diff --cached --numstat | grep -c -E '^1[[:space:]]+1[[:space:]]' || true)
[ "$one_line" = "$count" ] || fail "every file must change exactly one line"

# The changed lines only (file and hunk headers left out).
changes=$(g diff --cached -U0 --no-color | awk '/^diff --git/{h=1; next} /^@@/{h=0; next} !h{print}')
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
  changed=$(g diff --cached -U0 --no-color -- "$f" | awk '!n && match($0, /^@@ -[0-9]+/) { n = substr($0, 5, RLENGTH - 4) } END { print n }')
  # Plain POSIX awk (GitHub's runners use mawk): no character classes, no escapes beyond \t and \r.
  front_end=$(g show "HEAD:$f" | awk 'NR == 1 && $0 !~ /^---[ \t\r]*$/ { bad = 1 } NR > 1 && !bad && !end && /^---[ \t\r]*$/ { end = NR } END { if (end) print end }')
  [ -n "$front_end" ] || fail "$f has no front matter"
  [ -n "$changed" ] && [ "$changed" -gt 1 ] && [ "$changed" -lt "$front_end" ] ||
    fail "$f: the flipped line ($changed) is outside the front matter (lines 2-$((front_end - 1)))"
  published=$(g show "HEAD:$f" | awk -v end="$front_end" -v q="'" '
    NR > 1 && NR < end && !p && /^published:/ {
      s = $0; sub(/^published:[ \t]*/, "", s); gsub(/"/, "", s); gsub(q, "", s); s = substr(s, 1, 10)
      if (s ~ /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]$/) p = s
    }
    END { print p }')
  [ -n "$published" ] || fail "$f has no published day"
  [[ ! "$published" > "$today" ]] || fail "$f isn't due: published $published is after today, $today (UTC)"
done <<<"$files"

# The commit message names exactly the staged pages, and they must be the pages the build reported.
derived=$(printf '%s\n' "$files" | sed -E 's#^apps/web/content/([a-z-]+/[a-z0-9-]+)\.md$#\1#' | paste -sd, - | sed 's/,/, /g')
[ "$derived" = "$slugs" ] || fail "the pages in the patch ($derived) are not the pages the build job reported ($slugs)"

echo "publish: $derived"
