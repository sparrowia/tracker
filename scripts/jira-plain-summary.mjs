// Turns an engineering Jira summary into a label a non-technical reader can
// scan on a roadmap card.
//
//   "Harden admin-token boundary — timing-safe compare + per-operator OIDC/JWT
//    for storefront /api/admin/*"                    ->  "Security work - Hardening"
//   "checkout: order summary tax ignores applied credits"
//                                                    ->  "Checkout & payments - Bug fix"
//
// Two parts: WHICH part of the product ("area") and WHAT KIND of work ("kind").
// Deliberately rule-based rather than a model call: the roadmap is re-synced
// often, and a label that silently changes wording between syncs is worse than
// one that is occasionally too coarse. Every rule here is inspectable and the
// output is stable for the same input.
//
// Ordering matters in both tables — the FIRST match wins, so put the specific
// signals above the generic ones (e.g. "credit" before "checkout", because
// credit-hour work is its own area even though it shows up during checkout).

/** Area rules: [label, /regex/]. First match wins. */
const AREA_RULES = [
  // Security and compliance read as their own concerns regardless of where the
  // code lives, so they sit above the feature areas.
  ['Security work', /\b(security|xss|csrf|vulnerab|hardening|harden|open redirect|injection|enumerat|timing side-channel|side channel|secrets?|credentials?|rotat|rls|takeover|spoof|tamper|auth bypass|rate limit|ptest|pen ?test|penetration|vault)\b/i],
  ['Compliance & privacy', /\b(compliance|gdpr|ccpa|pii|retention|can-spam|unsubscribe|accessib|a11y|wcag|consent)\b/i],

  // Money.
  ['Credit hours', /\b(credit hour|credit wallet|credits?|bundle)\b/i],
  ['Tax', /\b(tax|avalara|nexus)\b/i],
  ['Refunds', /\brefund/i],
  ['Checkout & payments', /\b(checkout|cart|payment|stripe|pay with|promo|coupon|discount|order total|place[- ]order|purchase|billing)\b/i],
  ['Finance reporting', /\b(finance|revenue|reconcil|invoice|ledger|payout)\b/i],

  // Learner-facing product.
  ['Certificates', /\b(certificate|cert\b|pace|ce broker|verification code|verify page|intake|license number)\b/i],
  ['Webinars', /\b(webinar|zoom)\b/i],
  ['Course catalog', /\b(catalog|course|thought industries|\bti\b|panorama|enrollment|enroll|syllabus|quiz|completion|state approval|courses-state)\b/i],
  ['Login & accounts', /\b(auth|onelogin|\bol\b|login|sign[- ]?in|sign[- ]?up|password|session|sso|oidc|jwt|account|profile)\b/i],
  ['Email', /\b(email|e-mail|newsletter|klaviyo|hubspot|mailgun|smtp|sendgrid|receipt|acknowledg)\b/i],
  ['Customer support', /\b(support form|support case|salesforce case|helpdesk|support request|contact form)\b/i],

  // Internal.
  ['Admin tools', /\b(admin|dashboard|operator|back[- ]office|customer 360)\b/i],
  ['Salesforce', /\b(salesforce|\bsf\b|soql|opportunity)\b/i],
  ['Site content', /\b(cms|content|copy|seo|page|homepage|faq|review|brand|theme|logo|redirect|sitemap|llms\.txt)\b/i],
  ['Integrations', /\b(bigcommerce|\bbc\b|benchprep|\bbp\b|hivebrite|affirm|integration|webhook)\b/i],

  // Plumbing.
  ['Speed & reliability', /\b(perf|performance|cache|caching|index|latency|timeout|slow|pooling|scal|load test|memory|bundle size)\b/i],
  ['Monitoring', /\b(monitor|observab|alert|sentry|heartbeat|logging|log\.alert|audit log|anomaly)\b/i],
  ['Database', /\b(schema|migration|supabase|postgres|\bdb\b|table|column|constraint|backup|pitr)\b/i],
  ['Engineering process', /\b(\bci\b|\bcd\b|pipeline|test coverage|unit test|e2e|deploy|vercel|changeset|lint|typecheck|dependab)\b/i],
  ['Documentation', /\b(document|\bdocs\b|runbook|readme|handover)\b/i],
];

