#!/bin/sh
# PreToolUse hook (F16) — auto-approve a SINGLE clean build/test/lint/install command,
# optionally followed by a HARMLESS read-only tail (| tail/head/grep ; echo ; ls).
# Independent second hook; does NOT touch auto-approve.sh. Layered:
#   (0) flag gate     — nothing unless ~/.claude/auto-approve-build.enabled exists
#   (1) hard deny     — redirect/subshell/chaining/destructive verbs → defer (never allow)
#   (2) allow-list    — segment 1 = whitelisted main verb; later segments = harmless only
#   (3) audit log     — every allow appended to ~/.claude/auto-approve.log
# Print nothing + exit 0 = defer (fall through to normal prompt). deny>allow>defer compose.

input=$(cat)
[ -f "$HOME/.claude/auto-approve-build.enabled" ] || exit 0

tool=$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null)
[ "$tool" = "Bash" ] || exit 0
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)
[ -z "$cmd" ] && exit 0

# (1) hard deny veto: redirects, subshell, chaining, background (& and &&), destructive verbs.
# NOTE: a lone `&` MUST be denied — `tr` below only splits on | and ; , so `cmd & evil`
# would otherwise stay one segment and pass the is_main start-anchored check.
deny='>>|[>`&]|\$\(|\|\||(^|[^[:alnum:]_])(rm|rmdir|mv|cp|sudo|chmod|chown|kill|taskkill|dd|mkfs|del|format|truncate|tee|ln)([^[:alnum:]_]|$)'
if printf '%s' "$cmd" | grep -Eq "$deny"; then exit 0; fi

# main verb whitelist (segment 1 must match one of these patterns from its start)
is_main() {
  printf '%s' "$1" | grep -Eq '^[[:space:]]*(mvn([[:space:]]+-[^[:space:]]+)*[[:space:]]+(compile|test-compile|verify|test)([[:space:]]|$)|(gradle|\./gradlew)[[:space:]]+(build|assemble|test)|tsc([[:space:]]+--noEmit)?([[:space:]]|$)|(npm|pnpm|yarn)[[:space:]]+(run[[:space:]]+build|test|install|ci)([[:space:]]|$)|yarn([[:space:]]|$)|vite[[:space:]]+build|go[[:space:]]+(build|vet|test|get)([[:space:]]|$)|go[[:space:]]+mod[[:space:]]+(download|tidy)|cargo[[:space:]]+(build|check|test|fetch)([[:space:]]|$)|make([[:space:]]|$)|dotnet[[:space:]]+(build|test|restore)|(jest|vitest|mocha|playwright|cypress|pytest|mypy)([[:space:]]|$)|(python|python3)[[:space:]]+-m[[:space:]]+pytest|eslint([[:space:]]|$)|prettier[[:space:]]+--check|ruff[[:space:]]+check|gofmt[[:space:]]+-l|(pip|pip3)[[:space:]]+install|poetry[[:space:]]+install|pipenv[[:space:]]+install|uv[[:space:]]+pip[[:space:]]+install|bundle[[:space:]]+install|composer[[:space:]]+install)'
}

# split on | and ; (the only combinators left after hard-deny); validate each segment.
segs=$(printf '%s' "$cmd" | tr '|;' '\n\n')
i=0; ok=1
while IFS= read -r seg; do
  seg=$(printf '%s' "$seg" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
  [ -z "$seg" ] && continue
  i=$((i+1))
  if [ "$i" -eq 1 ]; then
    is_main "$seg" || { ok=0; break; }
  else
    first=$(printf '%s' "$seg" | awk '{print $1}')
    case "$first" in
      tail|head|grep|echo|ls|cat|wc) : ;;
      *) ok=0; break ;;
    esac
  fi
done <<EOF
$segs
EOF

[ "$ok" -eq 1 ] || exit 0

ts=$(date '+%Y-%m-%d %H:%M:%S' 2>/dev/null)
sid=$(printf '%s' "$input" | jq -r '.session_id // ""' 2>/dev/null)
printf '%s\tsid=%s\tBash(build)\t%s\n' "$ts" "$sid" "$cmd" >> "$HOME/.claude/auto-approve.log" 2>/dev/null
printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"auto-build: single cmd + harmless tail"}}\n'
exit 0
