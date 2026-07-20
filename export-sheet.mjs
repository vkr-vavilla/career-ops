#!/usr/bin/env node
// Read-only export: turns data/pipeline.md + data/applications.md into a single
// clean CSV for spreadsheet viewing. Never writes back to data/*.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(ROOT, "output");
const OUT_FILE = join(OUT_DIR, "job-search-sheet.csv");

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parsePipeline(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  const rows = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^-\s*\[( |x|X)\]\s*(.+)$/);
    if (!m) continue;
    const done = m[1].toLowerCase() === "x";
    if (done) continue; // already processed out of the inbox
    const parts = m[2].split("|").map((p) => p.trim());
    const [url, company = "", role = "", location = ""] = parts;
    rows.push({
      source: "pipeline",
      status: "Pending Review",
      score: "",
      company,
      role,
      location,
      url,
      date: "",
      notes: "",
    });
  }
  return rows;
}

function parseApplications(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  const rows = [];
  const lines = text.split("\n");
  let inTable = false;
  for (const line of lines) {
    if (/^\|\s*#\s*\|/.test(line)) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (/^\|\s*-+\s*\|/.test(line)) continue;
    if (!line.trim().startsWith("|")) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 9) continue;
    const [, date, company, role, score, status, , report, notes] = cells;
    const reportUrlMatch = (report || "").match(/\((.*?)\)/);
    rows.push({
      source: "applications",
      status: status || "",
      score: score || "",
      company: company || "",
      role: role || "",
      location: "",
      url: reportUrlMatch ? reportUrlMatch[1] : "",
      date: date || "",
      notes: notes || "",
    });
  }
  return rows;
}

const pipelinePath = join(ROOT, "data", "pipeline.md");
const applicationsPath = join(ROOT, "data", "applications.md");

const rows = [...parseApplications(applicationsPath), ...parsePipeline(pipelinePath)];

const header = ["Status", "Score", "Company", "Role", "Location", "Date", "URL / Report", "Notes"];
const lines = [header.join(",")];
for (const r of rows) {
  lines.push(
    [r.status, r.score, r.company, r.role, r.location, r.date, r.url, r.notes]
      .map(csvEscape)
      .join(","),
  );
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, lines.join("\n") + "\n", "utf8");

console.log(
  JSON.stringify(
    {
      written: OUT_FILE,
      rows: rows.length,
      pending: rows.filter((r) => r.source === "pipeline").length,
      tracked: rows.filter((r) => r.source === "applications").length,
    },
    null,
    2,
  ),
);
