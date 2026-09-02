#!/usr/bin/env node
/** dixti CLI. Thin wrappers over the pure modules; see spec/FORMAT.md for the format. */

import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";

import { adaptFile } from "./adapt.js";
import { capturePrompt, shouldCapture } from "./capture.js";
import { agentInstructions } from "./instructions.js";
import { buildDictionary, renderDictionary, topicOf } from "./dict.js";
import { newId } from "./id.js";
import { planInit } from "./init.js";
import { planNote } from "./note.js";
import type { Note } from "./parse.js";
import { renderHits, search } from "./search.js";
import { adviseTopic, renderAdvice } from "./topic.js";
import { markdownFiles, readNotes, storeExists } from "./store.js";

const USAGE = `dixti — what the agents learned

usage:
  dixti dict   [dir] [--topic <name>] [--budget N] [--title <text>]
  dixti search <words...>
  dixti show   <id>
  dixti note   --topic <name> --heading <text> [--body <text>]
  dixti capture [--session <id>] [--throttle N] [--force] [--json]
  dixti init   [dir]
  dixti instructions

  dict           every note as one line, grouped by topic
  search         is there already a note about this?
  show           read one note in full
  note           write a new note; body is read from stdin when --body is omitted
  capture        print the instruction that asks an agent to write a note, if it is worth asking.
                 Exits 1 and prints nothing when it is not. Wire this into whatever your agent
                 runs at session end — see hooks/README.md. --json reports the decision instead.
  init           scaffold .agents/notes/, the union-merge line, and AGENTS.md instructions
  instructions   print the agent instructions, to paste into whatever file your tools read

reading another corpus (any tree of ### markdown, e.g. an existing notes repo):
  --adapt <dir>       read that instead of this repo's store
  --exclude <names>   directory or file basenames to skip, e.g. archive
  --dir <dir>         store root; defaults to the working directory
  --title <text>      heading for the list; name the corpus when injecting more than one
`;

function flagValue(args: string[], name: string): string | null {
  const i = args.indexOf(name);
  return i >= 0 ? (args[i + 1] ?? null) : null;
}

const VALUE_FLAGS = ["--topic", "--budget", "--adapt", "--exclude", "--dir", "--heading", "--body", "--title",
  "--session", "--throttle"];

function positional(args: string[]): string[] {
  const skip = new Set<number>();
  args.forEach((a, i) => {
    if (VALUE_FLAGS.includes(a)) skip.add(i + 1);
  });
  return args.filter((a, i) => !a.startsWith("--") && !skip.has(i));
}

