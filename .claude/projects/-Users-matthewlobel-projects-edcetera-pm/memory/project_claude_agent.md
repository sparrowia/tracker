---
name: Claude Agent Integration
description: Building a system where tracker tasks assigned to Claude trigger Claude Code CLI to execute code changes autonomously, with results posted back to the tracker
type: project
---

Matt wants to build a "code from your phone" workflow:
- Tracker action items assigned to "Claude" trigger an agent worker
- Agent worker runs Claude Code CLI against the linked project repo
- Claude writes code, builds, commits, pushes to branch, creates PR
- Results posted back as comments on the tracker task
- For web: Vercel preview deploys automatically
- For iOS: CI pipeline builds and pushes to TestFlight

**Why:** Matt wants to be able to create tasks from his phone and have working builds delivered without touching a laptop.

**How to apply:** This is a major upcoming initiative. The tracker already has structured tasks, descriptions, project context, and comments. The missing piece is the agent worker service that bridges tracker → Claude CLI → git → tracker. Will need: repo registry per project, "Assign to Claude" button, agent worker process, result callbacks.
