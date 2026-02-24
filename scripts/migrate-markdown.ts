/**
 * migrate-markdown.ts
 *
 * One-time migration script to populate the Edcetera Project Tracker database
 * from existing markdown files.
 *
 * Usage:
 *   npx tsx scripts/migrate-markdown.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars
 * (service role key bypasses RLS for seeding).
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    "Missing env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const MD_DIR = "/Users/matthewlobel/Repositories/edcet/project-management";

// ── Helpers ──────────────────────────────────────────────────────────────

function readMd(filename: string): string {
  return fs.readFileSync(path.join(MD_DIR, filename), "utf-8");
}

function parseTableRows(text: string): string[][] {
  const lines = text.split("\n").filter((l) => l.trim().startsWith("|"));
  if (lines.length < 2) return [];
  // Skip header and separator rows
  return lines.slice(2).map((line) =>
    line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim())
  );
}

function findSection(text: string, heading: string): string {
  const regex = new RegExp(`^#{1,3}\\s+${escapeRegex(heading)}`, "m");
  const match = text.match(regex);
  if (!match || match.index === undefined) return "";
  const start = match.index + match[0].length;
  const nextHeading = text.slice(start).search(/^#{1,3}\s/m);
  return nextHeading === -1 ? text.slice(start) : text.slice(start, start + nextHeading);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type StatusEmoji = string;
function emojiToStatus(emoji: StatusEmoji): string {
  if (emoji.includes("✅")) return "complete";
  if (emoji.includes("🔄")) return "in_progress";
  if (emoji.includes("❓")) return "needs_verification";
  if (emoji.includes("⏸️")) return "paused";
  if (emoji.includes("⚠️")) return "at_risk";
  if (emoji.includes("🔴")) return "blocked";
  if (emoji.includes("🔲")) return "pending";
  if (emoji.includes("🟠")) return "in_progress";
  if (emoji.includes("🆕")) return "pending";
  return "pending";
}

function emojiToHealth(emoji: string): string {
  if (emoji.includes("🟢")) return "on_track";
  if (emoji.includes("🔄")) return "in_progress";
  if (emoji.includes("⚠️")) return "at_risk";
  if (emoji.includes("🔴")) return "blocked";
  if (emoji.includes("⏸️")) return "paused";
  if (emoji.includes("✅")) return "complete";
  return "in_progress";
}

function parseDateLoose(dateStr: string): string | null {
  if (!dateStr || dateStr === "—" || dateStr === "TBD" || dateStr === "ASAP") return null;
  const cleaned = dateStr
    .replace(/\*\*/g, "")
    .replace(/✅|🔲|🔄|❓|⏸️|⚠️|🔴|🟠|🟢|🆕/g, "")
    .trim();
  // Try Feb 4, Feb 4 2026, February 4, 2026, etc.
  const d = new Date(cleaned + (cleaned.match(/\d{4}/) ? "" : " 2026"));
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
}

function guessPriority(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("critical") || lower.includes("sev1") || lower.includes("🔴")) return "critical";
  if (lower.includes("high") || lower.includes("asap") || lower.includes("🟠") || lower.includes("overdue")) return "high";
  if (lower.includes("low")) return "low";
  return "medium";
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── ID Maps ──────────────────────────────────────────────────────────────

let ORG_ID: string;
const vendorMap = new Map<string, string>(); // name -> id
const personMap = new Map<string, string>(); // lowercase name -> id
const projectMap = new Map<string, string>(); // slug -> id

// ── Step 1: Seed Organization ────────────────────────────────────────────

async function seedOrg() {
  console.log("Seeding organization...");
  const { data, error } = await supabase
    .from("organizations")
    .insert({ name: "Edcetera" })
    .select()
    .single();
  if (error) throw error;
  ORG_ID = data.id;
  console.log(`  Org created: ${ORG_ID}`);
}

// ── Step 2: Parse Key Contacts → Vendors + People ───────────────────────