function excludeList(args: string[]): string[] {
  return (flagValue(args, "--exclude") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
}

function root(args: string[]): string {
  return flagValue(args, "--dir") ?? process.cwd();
}

/** The invocation a reader must type to act on whatever corpus this call selected. */
function corpusFlags(args: string[]): string {
  const adapt = flagValue(args, "--adapt");
  if (!adapt) return "";
  const exclude = excludeList(args);
  return ` --adapt ${adapt}${exclude.length ? ` --exclude ${exclude.join(",")}` : ""}`;
}

/** Load from either this repo's store or, with --adapt, any tree of `###` markdown. */
function load(args: string[]): Note[] {
  const adapt = flagValue(args, "--adapt");
  if (!adapt) return readNotes(root(args));

  const exclude = excludeList(args);
  const dirs = adapt.split(",").map((d) => d.trim()).filter(Boolean);
  const base = dirs.length === 1 ? dirs[0] ?? "" : "";
  return dirs
    .flatMap((d) => markdownFiles(d, exclude))
    .flatMap((f) => adaptFile(base ? relative(base, f) : f, readFileSync(f, "utf8")));
}

// ------------------------------------------------------------------ init

function cmdInit(args: string[]): number {
  const dir = positional(args)[0] ?? root(args);
  if (storeExists(dir)) {
    process.stderr.write(`dixti: ${join(dir, ".agents")} already exists — nothing to do.\n`);
    return 1;
  }

  const read = (f: string): string | null =>
    existsSync(join(dir, f)) ? readFileSync(join(dir, f), "utf8") : null;
  const plan = planInit({
    gitattributes: read(".gitattributes"),
    agentsMd: read("AGENTS.md"),
    bin: process.env["DIXTI_BIN_NAME"] ?? "dixti",
  });

  for (const d of plan.dirs) mkdirSync(join(dir, d), { recursive: true });
  for (const w of plan.writes) {
    const abs = join(dir, w.path);
    mkdirSync(dirname(abs), { recursive: true });
    if (w.mode === "append" && existsSync(abs)) appendFileSync(abs, w.content);
    else writeFileSync(abs, w.content);
    process.stdout.write(`  ${w.mode === "append" ? "updated" : "created"}  ${w.path}\n`);
  }
  for (const note of plan.skipped) process.stdout.write(`  ok       ${note}\n`);

  process.stdout.write(
    `\nStore ready. Your agents now have instructions in AGENTS.md; if your tools read a different\n` +
      `file, \`dixti instructions\` prints the same block to paste in.\n`,
  );
  return 0;
}

function cmdInstructions(): number {
  process.stdout.write(agentInstructions(process.env["DIXTI_BIN_NAME"] ?? "dixti"));
  return 0;
}

// ------------------------------------------------------------------ dict / search / show

function cmdDict(args: string[]): number {
  const notes = load(args);
  if (notes.length === 0) {
    process.stderr.write(`dixti: no notes yet. Write one with \`dixti note\`.\n`);
    return 1;
  }
  const budget = flagValue(args, "--budget");
  const opts = {
    budget: budget ? Number(budget) : 4000,
    topic: flagValue(args, "--topic") ?? undefined,
    // Without this, two lists injected into one session are both headed "Notes in this repo".
    title: flagValue(args, "--title") ?? undefined,
    showCmd: `dixti show <id>${corpusFlags(args)}`,
    derivedTopics: flagValue(args, "--adapt") !== null,
  };
  const dict = buildDictionary(notes);
  process.stdout.write(renderDictionary(dict, opts));
  if (!opts.topic) {
    process.stderr.write(
      `\n[${dict.total} notes · ${dict.topics.length} topics · ~${dict.fullTokens.toLocaleString()} tokens listed in full]\n`,
    );
  }
  return 0;
}

function cmdSearch(args: string[]): number {
  const query = positional(args).join(" ");
  if (!query) {
    process.stderr.write(`dixti: search needs something to search for\n`);
    return 1;
  }
  const hits = search(load(args), query);
  process.stdout.write(renderHits(hits, query));
  // Exit 1 on no match, so a script can branch on "nothing written about this yet".
  return hits.length ? 0 : 1;
}

function cmdShow(args: string[]): number {
  const id = positional(args)[0];
  if (!id) {
    process.stderr.write(`dixti: show needs a note id\n`);
    return 1;
  }
  const note = load(args).find((n) => n.id === id);
  if (!note) {
    process.stderr.write(`dixti: no note "${id}". Run \`dixti dict\` to see what exists.\n`);
    return 1;
  }
  process.stdout.write(`${note.heading}\n`);
  process.stdout.write(`${"-".repeat(Math.min(note.heading.length, 78))}\n`);
  process.stdout.write(
    `${[`id ${note.id}`, `topic ${topicOf(note)}`, note.meta.date ? `date ${note.meta.date}` : null, `source ${note.file}:${note.line}`]
      .filter(Boolean)
      .join("  ·  ")}\n\n`,
  );
  process.stdout.write(`${note.body}\n`);
  return 0;
}

// ------------------------------------------------------------------ note

function cmdNote(args: string[]): number {
  const dir = root(args);
  if (!storeExists(dir)) {
    process.stderr.write(`dixti: no .agents/ in ${dir} — run \`dixti init\` first.\n`);
    return 1;
  }

  const topic = flagValue(args, "--topic");
  const heading = flagValue(args, "--heading");
  if (!topic || !heading) {
    process.stderr.write(`dixti: note needs --topic and --heading\n`);
    return 1;
  }

  // The body is read from stdin when not given inline, because a note body is usually longer than a
  // shell argument wants to be and often contains quotes.
  let body = flagValue(args, "--body");
  if (body === null) {
    body = process.stdin.isTTY ? "" : readFileSync(0, "utf8");
  }
  if (!body.trim()) {
    process.stderr.write(`dixti: note needs a body — pass --body or pipe one in\n`);
    return 1;
  }

  const existing = readNotes(dir);
  const taken = new Set(existing.map((n) => n.id).filter((x): x is string => x !== null));

  // A topic name is a retrieval surface: over budget the reader picks a topic before seeing most
  // headings. Say what is wrong with a bad one, but never refuse — the note is worth more than the
  // objection, and a tool that blocks writes gets worked around.
  const advice = adviseTopic(topic, [...new Set(existing.map(topicOf))]);
  const plan = planNote({
    heading,
    body,
    topic,
    id: newId(taken),
    date: new Date().toISOString().slice(0, 10),
  });

  const abs = join(dir, plan.path);
  mkdirSync(dirname(abs), { recursive: true });
  appendFileSync(abs, plan.content);
  process.stdout.write(`  wrote  ${plan.path}\n`);
  process.stdout.write(renderAdvice(topic, advice));

  // A near-duplicate is worth surfacing after the write rather than blocking it: the note is already
  // safe in the file, and the author can supersede it by hand if it really is the same thing.
  const similar = search(existing, heading, 3).filter((h) => h.score >= 4);
  if (similar.length) {
    process.stdout.write(`\nSimilar notes already existed:\n`);
    for (const h of similar) process.stdout.write(`  ${h.note.id}  ${h.note.heading}\n`);
  }
  return 0;
}

// ------------------------------------------------------------------ capture

/**
 * Per-session prompt stamps. Machine-global rather than in the repo: which session last asked is a
 * fact about this machine, not about the project, and writing it into the repo would put churn in
 * front of a reviewer for no benefit.
 */
function stampPath(session: string): string {
  const safe = session.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 96) || "default";
  return join(homedir(), ".dixti", "capture", safe);
}

