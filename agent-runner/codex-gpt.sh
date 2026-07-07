#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: codex-gpt.sh <prompt>" >&2
  exit 64
fi

prompt="$1"
shift || true
if [[ $# -gt 0 ]]; then
  prompt="$prompt $*"
fi

sandbox="workspace-write"
case "$prompt" in
  *"You are the QA"*|*"read-only"*|*"READ-ONLY"*)
    sandbox="read-only"
    ;;
esac

last_message="$(mktemp -t codex-gpt-last.XXXXXX)"
log_file="$(mktemp -t codex-gpt-log.XXXXXX)"
cleanup() {
  rm -f "$last_message" "$log_file"
}
trap cleanup EXIT

if codex -a never exec \
  --sandbox "$sandbox" \
  --color never \
  --ephemeral \
  --output-last-message "$last_message" \
  "$prompt" >"$log_file" 2>&1; then
  if [[ -s "$last_message" ]]; then
    cat "$last_message"
  else
    echo "Codex completed without writing a final message; recent log follows:" >&2
    tail -n 120 "$log_file" >&2 || true
    exit 70
  fi
else
  status=$?
  echo "Codex runner failed (sandbox=$sandbox, exit=$status); recent log follows:" >&2
  tail -n 120 "$log_file" >&2 || true
  exit "$status"
fi
