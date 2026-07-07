#!/usr/bin/env bash
# Start the GPT runner. Override GPT_CMD only if testing a different headless CLI.
set -euo pipefail

cd "$(dirname "$0")/.."
echo "Starting GPT runner... (Ctrl-C to stop)"
AGENT=gpt AGENT_CMD="${GPT_CMD:-/Users/matthewlobel/projects/edcetera-pm/agent-runner/codex-gpt.sh}" node agent-runner/runner.mjs