function mtimeSeconds(path: string): number | null {
  try {
    return Math.floor(statSync(path).mtimeMs / 1000);
  } catch {
    return null;
  }
}

/** Newest mtime across the store's note files, or null when there are none. */
function lastNoteAt(dir: string): number | null {
  const files = markdownFiles(join(dir, ".agents", "notes"));
  let newest: number | null = null;
  for (const f of files) {
    const t = mtimeSeconds(f);
    if (t !== null && (newest === null || t > newest)) newest = t;
  }
  return newest;
}

function cmdCapture(args: string[]): number {
  const dir = root(args);
  const session = flagValue(args, "--session") ?? "default";
  const throttleArg = flagValue(args, "--throttle");
  const stamp = stampPath(session);

  const decision = args.includes("--force")
    ? { shouldPrompt: true, explanation: "--force" }
    : shouldCapture({
        storeExists: existsSync(join(dir, ".agents", "notes")),
        lastPromptAt: mtimeSeconds(stamp),
        lastNoteAt: lastNoteAt(dir),
        now: Math.floor(Date.now() / 1000),
        throttleSeconds: throttleArg ? Number(throttleArg) : 1800,
      });

  const bin = process.env["DIXTI_BIN_NAME"] ?? "dixti";
  if (args.includes("--json")) {
    process.stdout.write(
      `${JSON.stringify({ ...decision, prompt: decision.shouldPrompt ? capturePrompt(bin) : null })}\n`,
    );
    return 0;
  }

  if (!decision.shouldPrompt) return 1;

  // Stamp before printing: the capture turn itself must not re-trigger the prompt.
  mkdirSync(dirname(stamp), { recursive: true });
  writeFileSync(stamp, "");
  process.stdout.write(`${capturePrompt(bin)}\n`);
  return 0;
}

// ------------------------------------------------------------------ main

function main(argv: string[]): number {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h") {
    process.stdout.write(USAGE);
    return command ? 0 : 1;
  }
  switch (command) {
    case "dict":
      return cmdDict(rest);
    case "search":
      return cmdSearch(rest);
    case "show":
      return cmdShow(rest);
    case "note":
      return cmdNote(rest);
    case "capture":
      return cmdCapture(rest);
    case "init":
      return cmdInit(rest);
    case "instructions":
      return cmdInstructions();
    default:
      process.stderr.write(`dixti: unknown command "${command}"\n\n${USAGE}`);
      return 1;
  }
}

process.exit(main(process.argv.slice(2)));
