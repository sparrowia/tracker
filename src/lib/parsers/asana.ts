/**
 * Deterministic parser for Asana PDF exports.
 * Bypasses DeepSeek entirely — structured text → ExtractedItem[] directly.
 */

interface ExtractedItem {
  title: string;
  owner_name?: string | null;
  reporter_name?: string | null;
  priority?: "critical" | "high" | "medium" | "low";
  due_date?: string | null;
  date_reported?: string | null;
  notes?: string | null;
  impact?: string | null;
  impact_description?: string | null;
  attachments?: string | null;
  confidence?: "high" | "medium" | "low" | null;
  source_quote?: string | null;
  new_status?: string | null;
  subject?: string | null;
  details?: string | null;
}

type EntityCategory =
  | "action_items"
  | "decisions"
  | "issues"
  | "risks"
  | "blockers"
  | "status_updates";

// Status mapping: Asana → our ItemStatus
const STATUS_MAP: Record<string, string> = {
  pending: "pending",
  "in progress": "in_progress",
  blocked: "blocked",
  review: "needs_verification",
  hold: "paused",
  rejected: "closed",
  complete: "complete",
};

// Priority mapping: Asana → our PriorityLevel
const PRIORITY_MAP: Record<string, "critical" | "high" | "medium" | "low"> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
};

// Section headers that indicate task status groups
const SECTION_HEADERS = [
  "triage",
  "hold",
  "backlog",
  "development",
  "complete",
  "completed",
  "done",
  "in progress",
  "review",
  "blocked",
];

// Checkbox characters used in Asana PDF exports
const CHECKBOX_RE = /^[□☐☑✓✔✅⬜]\s*/;

// Match "due Mon DD, YYYY" at end of line
const DUE_DATE_RE =
  /\bdue\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+(\w+\s+\d{1,2},?\s+\d{4})\s*$/i;

// Match standard date formats for "due" lines
const DUE_DATE_LINE_RE =
  /\bdue\s+(\w+\s+\d{1,2},?\s+\d{4})/i;

// Loom URL pattern
const LOOM_RE = /https?:\/\/(?:www\.)?loom\.com\/share\/[^\s)]+/gi;

// Boilerplate to strip
const BOILERPLATE_RE =
  /This task was submitted through[^]*?(?=\n\n|\n[A-Z]|\n□|\n☐|\n☑|\n✓|\n✔|$)/gi;
const FORM_URL_RE = /https?:\/\/form\.asana\.com\/[^\s)]*/gi;

/**
 * Parse a raw text dump from an Asana PDF export into categorized extracted items.
 */
export function parseAsanaExport(
  rawText: string,
  peopleNames?: string[]
): Record<EntityCategory, ExtractedItem[]> {
  const result: Record<EntityCategory, ExtractedItem[]> = {
    action_items: [],
    decisions: [],
    issues: [],
    risks: [],
    blockers: [],
    status_updates: [],
  };

  // Clean boilerplate
  let text = rawText
    .replace(BOILERPLATE_RE, "")
    .replace(FORM_URL_RE, "");

  // Split into task blocks
  const blocks = splitIntoBlocks(text);

  let currentSection = "";

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    // Check if this is a section header
    const sectionMatch = SECTION_HEADERS.find(
      (s) => trimmed.toLowerCase() === s || trimmed.toLowerCase().startsWith(s + ":")
    );
    if (sectionMatch && trimmed.length < 40) {
      currentSection = sectionMatch;
      continue;
    }

    const parsed = parseBlock(trimmed, currentSection, peopleNames);
    if (!parsed) continue;

    // All tasks go to issues (best field match)
    result.issues.push(parsed.issue);

    // Blocked items also get a blocker entry
    if (parsed.isBlocked) {
      result.blockers.push({
        title: parsed.issue.title,
        owner_name: parsed.issue.owner_name,
        priority: parsed.issue.priority,
        impact_description: parsed.issue.notes || parsed.issue.impact || null,
        confidence: "high",
        source_quote: parsed.issue.source_quote,
      });
    }

    // Complete items also get a status update
    if (parsed.isComplete) {
      result.status_updates.push({
        title: parsed.issue.title,
        subject: parsed.issue.title,
        new_status: "complete",
        details: `Completed by ${parsed.issue.owner_name || "unknown"}`,
        confidence: "high",
        source_quote: parsed.issue.source_quote,
      });
    }
  }

  return result;
}