async function seedContacts() {
  console.log("Seeding contacts from 00_KeyContacts.md...");
  const text = readMd("00_KeyContacts.md");

  // Define vendor sections
  const vendorSections = [
    { heading: "Silk Commerce", slug: "silk" },
    { heading: "BenchPrep", slug: "benchprep" },
    { heading: "OneLogin", slug: "onelogin" },
    { heading: "Hivebrite", slug: "hivebrite" },
    { heading: "BigCommerce", slug: "bigcommerce" },
    { heading: "Thought Industries", slug: "thought-industries" },
  ];

  // Create vendors
  for (const v of vendorSections) {
    const { data, error } = await supabase
      .from("vendors")
      .insert({ org_id: ORG_ID, name: v.heading, slug: v.slug })
      .select()
      .single();
    if (error) throw error;
    vendorMap.set(v.heading, data.id);
    vendorMap.set(v.heading.toLowerCase(), data.id);
    console.log(`  Vendor: ${v.heading} (${data.id})`);
  }

  // Also add some implicit vendors
  for (const extra of [
    { name: "Power Digital", slug: "power-digital" },
    { name: "MakeSwift", slug: "makeswift" },
    { name: "Avalara", slug: "avalara" },
    { name: "HubSpot", slug: "hubspot" },
    { name: "Vercel", slug: "vercel" },
  ]) {
    const { data, error } = await supabase
      .from("vendors")
      .insert({ org_id: ORG_ID, name: extra.name, slug: extra.slug })
      .select()
      .single();
    if (error) throw error;
    vendorMap.set(extra.name, data.id);
    vendorMap.set(extra.name.toLowerCase(), data.id);
  }

  // Parse internal team
  const internalSection = findSection(text, "Edcetera \\(Internal\\)");
  const internalRows = parseTableRows(internalSection);

  for (const [name, role, email, notes] of internalRows) {
    if (!name) continue;
    const { data, error } = await supabase
      .from("people")
      .insert({
        org_id: ORG_ID,
        full_name: name,
        title: role || null,
        email: email || null,
        is_internal: true,
        notes: notes || null,
      })
      .select()
      .single();
    if (error) throw error;
    personMap.set(name.toLowerCase(), data.id);
    // Also map first name for fuzzy matching
    const firstName = name.split(" ")[0].toLowerCase();
    if (!personMap.has(firstName)) personMap.set(firstName, data.id);
    console.log(`  Internal: ${name}`);
  }

  // Parse vendor contacts
  for (const v of vendorSections) {
    const section = findSection(text, v.heading);
    const rows = parseTableRows(section);
    const vendorId = vendorMap.get(v.heading);

    for (const [name, role, email, notes] of rows) {
      if (!name) continue;
      const { data, error } = await supabase
        .from("people")
        .insert({
          org_id: ORG_ID,
          full_name: name,
          title: role || null,
          email: email || null,
          vendor_id: vendorId,
          is_internal: false,
          notes: notes || null,
        })
        .select()
        .single();
      if (error) throw error;
      personMap.set(name.toLowerCase(), data.id);
      const firstName = name.split(" ")[0].toLowerCase();
      if (!personMap.has(firstName)) personMap.set(firstName, data.id);
      console.log(`  Vendor contact: ${name} (${v.heading})`);
    }
  }

  // Parse "Other" section
  const otherSection = findSection(text, "Other");
  const otherRows = parseTableRows(otherSection);
  for (const [name, role, email, notes] of otherRows) {
    if (!name) continue;
    const { data, error } = await supabase
      .from("people")
      .insert({
        org_id: ORG_ID,
        full_name: name,
        title: role || null,
        email: email || null,
        is_internal: false,
        notes: notes || null,
      })
      .select()
      .single();
    if (error) throw error;
    personMap.set(name.toLowerCase(), data.id);
  }
}

// ── Helper: resolve person names to IDs ──────────────────────────────────

function findPerson(nameStr: string | null): string | null {
  if (!nameStr) return null;
  // Handle "Chase/Stan" → pick first
  const name = nameStr.split("/")[0].trim();
  const lower = name.toLowerCase();
  if (personMap.has(lower)) return personMap.get(lower)!;
  // Try first name
  const firstName = lower.split(" ")[0];
  if (personMap.has(firstName)) return personMap.get(firstName)!;
  return null;
}