/** Kind rules: [label, /regex/]. First match wins; issue type is checked first. */
const KIND_RULES = [
  ['Hardening', /\b(harden|hardening|tighten|lock down|defense|mitigat)\b/i],
  ['Bug fix', /\b(fix|broken|incorrect|wrong|fails?|failing|error|bug|crash|does not|doesn't|cannot|can't|missing|duplicate|mismatch|leak|stale|silently)\b/i],
  ['Verification', /\b(verify|validate|confirm|test end[- ]to[- ]end|qa\b|smoke|re-test|reproduce|prove)\b/i],
  ['Testing', /\b(tests?|coverage)\b/i],
  ['Coordination', /\b(connect with|coordinate|engage|kick ?off|schedule (?:a |the )?(?:call|meeting|session))\b/i],
  ['Setup & config', /\b(set |configure|config\b|seed|enable|provision|apply |register|wire\b|env var|credentials?|cut ?over|turn on|deploy|promote|release to|ship to)\b/i],
  ['Cleanup', /\b(remove|delete|drop|retire|clean ?up|deprecat|prune|archive|consolidat)\b/i],
  ['Investigation', /\b(investigate|audit|assess|review|analy[sz]e|research|decide|determine|scope)\b/i],
  ['New capability', /\b(add|build|create|implement|introduce|new |support for|enable .* to)\b/i],
  ['Improvement', /\b(update|change|adjust|improve|refactor|rename|reword|move|extend|expand|simplif|polish|standardi)\b/i],
  ['Documentation', /\b(document|\bdocs\b|write up|runbook)\b/i],
];

const ISSUE_TYPE_KIND = {
  bug: 'Bug fix',
  story: 'New capability',
  task: null, // too generic to infer from — fall through to the text rules
  'sub-task': null,
  subtask: null,
  epic: 'Workstream',
  spike: 'Investigation',
};

function firstMatch(rules, text) {
  for (const [label, re] of rules) if (re.test(text)) return label;
  return null;
}

/**
 * @param {{summary?: string, description?: string, labels?: string[], issueType?: string}} t
 * @returns {string} e.g. "Security work - Hardening"
 */
export function plainSummary(t) {
  const summary = t.summary || '';
  const description = t.description || '';
  const labels = (t.labels || []).join(' ');
  // The summary carries the intent; the description is corroborating context.
  // Weight the summary by searching it alone first, so a passing mention of
  // "checkout" deep in a description can't outrank the summary's own subject.
  const strong = `${summary} ${labels}`;
  const full = `${strong} ${description}`;

  const area =
    firstMatch(AREA_RULES, strong) ||
    firstMatch(AREA_RULES, full) ||
    'Platform';

  const typeKind = ISSUE_TYPE_KIND[(t.issueType || '').toLowerCase()];
  const kind =
    typeKind ||
    firstMatch(KIND_RULES, summary) ||
    firstMatch(KIND_RULES, full) ||
    'Change';

  return `${area} - ${kind}`;
}

/** Flatten Jira's ADF description to plain text. */
export function adfToText(node, out = []) {
  if (!node) return '';
  if (Array.isArray(node)) {
    for (const n of node) adfToText(n, out);
    return out.join('');
  }
  if (typeof node === 'object') {
    if (node.type === 'text' && node.text) out.push(node.text);
    if (node.type === 'hardBreak') out.push('\n');
    if (node.content) adfToText(node.content, out);
    // Block-level nodes get a trailing newline so paragraphs and list items
    // don't run together into one wall of text in the detail modal.
    if (['paragraph', 'heading', 'listItem', 'blockquote', 'codeBlock', 'rule'].includes(node.type)) out.push('\n');
    return out.join('');
  }
  return out.join('');
}
