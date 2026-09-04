/**
 * The write path — `dixti note` and `dixti topic merge`.
 *
 * Split from cli.ts because the write path grew the two operations that need care: a check that can
 * refuse, and the one command that rewrites files. Both do IO; every decision they make lives in a
 * pure module (`similar`, `pending`, `merge`, `note`, `topic`) so it is testable without a fixture
 * repository.
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { listFlag, flagValue, positional } from "./args.js";
import { topicOf } from "./dict.js";
import { newId } from "./id.js";
import { planNote } from "./note.js";
import { isExpired, parsePending, PENDING_DIR, renderPending, TTL_DAYS } from "./pending.js";
import { planMerge, renderPlan, topicPath } from "./merge.js";
import { blocking, duplicates, type Candidate, type Duplicate } from "./similar.js";
import { readNotes, storeExists } from "./store.js";
import { live } from "./supersede.js";
import { adviseTopic, renderAdvice } from "./topic.js";

const out = (s: string): void => void process.stdout.write(s);
const err = (s: string): void => void process.stderr.write(s);
const bin = (): string => process.env["DIXTI_BIN_NAME"] ?? "dixti";

// ------------------------------------------------------------------ held notes

const pendingDir = (): string => join(homedir(), ...PENDING_DIR);

function hold(candidate: Candidate, date: string): string {
  const dir = pendingDir();
  mkdirSync(dir, { recursive: true });
  const handle = newId();
  writeFileSync(join(dir, `${handle}.md`), renderPending(candidate, date));
  return handle;
}

function takeHeld(handle: string): Candidate | null {
  const path = join(pendingDir(), `${handle}.md`);
  if (!existsSync(path)) return null;
  return parsePending(readFileSync(path, "utf8"));
}

/** Held notes are a safety net, not an archive; an unresumed one is stale within a fortnight. */
function sweepHeld(): void {
  const dir = pendingDir();
  if (!existsSync(dir)) return;
  const now = Math.floor(Date.now() / 1000);
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    try {
      if (isExpired(Math.floor(statSync(path).mtimeMs / 1000), now)) rmSync(path);
    } catch {
      // A file that cannot be stat'ed or removed must not fail the write it was protecting.
    }
  }
}

// ------------------------------------------------------------------ note

function renderDuplicate(d: Duplicate): string {
  return `    ${d.note.id ?? "········"}  [${topicOf(d.note)}]  ${d.note.heading}\n`;
}

/**
 * What to print when the store already seems to hold this finding.
 *
 * The note is named, its topic is named, and both ways out are spelled as commands that can be run
 * verbatim — because the reader is usually an agent at the end of a session, and an instruction it
 * has to assemble is one it may not follow.
 */
function refusal(dupe: Duplicate, handle: string, candidate: Candidate): string {
  return [
    ``,
    `  NOT WRITTEN — this looks like a note the store already has (${dupe.score.toFixed(2)}):`,
    ``,
    renderDuplicate(dupe).trimEnd(),
    ``,
    `  Nothing was lost. Your note is held as ${handle}. Read the existing one first:`,
    ``,
    `    ${bin()} show ${dupe.note.id ?? "<id>"}`,
    ``,
    `  Then pick one:`,
    ``,
    `    ${bin()} note --resume ${handle} --supersedes ${dupe.note.id ?? "<id>"}`,
    `        they are one finding — write yours and retire that note`,
    ``,
    `    ${bin()} note --resume ${handle} --anyway`,
    `        they are different findings that happen to share wording`,
    ``,
    `  Held notes are discarded after ${TTL_DAYS} days. Topic: ${candidate.topic}`,
    ``,
  ].join("\n");
}

function readBody(args: string[]): string {
  const body = flagValue(args, "--body");
  if (body !== null) return body;
  return process.stdin.isTTY ? "" : readFileSync(0, "utf8");
}

