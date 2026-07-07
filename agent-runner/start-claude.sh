#!/usr/bin/env bash
# Start the Claude runner. Double-click or run: ./agent-runner/start-claude.sh
cd "$(dirname "$0")/.."
echo "Starting Claude runner… (Ctrl-C to stop)"
AGENT=claude AGENT_CMD='claude -p' node agent-runner/runner.mjs
