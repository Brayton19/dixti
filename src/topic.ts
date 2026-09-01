/**
 * Topic names.
 *
 * A topic name is a retrieval surface, not a label. When a store outgrows its budget the reader sees
 * topic names and a few sample headings, and must choose a topic before seeing the rest — so a name
 * that does not say what is inside it costs real recall.
 *
 * This is not speculative. Measured over a 447-note corpus whose topics came from file names: only
 * **12%** of a topic's own notes shared any word with its topic name, twelve topics scored 0%, and
 * not one of fifteen paraphrased queries shared a word with the name of the topic holding its answer.
 * Names like "misc", "log" or "2026-07-31" are the ones that produce that.
 *
 * So `dixti note` checks a topic name and says what is wrong with it. It never refuses — the note is
 * always more valuable than the objection, and a tool that rejects writes gets worked around.
 *
 * Pure: takes a name and the existing topics, returns advice.
 */

/**
 * Names that describe the note's origin or nothing at all, rather than its subject. A reader
 * choosing between these learns nothing about what is inside.
 */
const UNINFORMATIVE = new Set([
  "misc", "miscellaneous", "other", "notes", "general", "stuff", "things", "temp", "tmp",
  "log", "logs", "session", "sessions", "journal", "diary", "scratch", "todo", "todos",
  "wip", "random", "various", "assorted", "untitled", "new", "test", "testing",
]);

export type TopicIssue =
  | { kind: "uninformative"; word: string }
  | { kind: "dated" }
  | { kind: "near-duplicate"; existing: string }
  | { kind: "too-long"; words: number };

export interface TopicAdvice {
  issues: TopicIssue[];
  /** An existing topic this probably belongs to, when one is close enough. */
  suggestion: string | null;
  /** True when nothing is wrong and the topic already exists. */
  existing: boolean;
}

const words = (s: string): string[] =>
  s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** A date in the name means the notes are filed by when they were written, not by what they are about. */
function looksDated(name: string): boolean {
  return /(^|[^0-9])(19|20)\d{2}([^0-9]|$)/.test(name) || /\b\d{4}[-_ ]\d{2}([-_ ]\d{2})?\b/.test(name);
}

/**
 * Two names are near-duplicates when one's words are a subset of the other's, or they differ only by
 * a plural. "billing" and "billings", or "auth" and "auth flow", split notes that belong together —
 * and a split topic is worse than a badly named one, because neither half looks complete.
 */
function nearDuplicate(a: string, b: string): boolean {
  const norm = (s: string) => new Set(words(s).map((w) => w.replace(/(ies|es|s)$/, "")));
  const [x, y] = [norm(a), norm(b)];
  if (x.size === 0 || y.size === 0) return false;
  if ([...x].every((w) => y.has(w))) return true;
  if ([...y].every((w) => x.has(w))) return true;
  return false;
}

export function adviseTopic(name: string, existingTopics: readonly string[]): TopicAdvice {
  const issues: TopicIssue[] = [];
  const w = words(name);

  const exact = existingTopics.find((t) => t.toLowerCase() === name.toLowerCase());
  if (exact) return { issues: [], suggestion: null, existing: true };

  const bad = w.find((x) => UNINFORMATIVE.has(x));
  if (bad) issues.push({ kind: "uninformative", word: bad });
  if (looksDated(name)) issues.push({ kind: "dated" });
  if (w.length > 4) issues.push({ kind: "too-long", words: w.length });

  const close = existingTopics.find((t) => nearDuplicate(name, t));
  if (close) issues.push({ kind: "near-duplicate", existing: close });

  return { issues, suggestion: close ?? null, existing: false };
}

export function renderAdvice(name: string, advice: TopicAdvice): string {
  if (advice.existing || advice.issues.length === 0) return "";
  const lines = [`  note: topic "${name}" —`];
  for (const issue of advice.issues) {
    switch (issue.kind) {
      case "uninformative":
        lines.push(`    "${issue.word}" says nothing about the subject. A reader picking between topic names sees only this.`);
        break;
      case "dated":
        lines.push(`    a date files notes by when they were written, not by what they are about.`);
        break;
      case "near-duplicate":
        lines.push(`    very close to the existing topic "${issue.existing}" — a split topic is worse than a badly named one.`);
        break;
      case "too-long":
        lines.push(`    ${issue.words} words is a heading, not a topic. Topics group; headings distinguish.`);
        break;
    }
  }
  return `${lines.join("\n")}\n`;
}