export function cmdNote(args: string[], dir: string): number {
  if (!storeExists(dir)) {
    err(`dixti: no .agents/ in ${dir} — run \`${bin()} init\` first.\n`);
    return 1;
  }

  const handle = flagValue(args, "--resume");
  const supersedes = listFlag(args, "--supersedes");
  const anyway = args.includes("--anyway");

  let candidate: Candidate;
  if (handle) {
    const held = takeHeld(handle);
    if (!held) {
      err(`dixti: no held note "${handle}". It may have expired; write it again.\n`);
      return 1;
    }
    // A held note may be re-filed on resume, which is often the right answer to a duplicate report.
    candidate = { ...held, topic: flagValue(args, "--topic") ?? held.topic };
  } else {
    const topic = flagValue(args, "--topic");
    const heading = flagValue(args, "--heading");
    if (!topic || !heading) {
      err(`dixti: note needs --topic and --heading\n`);
      return 1;
    }
    const body = readBody(args);
    if (!body.trim()) {
      err(`dixti: note needs a body — pass --body or pipe one in\n`);
      return 1;
    }
    candidate = { heading, body, topic };
  }

  const existing = readNotes(dir);
  const visible = live(existing);

  // A typo in --supersedes would silently retire nothing, so it is checked rather than trusted.
  const unknown = supersedes.filter((id) => !existing.some((n) => n.id === id));
  if (unknown.length) {
    err(`dixti: no note with id ${unknown.join(", ")} — check \`${bin()} search\` or \`${bin()} dict\`.\n`);
    return 1;
  }

  const dupes = duplicates(visible, candidate);
  const blocked = anyway ? null : blocking(dupes, supersedes);
  if (blocked) {
    const held = handle ?? hold(candidate, new Date().toISOString().slice(0, 10));
    out(refusal(blocked, held, candidate));
    // Distinct from 1, which every other failure uses: this one is recoverable and says how.
    return 2;
  }

  const taken = new Set(existing.map((n) => n.id).filter((x): x is string => x !== null));
  const advice = adviseTopic(candidate.topic, [...new Set(visible.map(topicOf))]);
  const plan = planNote({
    ...candidate,
    id: newId(taken),
    date: new Date().toISOString().slice(0, 10),
    supersedes,
  });

  const abs = join(dir, plan.path);
  mkdirSync(dirname(abs), { recursive: true });
  appendFileSync(abs, plan.content);
  out(`  wrote  ${plan.path}\n`);

  if (supersedes.length) {
    out(`  retired  ${supersedes.join(", ")} — still on disk, no longer listed or searched\n`);
  }
  out(renderAdvice(candidate.topic, advice));

  // The warn band: not enough to stop a write, enough that a reader should know it exists.
  const remaining = dupes.filter((d) => !supersedes.includes(d.note.id ?? ""));
  if (remaining.length) {
    out(`\n  Similar notes already in the store:\n`);
    for (const d of remaining) out(renderDuplicate(d));
    out(`  If one of these is the same finding: ${bin()} note ... --supersedes <id>\n`);
  }

  if (handle) rmSync(join(pendingDir(), `${handle}.md`), { force: true });
  sweepHeld();
  return 0;
}

// ------------------------------------------------------------------ topic merge

/**
 * A topic merge is the only rewrite in dixti, so it is gated on git rather than on judgement: a
 * clean tree means the whole operation is one `git checkout` from undone, and that is what makes it
 * safe to do at all. Dry run by default for the same reason.
 */
function notesTreeState(dir: string): "clean" | "dirty" | "not-a-repo" {
  try {
    const status = execFileSync("git", ["status", "--porcelain", "--", ".agents/notes"], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return status.trim() ? "dirty" : "clean";
  } catch {
    return "not-a-repo";
  }
}

export function cmdTopic(args: string[], dir: string): number {
  const [sub, from, to] = positional(args);
  if (sub !== "merge") {
    err(`dixti: usage — ${bin()} topic merge <from> <to> [--yes]\n`);
    return 1;
  }
  if (!storeExists(dir)) {
    err(`dixti: no .agents/ in ${dir}\n`);
    return 1;
  }
  if (!from || !to) {
    err(`dixti: topic merge needs a source and a destination topic\n`);
    return 1;
  }

  const read = (p: string): string | null =>
    existsSync(join(dir, p)) ? readFileSync(join(dir, p), "utf8") : null;

  const result = planMerge({
    from,
    to,
    fromContent: read(topicPath(from)),
    toContent: read(topicPath(to)),
  });
  if (!result.ok) {
    err(`dixti: ${result.error}\n`);
    return 1;
  }

  const apply = args.includes("--yes");
  const state = notesTreeState(dir);
  if (apply && state === "dirty") {
    err(
      `dixti: .agents/notes has uncommitted changes.\n` +
        `       A topic merge rewrites files — the only operation in dixti that does. Commit first,\n` +
        `       so it lands in its own commit and \`git checkout\` undoes it.\n`,
    );
    return 1;
  }
  if (apply && state === "not-a-repo") {
    err(`dixti: ${dir} is not a git repository — a topic merge rewrites files and would not be undoable.\n`);
    return 1;
  }

  out(renderPlan(result.plan, apply));
  if (!apply) {
    out(`\n  Dry run. Re-run with --yes to apply.\n`);
    return 0;
  }

  writeFileSync(join(dir, result.plan.write.path), result.plan.write.content);
  rmSync(join(dir, result.plan.delete), { force: true });
  out(`\n  Review with \`git diff\`; undo with \`git checkout -- .agents/notes\`.\n`);
  return 0;
}