/**
 * Split raw text into individual task blocks.
 * Each task starts with a checkbox character or "Name: Title" pattern.
 */
function splitIntoBlocks(text: string): string[] {
  const lines = text.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    const stripped = line.trim();

    // Detect block boundary: checkbox line or "Name: Title" pattern at start
    const isNewTask =
      CHECKBOX_RE.test(stripped) ||
      // "Assignee: Title" pattern — name before colon, text after
      /^[A-Z][a-z]+(?: [A-Z][a-z]+)*:\s+\S/.test(stripped);

    // Also check for section headers as boundaries
    const isSection = SECTION_HEADERS.some(
      (s) =>
        stripped.toLowerCase() === s ||
        stripped.toLowerCase().startsWith(s + ":")
    );

    // Separator lines
    const isSeparator = /^[_─━═]{3,}$/.test(stripped);

    if ((isNewTask || isSection) && current.length > 0) {
      blocks.push(current.join("\n"));
      current = [];
    }

    if (!isSeparator) {
      current.push(line);
    }
  }

  if (current.length > 0) {
    blocks.push(current.join("\n"));
  }

  return blocks;
}

interface ParsedBlock {
  issue: ExtractedItem;
  isBlocked: boolean;
  isComplete: boolean;
}

/**
 * Parse a single task block into an ExtractedItem.
 */