function findVendor(text: string): string | null {
  const lower = text.toLowerCase();
  if (lower.includes("silk")) return vendorMap.get("Silk Commerce") || null;
  if (lower.includes("benchprep") || lower.includes("bp ")) return vendorMap.get("BenchPrep") || null;
  if (lower.includes("onelogin")) return vendorMap.get("OneLogin") || null;
  if (lower.includes("hivebrite")) return vendorMap.get("Hivebrite") || null;
  if (lower.includes("bigcommerce") || lower.includes("bc ")) return vendorMap.get("BigCommerce") || null;
  if (lower.includes("thought industries") || lower.includes(" ti ")) return vendorMap.get("Thought Industries") || null;
  if (lower.includes("makeswift")) return vendorMap.get("MakeSwift") || null;
  return null;
}

// ── Step 3: Parse Projects ───────────────────────────────────────────────

interface ProjectDef {
  name: string;
  slug: string;
  file: string;
  health: string;
  platformStatus: string | null;
  description: string | null;
  vendors: string[];
}

const projectDefs: ProjectDef[] = [
  { name: "OptoPrep", slug: "optoprep", file: "01_OptoPrep.md", health: "at_risk", platformStatus: "Sales on Legacy", description: "OptoPrep exam preparation platform", vendors: ["BenchPrep", "Silk Commerce", "OneLogin"] },
  { name: "VetPrep / VTP", slug: "vetprep-vtp", file: "02_VetPrep_VTP.md", health: "at_risk", platformStatus: "Sales on Legacy", description: "VetPrep and VetTechPrep exam preparation", vendors: ["BenchPrep", "Silk Commerce", "OneLogin"] },
  { name: "Daily Dose", slug: "daily-dose", file: "03_DailyDose.md", health: "on_track", platformStatus: null, description: "Daily question email feature", vendors: ["Silk Commerce"] },
  { name: "Silk / UAT", slug: "silk-uat", file: "04_Silk_UAT.md", health: "blocked", platformStatus: "Remediation — Affirm blocker", description: "Silk Commerce platform UAT and remediation", vendors: ["Silk Commerce", "BigCommerce", "MakeSwift"] },
  { name: "Ophtho", slug: "ophtho", file: "05_Ophtho.md", health: "in_progress", platformStatus: "Oral Boards pivoting", description: "Ophthalmology exam preparation and Oral Boards", vendors: ["BenchPrep"] },
  { name: "Architecture / CE", slug: "architecture-ce", file: "06_Architecture_CE.md", health: "in_progress", platformStatus: null, description: "Architecture and CE continuing education", vendors: ["Thought Industries"] },
  { name: "Land Surveyor", slug: "land-surveyor", file: "07_LandSurveyor.md", health: "on_track", platformStatus: "Launch Mar 10", description: "Land Surveyor exam prep launch", vendors: ["Thought Industries"] },
  { name: "Hivebrite / Community", slug: "hivebrite-community", file: "08_Hivebrite_Community.md", health: "in_progress", platformStatus: null, description: "Community platform management", vendors: ["Hivebrite"] },
  { name: "BenchPrep / Mobile App", slug: "benchprep-mobile", file: "09_BenchPrep_MobileApp.md", health: "on_track", platformStatus: "All 3 iOS APPROVED", description: "BenchPrep mobile app development", vendors: ["BenchPrep", "OneLogin"] },
  { name: "Procedural Videos", slug: "procedural-videos", file: "10_ProceduralVideos.md", health: "in_progress", platformStatus: "3 done, 61 by March", description: "Procedural video production", vendors: ["Thought Industries"] },
];

async function seedProjects() {
  console.log("Seeding projects...");

  for (const p of projectDefs) {
    const { data, error } = await supabase
      .from("projects")
      .insert({
        org_id: ORG_ID,
        name: p.name,
        slug: p.slug,
        description: p.description,
        health: p.health,
        platform_status: p.platformStatus,
      })
      .select()
      .single();
    if (error) throw error;
    projectMap.set(p.slug, data.id);
    console.log(`  Project: ${p.name} (${data.id})`);

    // Link vendors
    for (const vName of p.vendors) {
      const vendorId = vendorMap.get(vName);
      if (vendorId) {
        await supabase.from("project_vendors").insert({
          project_id: data.id,
          vendor_id: vendorId,
        });
      }
    }
  }
}

// ── Step 4: Parse Weekly Command Center ──────────────────────────────────

