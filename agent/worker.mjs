#!/usr/bin/env node

/**
 * Claude Agent Worker
 *
 * Polls the tracker for tasks assigned to Claude, executes them via
 * Claude Code CLI, and posts results back.
 *
 * Usage:
 *   node agent/worker.mjs
 *
 * Environment variables (in agent/.env):
 *   TRACKER_URL=https://edcet-tracker.vercel.app
 *   AGENT_SECRET=your-secret-here
 *   GITHUB_TOKEN=ghp_your_token_here  (for creating PRs)
 *   POLL_INTERVAL=30000  (ms, default 30s)
 */

import { execSync, spawn } from "child_process";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load agent/.env
try {
  const envFile = readFileSync(resolve(__dirname, ".env"), "utf8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    process.env[key.trim()] = rest.join("=").trim();
  }
} catch {
  // .env file is optional if vars are set in environment
}

const TRACKER_URL = process.env.TRACKER_URL || "https://edcet-tracker.vercel.app";
const AGENT_SECRET = process.env.AGENT_SECRET;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || "30000");

if (!AGENT_SECRET) {
  console.error("AGENT_SECRET is required. Set it in agent/.env");
  process.exit(1);
}

console.log(`🤖 Claude Agent Worker started`);
console.log(`   Tracker: ${TRACKER_URL}`);
console.log(`   Poll interval: ${POLL_INTERVAL / 1000}s`);
console.log(`   GitHub token: ${GITHUB_TOKEN ? "configured" : "NOT SET (PRs disabled)"}`);
console.log("");

async function poll() {
  try {
    const res = await fetch(`${TRACKER_URL}/api/agent/poll`, {
      headers: { Authorization: `Bearer ${AGENT_SECRET}` },
    });

    if (!res.ok) {
      console.error(`Poll failed: ${res.status} ${res.statusText}`);
      return;
    }

    const { tasks, agent_id } = await res.json();

    if (!tasks || tasks.length === 0) {
      return; // Nothing to do
    }

    console.log(`📋 Found ${tasks.length} pending task(s)`);

    for (const task of tasks) {
      await executeTask(task, agent_id);
    }
  } catch (err) {
    console.error("Poll error:", err.message);
  }
}

async function executeTask(task, agentId) {
  const { entity_type, id, title, description, notes, next_steps, project } = task;

  console.log(`\n🔧 Working on: ${title}`);
  console.log(`   Type: ${entity_type} | Project: ${project?.name || "none"}`);

  if (!project?.working_directory) {
    console.log(`   ⚠️  No working directory configured for project. Skipping.`);
    await postResult(entity_type, id, agentId, "error", "No working directory configured for this project. Set it in the project settings.");
    return;
  }

  // Mark as running
  try {
    await fetch(`${TRACKER_URL}/api/agent/result`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AGENT_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        entity_type,
        entity_id: id,
        status: "running",
        agent_id: agentId,
      }),
    });
  } catch {}

  // Build the prompt for Claude
  const promptParts = [
    `Task: ${title}`,
    description ? `\nDescription: ${description}` : "",
    notes ? `\nNotes: ${notes}` : "",
    next_steps ? `\nNext Steps: ${next_steps}` : "",
    `\nProject: ${project.name}`,
    project.repo_url ? `\nRepo: ${project.repo_url}` : "",
    `\n\nIMPORTANT: Create a new git branch for your changes (branch name based on the task). Do NOT push to main directly. After making changes, push the branch and create a PR using the gh CLI. Include a clear PR description.`,
  ];

  const prompt = promptParts.filter(Boolean).join("");
  const workDir = project.working_directory;

  console.log(`   📂 Working in: ${workDir}`);
  console.log(`   🧠 Running Claude Code CLI...`);

  try {
    // Run Claude Code CLI headless
    const result = await runClaude(prompt, workDir);

    console.log(`   ✅ Claude finished`);

    // Try to find a PR URL in the output
    const prMatch = result.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/);
    const prUrl = prMatch ? prMatch[0] : null;

    if (prUrl) {
      console.log(`   🔗 PR created: ${prUrl}`);
    }

    // Build a summary
    const summary = result.length > 2000 ? result.slice(-2000) : result;

    await postResult(entity_type, id, agentId, "success", summary, prUrl);
    console.log(`   📝 Result posted to tracker`);
  } catch (err) {
    console.error(`   ❌ Claude failed:`, err.message);
    await postResult(entity_type, id, agentId, "error", `Agent error: ${err.message}`);
  }
}

function runClaude(prompt, workDir) {
  return new Promise((resolve, reject) => {
    const args = ["-p", prompt, "--output-format", "text"];

    if (GITHUB_TOKEN) {
      // Set GITHUB_TOKEN in the environment for gh CLI
    }

    const child = spawn("claude", args, {
      cwd: workDir,
      env: {
        ...process.env,
        ...(GITHUB_TOKEN ? { GITHUB_TOKEN } : {}),
      },
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 300000, // 5 minute timeout
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(`   ${text}`);
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Claude exited with code ${code}: ${stderr || stdout}`));
      }
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}

async function postResult(entityType, entityId, agentId, status, comment, prUrl) {
  try {
    await fetch(`${TRACKER_URL}/api/agent/result`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AGENT_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        entity_type: entityType,
        entity_id: entityId,
        status,
        comment,
        pr_url: prUrl || null,
        agent_id: agentId,
      }),
    });
  } catch (err) {
    console.error("   Failed to post result:", err.message);
  }
}

// Main loop
async function main() {
  // Initial poll
  await poll();

  // Then poll on interval
  setInterval(poll, POLL_INTERVAL);

  console.log("👂 Listening for tasks... (Ctrl+C to stop)\n");
}

main();
