# AI Layer Optimization Notes

## Current State (as of 2026-03-09)

Core AI: 419 lines across `lib/ai/` (client, context, 4 prompt files)
API routes: 785 lines across 5 routes (extract, suggest-mapping, agenda-notes, ask, match)

### What's Solid
- Type-safe `callDeepSeek<T>()` with discriminated union returns
- `fetchOrgContext()` parallel queries shared across routes
- Modular prompt composition (system + source hint + context + terms + example)
- Deterministic Asana parser bypasses AI for structured exports
- Keyword fallback in suggest-mapping (works without API key)

### Extract to Helpers
- **Source quote repair** (`extract/route.ts` lines 78-118) — 40 lines of sliding-window logic inline. Move to `lib/ai/repair-quotes.ts`
- **Ask data formatting** (`ask/route.ts` lines 56-117) — 8 near-identical format functions. Consolidate into `formatDataForAI(category, items)`
- **Match item rendering** (`match/route.ts` lines 71-102) — repeated text-building patterns. Use lookup table or template

### Guardrails Needed
- No input size validation (raw_text unbounded)
- No rate limiting or concurrency control on DeepSeek calls
- No retry logic — timeout or rate-limit = immediate failure
- Prompt size unbounded (all people + all term corrections concatenated)

### Unbounded Data Fetching
- `ask/route.ts` fetches ALL action items, blockers, RAID entries — no limit/pagination
- No caching of org context between requests
- Quote repair is O(n²) on document length

### Observability Gaps
- No logging of AI call latency, token usage, or cost
- Extraction failures silent (marked "failed" in DB, no details)
- No way to debug why an extraction went wrong

## Priority Order

1. Extract helpers (quote repair, data formatting, item rendering)
2. Add input bounds (max text length, max items in context, pagination on ask)
3. Add basic logging (AI call duration, token count, success/fail)
4. Add retry with exponential backoff for DeepSeek timeouts
5. Cache org context in request scope
6. Structured error responses (code, reason, user-facing suggestion)