async function seedFromCommandCenter() {
  console.log("Seeding from 00_WeeklyCommandCenter.md...");
  const text = readMd("00_WeeklyCommandCenter.md");

  // ── Blockers ──
  const blockerSection = findSection(text, "🚨 Active Blockers");
  const blockerRows = parseTableRows(blockerSection);

  for (const [project, blocker, owner, age, impact] of blockerRows) {
    if (!blocker) continue;
    // Strip markdown bold/emoji for title
    const title = blocker
      .replace(/\*\*/g, "")
      .replace(/🟠|✅|🔴|🆕|🔲/g, "")
      .split("—")[0]
      .trim();
    const status = emojiToStatus(blocker);
    const isResolved = status === "complete";

    const projectId = findProjectByName(project);
    const vendorId = findVendor(project) || findVendor(blocker);

    // Parse first_flagged_at from age column
    let firstFlagged: string | null = null;
    const ageMatch = age?.match(/Feb\s+\d+/);
    if (ageMatch) {
      firstFlagged = parseDateLoose(ageMatch[0]);
    }

    await supabase.from("blockers").insert({
      org_id: ORG_ID,
      title,
      description: blocker.replace(/\*\*/g, ""),
      impact_description: impact || null,
      owner_id: findPerson(owner),
      vendor_id: vendorId,
      project_id: projectId,
      status: isResolved ? "complete" : "blocked",
      priority: guessPriority(blocker),
      first_flagged_at: firstFlagged ? new Date(firstFlagged + "T00:00:00Z").toISOString() : new Date().toISOString(),
      resolved_at: isResolved ? new Date().toISOString() : null,
    });
    console.log(`  Blocker: ${title.substring(0, 60)}`);
  }

  // ── Support Tickets ──
  const ticketSection = findSection(text, "🎫 Open Support Requests");
  const ticketRows = parseTableRows(ticketSection);

  for (const [ticketNum, system, issue, opened, statusStr, owner] of ticketRows) {
    if (!ticketNum || ticketNum === "—") {
      // Internal issue without ticket number
      if (issue) {
        await supabase.from("support_tickets").insert({
          org_id: ORG_ID,
          ticket_number: "INTERNAL",
          system: system || null,
          title: issue,
          status: emojiToStatus(statusStr || ""),
          priority: "medium",
          opened_at: parseDateLoose(opened) ? new Date(parseDateLoose(opened)! + "T00:00:00Z").toISOString() : null,
          vendor_id: findVendor(system || ""),
        });
      }
      continue;
    }
    await supabase.from("support_tickets").insert({
      org_id: ORG_ID,
      ticket_number: ticketNum.replace(/\*\*/g, ""),
      system: system?.replace(/\*\*/g, "") || null,
      title: issue,
      status: emojiToStatus(statusStr || ""),
      priority: guessPriority(issue || ""),
      opened_at: parseDateLoose(opened) ? new Date(parseDateLoose(opened)! + "T00:00:00Z").toISOString() : null,
      vendor_id: findVendor(system || ticketNum),
    });
    console.log(`  Ticket: ${ticketNum}`);
  }

  // ── Decisions ──
  const decisionSection = findSection(text, "📋 Decisions Needed");
  const decisionRows = parseTableRows(decisionSection);
  let decisionCounter = 1;

  for (const [decision, project, context, urgency] of decisionRows) {
    if (!decision) continue;
    const title = decision.replace(/\*\*/g, "").replace(/~~/g, "").trim();
    const status = title.startsWith("~~") || (urgency && urgency.includes("✅")) ? "complete" : "pending";
    const projectId = findProjectByName(project || "");

    await supabase.from("raid_entries").insert({
      org_id: ORG_ID,
      raid_type: "decision",
      display_id: `D${decisionCounter++}`,
      title,
      description: context || null,
      priority: guessPriority(urgency || ""),
      status,
      project_id: projectId,
      resolved_at: status === "complete" ? new Date().toISOString() : null,
    });
    console.log(`  Decision: ${title.substring(0, 60)}`);
  }

  // ── Vendor Accountability → Action Items ──
  await seedVendorAccountability(text);

  // ── Meetings ──
  const meetingSection = findSection(readMd("00_ProjectIndex.md"), "Meeting Sources");
  const meetingRows = parseTableRows(meetingSection);

  for (const [date, title, duration, recording] of meetingRows) {
    if (!title) continue;
    const durationMatch = duration?.match(/(\d+)/);
    const urlMatch = recording?.match(/\((https?:\/\/[^)]+)\)/);

    await supabase.from("meetings").insert({
      org_id: ORG_ID,
      title,
      meeting_date: parseDateLoose(date) ? new Date(parseDateLoose(date)! + "T00:00:00Z").toISOString() : null,
      duration_minutes: durationMatch ? parseInt(durationMatch[1]) : null,
      recording_url: urlMatch ? urlMatch[1] : null,
    });
  }
  console.log(`  Meetings: ${meetingRows.length} imported`);
}