function parseBlock(
  block: string,
  currentSection: string,
  peopleNames?: string[]
): ParsedBlock | null {
  const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  // Parse header line
  let headerLine = lines[0];
  const hasCheckedBox = /^[☑✓✔✅]/.test(headerLine);
  headerLine = headerLine.replace(CHECKBOX_RE, "").trim();

  // Skip if header is too short or looks like noise
  if (headerLine.length < 3) return null;

  // Extract assignee and title from "Assignee: Title" pattern
  let assignee = "";
  let title = headerLine;

  const colonIdx = headerLine.indexOf(":");
  if (colonIdx > 0 && colonIdx < 40) {
    const beforeColon = headerLine.substring(0, colonIdx).trim();
    const afterColon = headerLine.substring(colonIdx + 1).trim();
    // Only treat as "Assignee: Title" if before-colon looks like a name
    if (/^[A-Z][a-z]+(?: [A-Z][a-z]+)*$/.test(beforeColon) && afterColon.length > 0) {
      assignee = beforeColon;
      title = afterColon;
    }
  }

  // Extract due date from header line
  let dueDate: string | null = null;
  const dueDateMatch = title.match(DUE_DATE_RE) || title.match(DUE_DATE_LINE_RE);
  if (dueDateMatch) {
    dueDate = parseDateString(dueDateMatch[1] || dueDateMatch[0]);
    // Remove the due date text from the title
    title = title.replace(DUE_DATE_RE, "").replace(DUE_DATE_LINE_RE, "").trim();
  }

  // Parse metadata fields from remaining lines
  const fields: Record<string, string> = {};
  let description = "";
  let inDescription = false;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];

    // Stop at separator
    if (/^[_─━═]{3,}$/.test(line)) {
      inDescription = false;
      continue;
    }

    if (inDescription) {
      description += (description ? "\n" : "") + line;
      continue;
    }

    // Check for "Field: Value" pattern
    const fieldMatch = line.match(/^\[?([A-Za-z\s/]+?)\]?:\s*(.*)/);
    if (fieldMatch) {
      const key = fieldMatch[1].trim().toLowerCase();
      const value = fieldMatch[2].trim();

      if (key === "description") {
        inDescription = true;
        if (value) description = value;
      } else {
        fields[key] = value;
      }
    } else if (!inDescription && line.length > 0) {
      // Could be continuation of description or extra text
      // Check if it looks like a due date line
      const lineDueMatch = line.match(DUE_DATE_LINE_RE);
      if (lineDueMatch && !dueDate) {
        dueDate = parseDateString(lineDueMatch[1]);
      }
    }
  }

  // Extract structured fields
  const status = fields["status"] || "";
  const priority = fields["priority"] || "";
  const reporterName = fields["name"] || "";
  const issueType = fields["issue type"] || "";
  const url = fields["url"] || "";
  const os = fields["os"] || "";
  const browser = fields["browser"] || "";

  // Map status
  const mappedStatus = STATUS_MAP[status.toLowerCase()] || null;
  const isComplete =
    hasCheckedBox ||
    currentSection === "complete" ||
    currentSection === "completed" ||
    currentSection === "done" ||
    mappedStatus === "complete";
  const isBlocked = mappedStatus === "blocked" || currentSection === "blocked";

  // Map priority
  const mappedPriority = PRIORITY_MAP[priority.toLowerCase()] || "medium";

  // Extract loom links from entire block
  const loomLinks = block.match(LOOM_RE);

  // Build notes field: URL + OS + Browser + description
  const noteParts: string[] = [];
  if (url) noteParts.push(`URL: ${url}`);
  if (os) noteParts.push(`OS: ${os}`);
  if (browser) noteParts.push(`Browser: ${browser}`);
  if (noteParts.length > 0 && description) noteParts.push("");
  if (description) noteParts.push(description);
  const notes = noteParts.length > 0 ? noteParts.join("\n") : null;

  // Fuzzy match assignee against known people
  const ownerName = fuzzyMatchPerson(assignee, peopleNames) || assignee || null;
  const reporter = fuzzyMatchPerson(reporterName, peopleNames) || reporterName || null;

  // Build source_quote from the header line for text highlighting
  const sourceQuote = lines[0].replace(CHECKBOX_RE, "").trim();

  const issue: ExtractedItem = {
    title,
    owner_name: ownerName,
    reporter_name: reporter,
    priority: mappedPriority,
    date_reported: dueDate,
    impact: issueType || null,
    attachments: loomLinks ? loomLinks.join("\n") : null,
    notes,
    confidence: "high",
    source_quote: sourceQuote,
  };

  return { issue, isBlocked, isComplete };
}

/**
 * Parse a date string like "Mar 5, 2026" or "March 5 2026" into YYYY-MM-DD.
 */
function parseDateString(str: string): string | null {
  if (!str) return null;
  const cleaned = str.replace(/,/g, "").trim();
  const d = new Date(cleaned);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
}

/**
 * Fuzzy match a name against a list of known people names.
 * Returns the full matched name or null.
 */
function fuzzyMatchPerson(
  name: string,
  peopleNames?: string[]
): string | null {
  if (!name || !peopleNames || peopleNames.length === 0) return null;

  const lower = name.toLowerCase().trim();
  if (!lower) return null;

  // Exact match
  for (const pn of peopleNames) {
    if (pn.toLowerCase() === lower) return pn;
  }

  // Substring / contains match
  for (const pn of peopleNames) {
    const pnLower = pn.toLowerCase();
    if (pnLower.includes(lower) || lower.includes(pnLower)) return pn;
  }

  // First or last name match
  const inputParts = lower.split(/\s+/);
  for (const pn of peopleNames) {
    const pnParts = pn.toLowerCase().split(/\s+/);
    if (inputParts.some((ip) => pnParts.some((pp) => pp === ip && ip.length > 2))) {
      return pn;
    }
  }

  return null;
}
