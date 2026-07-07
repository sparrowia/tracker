#!/usr/bin/env bash
# Start the GPT runner. Set AGENT_CMD to your GPT/codex headless CLI.
cd "$(dirname "$0")/.."
echo "Starting GPT runner… (Ctrl-C to stop)"
AGENT=gpt AGENT_CMD="${GPT_CMD:-codex exec}" node agent-runner/runner.mjs