function findProjectByName(name: string): string | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  for (const [slug, id] of projectMap) {
    if (lower.includes(slug.replace(/-/g, " ")) || slug.includes(lower.replace(/\s+/g, "-"))) return id;
  }
  if (lower.includes("opto") && !lower.includes("oral")) return projectMap.get("optoprep") || null;
  if (lower.includes("vetprep") || lower.includes("vtp") || lower.includes("vettech")) return projectMap.get("vetprep-vtp") || null;
  if (lower.includes("daily dose")) return projectMap.get("daily-dose") || null;
  if (lower.includes("silk") && !lower.includes("land")) return projectMap.get("silk-uat") || null;
  if (lower.includes("ophtho") || lower.includes("oral board")) return projectMap.get("ophtho") || null;
  if (lower.includes("architect") || lower.includes("dc hours") || lower.includes("ce")) return projectMap.get("architecture-ce") || null;
  if (lower.includes("land surveyor")) return projectMap.get("land-surveyor") || null;
  if (lower.includes("hivebrite") || lower.includes("community")) return projectMap.get("hivebrite-community") || null;
  if (lower.includes("benchprep") || lower.includes("mobile")) return projectMap.get("benchprep-mobile") || null;
  if (lower.includes("procedural") || lower.includes("video")) return projectMap.get("procedural-videos") || null;
  return null;
}

async function seedVendorAccountability(text: string) {
  // Parse vendor accountability sections
  const vendorSections = [
    { heading: "Silk Commerce \\(Yang Lu, Chase Bradshaw\\)", vendor: "Silk Commerce" },
    { heading: "BenchPrep \\(John Gill, Katy O'Donoghue, Nikolay Schwarz\\)", vendor: "BenchPrep" },
    { heading: "OneLogin \\(via Stan\\)", vendor: "OneLogin" },
    { heading: "Thought Industries \\(Matt Lewis\\)", vendor: "Thought Industries" },
  ];

  for (const vs of vendorSections) {
    const section = findSection(text, vs.heading);
    const rows = parseTableRows(section);
    const vendorId = vendorMap.get(vs.vendor);

    for (const [item, due, statusStr] of rows) {
      if (!item) continue;
      const title = item.replace(/\*\*/g, "").replace(/🟠|✅|🔴|🆕|🔲|❓|⚠️|🔄/g, "").trim();
      const status = emojiToStatus(statusStr || "");

      await supabase.from("action_items").insert({
        org_id: ORG_ID,
        title,
        description: statusStr?.replace(/\*\*/g, "") || null,
        vendor_id: vendorId,
        status,
        priority: guessPriority(item + " " + (statusStr || "")),
        due_date: parseDateLoose(due) ? parseDateLoose(due) : null,
        first_flagged_at: new Date().toISOString(),
        resolved_at: status === "complete" ? new Date().toISOString() : null,
      });
      console.log(`  Action (${vs.vendor}): ${title.substring(0, 50)}`);
    }
  }
}

// ── Step 5: Parse per-project files for RAID entries ─────────────────────

async function seedProjectDetails() {
  console.log("Seeding project details from individual files...");

  for (const p of projectDefs) {
    if (!fs.existsSync(path.join(MD_DIR, p.file))) {
      console.log(`  Skipping ${p.file} (not found)`);
      continue;
    }

    const text = readMd(p.file);
    const projectId = projectMap.get(p.slug)!;

    // Parse RAID sections if they exist
    await parseRaidSection(text, "Risks", "risk", projectId);
    await parseRaidSection(text, "Issues", "issue", projectId);
    await parseRaidSection(text, "Actions", "action", projectId);
    await parseRaidSection(text, "Decisions", "decision", projectId);

    console.log(`  Processed: ${p.file}`);
  }
}

