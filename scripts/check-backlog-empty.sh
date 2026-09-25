#!/usr/bin/env bash
# Plan 3 exit criterion 3: tasks/todo.md carries no open item.
#
# The version drafted in the plan counted "- [ ]" only inside "### D-<n>." /
# "### B-<n>." / "### Owner decision" sections — 22 items. The file actually held
# 64 open rows, so 44 of them sat outside the gate's view and it would have
# reported a cheerful zero over a live security finding and the public-git-history
# item. This version counts every open row in the file.
#
# Three measurement traps this script exists to survive:
#   1. OCCURRENCES, NOT LINES. Some rows pack several checkboxes onto one physical
#      line, so a line-based `grep -c` under-reports (62 where the truth was 64).
#   2. "- [~]" is neither done nor open to a naive grep, but it is NOT complete.
#      It counts as unresolved.
#   3. B-1..B-5 carried their status in heading prose with NO checkbox at all, so a
#      checkbox-only gate is structurally blind to them. Each must declare a state.
#
# The SECTIONS floor guards the whole thing: if the headings are ever renamed the
# awk below matches nothing and reports zero. A gate that cannot fail is not a
# gate, so a section count under the floor is exit 2, not exit 0.
set -uo pipefail

F=${1:-tasks/todo.md}
FLOOR=${BACKLOG_SECTION_FLOOR:-10}
rc=0

test -f "$F" || { echo "MISSING $F"; exit 2; }

# --- structural guard -------------------------------------------------------
sections=$(awk '/^### (D|B)-[0-9]+\./ {n++} /^### Owner decision/ {n++} END {print n+0}' "$F")
printf 'SECTIONS %s\n' "$sections"
if [ "$sections" -lt "$FLOOR" ]; then
  echo "SCOPE BROKEN: expected at least $FLOOR D-/B-/Owner-decision sections, found $sections"
  echo "The headings were renamed or the file was restructured — fix this script before trusting it."
  exit 2
fi

# --- open items, counted as occurrences -------------------------------------
open_todo=$(grep -o -- '- \[ \]' "$F" | wc -l | tr -d ' ')
open_tilde=$(grep -o -- '- \[~\]' "$F" | wc -l | tr -d ' ')
printf 'OPEN_ITEMS %s\n' "$open_todo"
printf 'UNRESOLVED_TILDE %s\n' "$open_tilde"

if [ "$open_todo" -ne 0 ]; then
  echo "OPEN: $open_todo unchecked item(s) remain. Each must be closed with a reason,"
  echo "      escalated into docs/superpowers/ESCALATIONS.md, or carried to Plan 4."
  grep -n -- '- \[ \]' "$F" | head -20
  rc=1
fi
if [ "$open_tilde" -ne 0 ]; then
  echo "UNRESOLVED: $open_tilde '- [~]' row(s) are neither done nor open — resolve explicitly."
  grep -n -- '- \[~\]' "$F"
  rc=1
fi

# --- every B-item must declare a state (they have no checkboxes) ------------
for n in 1 2 3 4 5; do
  head=$(grep -m1 -E "^### B-${n}\." "$F" || true)
  if [ -z "$head" ]; then
    echo "SCOPE BROKEN: no '### B-${n}.' heading found — renumbered or removed"
    rc=2
    continue
  fi
  # A state is an explicit disposition glyph/word in the heading itself.
  if ! printf '%s' "$head" | grep -qE '✅|CLOSED|DONE|ESCALATED|→ Plan 4|CARRIED'; then
    echo "B-${n} declares no disposition in its heading: ${head:0:90}"
    rc=1
  fi
done

# --- the register must exist and every row must name an owner --------------
REG=docs/superpowers/ESCALATIONS.md
if [ ! -f "$REG" ]; then
  echo "MISSING $REG — Plan 3 exit criterion 7 requires the single register"
  rc=1
else
  rows=$(grep -cE '^\| *[0-9]+ *\|' "$REG" || true)
  ownerless=$(awk -F'|' '/^\| *[0-9]+ *\|/ && $4 ~ /^[[:space:]]*$/ {n++} END {print n+0}' "$REG")
  printf 'ESCALATIONS_ROWS %s\n' "$rows"
  if [ "$rows" -eq 0 ]; then echo "REGISTER EMPTY: $REG has no numbered rows"; rc=1; fi
  if [ "$ownerless" -ne 0 ]; then
    echo "OWNERLESS: $ownerless register row(s) have a blank owner column"
    rc=1
  fi
fi

[ "$rc" -eq 0 ] && echo "BACKLOG CLEAR"
exit "$rc"
