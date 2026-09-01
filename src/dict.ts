/**
 * The topic list — "what has anything been written about?"
 *
 * One line per note, `id · heading`, grouped by topic. An agent reads it and decides whether to open
 * something, search for something, or write something new. Over a token budget it collapses to topic
 * names with counts, and the agent expands the one it wants.
 *
 * Pure: takes notes, returns text.
 */

import type { Note } from "./parse.js";
import { topicFromPath } from "./adapt.js";

export interface Topic {
  name: string;
  notes: Note[];
}

export interface Dictionary {
  topics: Topic[];
  total: number;
  /** Rough token cost of listing every note. chars/4. */
  fullTokens: number;
}

export interface RenderOptions {
  /** Token ceiling. Over it, topics collapse to counts. */
  budget?: number;
  /** Expand only this topic. */
  topic?: string;
  /** Heading for the list. */
  title?: string;
  /**
   * The invocation that fetches a note from this corpus; `<id>` is substituted. The list has to tell
   * the reader how to act on it, so every flag that selected the corpus must round-trip into it.
   */
  showCmd?: string;
  /** True when topics were derived from file paths rather than authored. Worth telling the reader. */
  derivedTopics?: boolean;
}

const DEFAULT_TITLE = "Notes in this repo";
const DEFAULT_SHOW_CMD = "dixti show <id>";
const tokens = (s: string): number => Math.ceil(s.length / 4);

export function topicOf(note: Note): string {
  return note.meta.topic ?? topicFromPath(note.file);
}

function line(note: Note): string {
  return `  ${note.id ?? "········"}  ${note.heading}`;
}

export function buildDictionary(notes: Note[]): Dictionary {
  const byTopic = new Map<string, Note[]>();
  let fullTokens = 0;
  for (const note of notes) {
    fullTokens += tokens(line(note));
    const name = topicOf(note);
    const list = byTopic.get(name);
    if (list) list.push(note);
    else byTopic.set(name, [note]);
  }
  const topics = [...byTopic.entries()].map(([name, ns]) => ({ name, notes: ns }));
  topics.sort((a, b) => b.notes.length - a.notes.length || a.name.localeCompare(b.name));
  return { topics, total: notes.length, fullTokens };
}

export function renderDictionary(dict: Dictionary, opts: RenderOptions = {}): string {
  const showCmd = opts.showCmd ?? DEFAULT_SHOW_CMD;
  const searchCmd = showCmd.replace(/\bshow\b/, "search").replace("<id>", "<words>");
  const topicCmd = showCmd.replace(/\bshow\b/, "dict --topic").replace("<id>", "<name>");
  const out: string[] = [];

  if (opts.topic) {
    const topic = dict.topics.find((t) => t.name === opts.topic);
    if (!topic) return `dixti: no topic "${opts.topic}". Run \`dixti dict\` for the list.\n`;
    out.push(`# ${topic.name} — ${topic.notes.length} notes`, "");
    for (const n of topic.notes) out.push(line(n));
    out.push("", `Read one in full with \`${showCmd}\`.`);
    return `${out.join("\n")}\n`;
  }

  const budget = opts.budget ?? 4000;
  const collapse = dict.fullTokens > budget;
  // Over budget, spend what is left after the topic headers on sample headings. A bare topic name
  // carries almost no signal about what is inside it — measured at 12% of a topic's own notes even
  // sharing a word with its name — so a reader choosing between names alone is guessing. Three real
  // headings say what a name cannot, and cost a fraction of expanding everything.
  const samples = collapse ? samplesPerTopic(dict, budget) : 0;

  out.push(
    `# ${opts.title ?? DEFAULT_TITLE} — ${dict.total} notes`,
    "",
    collapse
      ? `Over budget, so each topic shows only ${samples > 0 ? `its first ${samples} note${samples === 1 ? "" : "s"}` : "a count"}. See all of one with \`${topicCmd}\`.`
      : `One line per note. Read one in full with \`${showCmd}\`.`,
    `Search across every note, shown or not: \`${searchCmd}\`.`,
    ...(opts.derivedTopics
      ? ["", "Topics here come from file paths, not from anyone choosing them, so a topic name may not describe what is inside it."]
      : []),
    "",
  );
  for (const topic of dict.topics) {
    out.push(`## ${topic.name}  (${topic.notes.length})`);
    const shown = collapse ? topic.notes.slice(0, samples) : topic.notes;
    for (const n of shown) out.push(line(n));
    const hidden = topic.notes.length - shown.length;
    if (collapse && hidden > 0) out.push(`    … ${hidden} more`);
    out.push("");
  }
  return `${out.join("\n").trimEnd()}\n`;
}

const HEADER_TOKENS = 12;
const MAX_SAMPLES = 3;

/**
 * How many notes each topic can show without exceeding the budget. Uniform rather than proportional:
 * a small topic is not less worth understanding than a large one, and the whole point of the sample
 * is to say what the topic is about.
 */
function samplesPerTopic(dict: Dictionary, budget: number): number {
  const overhead = dict.topics.length * HEADER_TOKENS + 120;
  const perNote = dict.total > 0 ? dict.fullTokens / dict.total : 20;
  const room = budget - overhead;
  if (room <= 0) return 0;
  for (let n = MAX_SAMPLES; n >= 1; n--) {
    const shown = dict.topics.reduce((a, t) => a + Math.min(n, t.notes.length), 0);
    if (shown * perNote <= room) return n;
  }
  return 0;
}