const raidCounters: Record<string, number> = { risk: 0, action: 0, issue: 0, decision: 0 };

async function parseRaidSection(text: string, heading: string, raidType: string, projectId: string) {
  const section = findSection(text, heading);
  if (!section) return;

  const rows = parseTableRows(section);

  for (const row of rows) {
    if (row.length < 2) continue;

    // Try to detect the table format - RAID tables vary
    let displayId = "";
    let title = "";
    let priority = "medium";
    let impact = "";
    let owner = "";
    let status = "pending";

    // Most RAID tables: ID | Title/Description | ... | Owner | Status
    if (row[0]?.match(/^[RAID]\d+$/)) {
      displayId = row[0];
      title = row[1]?.replace(/\*\*/g, "").trim() || "";
      // Look for priority, impact, owner in remaining cols
      for (let i = 2; i < row.length; i++) {
        const cell = row[i] || "";
        if (cell.match(/critical|high|medium|low/i)) priority = cell.toLowerCase();
        else if (cell.match(/✅|🔲|🔄|❓|⏸️|⚠️|🔴/)) status = emojiToStatus(cell);
        else if (personMap.has(cell.toLowerCase())) owner = cell;
        else if (cell.length > 10) impact = cell;
      }
    } else {
      // Generic table - first significant column is the content
      raidCounters[raidType]++;
      const prefix = raidType[0].toUpperCase();
      displayId = `${prefix}${raidCounters[raidType]}`;
      title = (row[0] || row[1] || "").replace(/\*\*/g, "").trim();
      for (let i = 1; i < row.length; i++) {
        const cell = row[i] || "";
        if (cell.match(/critical|high|medium|low/i)) priority = cell.toLowerCase().trim();
        else if (cell.match(/✅|🔲|🔄|❓|⏸️|⚠️|🔴/)) status = emojiToStatus(cell);
        else if (findPerson(cell)) owner = cell;
        else if (cell.length > 15 && !impact) impact = cell;
      }
    }

    if (!title) continue;

    await supabase.from("raid_entries").insert({
      org_id: ORG_ID,
      raid_type: raidType,
      display_id: displayId,
      project_id: projectId,
      title,
      impact: impact || null,
      priority: guessPriority(priority),
      status: emojiToStatus(status),
      owner_id: findPerson(owner),
      vendor_id: findVendor(title),
    });
  }
}

// ── Step 6: Parse Silk and BenchPrep agendas → agenda_items ──────────────

async function seedAgendaItems() {
  console.log("Seeding agenda items...");

  // The Weekly Command Center has the most up-to-date vendor accountability
  // which essentially serves as agenda items
  const text = readMd("00_WeeklyCommandCenter.md");

  // Silk agenda items from critical path
  const silkVendorId = vendorMap.get("Silk Commerce");
  const bpVendorId = vendorMap.get("BenchPrep");

  if (silkVendorId) {
    // Key Silk agenda items
    const silkItems = [
      { title: "SUNY B2B login failure — repro case provided", severity: "critical" as const, context: "Multiple SUNY VTP users can't log in (11+ days). Stan provided repro case. John needs it to check logs.", ask: "John to check logs with repro case ES207@live.delhi.edu", priority: "critical" as const, escalation: 2, firstRaised: "2026-02-12" },
      { title: "Affirm rollout to VTP + Opto", severity: "high" as const, context: "Validated on VetPrep. Rollout needs China dev team. Target Feb 25. Lucas needs example transaction.", ask: "Confirm Feb 25 rollout date. Provide Lucas example transaction.", priority: "high" as const, escalation: 1, firstRaised: "2026-02-01" },
      { title: "30-day remediation plan overdue", severity: "critical" as const, context: "Matt requested EOD Feb 10. Not yet received.", ask: "Deliver detailed remediation plan with dates for all open items.", priority: "critical" as const, escalation: 3, firstRaised: "2026-02-10" },
      { title: "Companion course auto-provisioning", severity: "high" as const, context: "Elizabeth sent course IDs Feb 5. Yang/devs to implement T-MOD/Flashcards auto-provisioning.", ask: "Status on implementation. When will this be fixed?", priority: "high" as const, escalation: 2, firstRaised: "2026-02-04" },
      { title: "MakeSwift replacement decision", severity: "high" as const, context: "Bot detection was root cause. Fix deployed Feb 19. Replacement options: Builder.io vs pure Next.js.", ask: "Align on replacement timeline and approach.", priority: "high" as const, escalation: 0, firstRaised: "2026-02-11" },
      { title: "Self-service extensions / guarantee links", severity: "normal" as const, context: "Part 3 guarantee link and all guarantee links (VET + Opto) needed.", ask: "Status on guarantee link creation.", priority: "medium" as const, escalation: 1, firstRaised: "2026-02-04" },
    ];

    for (const item of silkItems) {
      await supabase.from("agenda_items").insert({
        org_id: ORG_ID,
        vendor_id: silkVendorId,
        title: item.title,
        severity: item.severity,
        context: item.context,
        ask: item.ask,
        priority: item.priority,
        escalation_count: item.escalation,
        first_raised_at: new Date(item.firstRaised + "T00:00:00Z").toISOString(),
      });
      console.log(`  Silk agenda: ${item.title.substring(0, 50)}`);
    }
  }

  if (bpVendorId) {
    const bpItems = [
      { title: "VP/VTP testing tools — full audit", severity: "high" as const, context: "Root cause identified: content setup gap. Julie re-enabled exams. Need BenchPrep to confirm full audit across all courses.", ask: "Confirm audit is complete and no other courses are missing tools.", priority: "high" as const, escalation: 1, firstRaised: "2026-02-13" },
      { title: "VP/VTP dual course provisioning", severity: "high" as const, context: "Users seeing only 1 of 2 courses (Study Review + Final Review). Product setup issue.", ask: "Root cause and fix timeline.", priority: "high" as const, escalation: 0, firstRaised: "2026-02-12" },
      { title: "BenchPrep Key Issues Document", severity: "normal" as const, context: "Elizabeth/Tim compiled system constraints vs fixable bugs.", ask: "Review document and classify items.", priority: "medium" as const, escalation: 0, firstRaised: "2026-02-13" },
      { title: "Android keyboard reversal (Chrome Custom Tabs)", severity: "normal" as const, context: "OneLogin ticket closed. BenchPrep to implement Chrome Custom Tabs fix.", ask: "Timeline for Chrome Custom Tabs implementation.", priority: "medium" as const, escalation: 0, firstRaised: "2026-02-01" },
      { title: "OneLogin multi-tenant auth loop", severity: "critical" as const, context: "SSO broken for multi-tenant users. PS engagement active with Arjun. Stan sending repro steps.", ask: "Status on Arjun's investigation and next session.", priority: "critical" as const, escalation: 2, firstRaised: "2026-01-26" },
      { title: "BP logout doesn't clear OneLogin state", severity: "high" as const, context: "Discovered Feb 23. Users can go back in without login after logout. Compounds SSO issues.", ask: "Is this a BenchPrep fix or OneLogin configuration?", priority: "high" as const, escalation: 0, firstRaised: "2026-02-23" },
    ];

    for (const item of bpItems) {
      await supabase.from("agenda_items").insert({
        org_id: ORG_ID,
        vendor_id: bpVendorId,
        title: item.title,
        severity: item.severity,
        context: item.context,
        ask: item.ask,
        priority: item.priority,
        escalation_count: item.escalation,
        first_raised_at: new Date(item.firstRaised + "T00:00:00Z").toISOString(),
      });
      console.log(`  BP agenda: ${item.title.substring(0, 50)}`);
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("Starting Edcetera data migration...\n");

  try {
    await seedOrg();
    await seedContacts();
    await seedProjects();
    await seedFromCommandCenter();
    await seedProjectDetails();
    await seedAgendaItems();

    console.log("\n✅ Migration complete!");
    console.log(`  Vendors: ${vendorMap.size}`);
    console.log(`  People: ${personMap.size}`);
    console.log(`  Projects: ${projectMap.size}`);
  } catch (err) {
    console.error("\n❌ Migration failed:", err);
    process.exit(1);
  }
}

main();
