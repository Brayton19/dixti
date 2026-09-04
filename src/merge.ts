/**
 * Folding one topic into another.
 *
 * This is the one operation in dixti that rewrites files, and it therefore breaks the invariant that
 * everything else depends on: notes are appended, never rewritten, which is what makes `merge=union`
 * safe. The exception is deliberate and narrow, and it rests on a distinction the rest of the tool
 * does not need to make.
 *
 * **Append-only binds the agent write path.** Its purpose is that two agents writing at the same
 * time, on diverged branches, merge instead of conflicting — and an agent writing a note has no idea
 * what else is happening in the repository. A topic merge is not that: it is a maintenance operation
 * a person runs deliberately, on a clean tree, in its own commit, having looked at both topics. The
 * CLI enforces exactly that (clean tree, dry run by default) so the rewrite is always one `git
 * checkout` from undone.
 *
 * What it is for: two names for one subject — "billing" and "billings", "auth" and "auth flow". That
 * is not the same problem as two notes stating one finding, which `supersedes` handles without any
 * rewrite. Nothing here consolidates notes; every note survives with its id, heading, body and date
 * untouched. Only the topic changes, and only where it was written down explicitly.
 *
 * Pure: takes file contents, returns the writes and deletes they imply.
 */

import { slugTopic } from "./note.js";
import { parseNotes } from "./parse.js";

export interface MergeInput {
  from: string;
  to: string;
  /** Raw text of the source topic file, or null when there is no such topic. */
  fromContent: string | null;
  /** Raw text of the destination topic file, or null when it does not exist yet. */
  toContent: string | null;
}

export interface MergePlan {
  fromPath: string;
  toPath: string;
  /** Headings being moved, for the plan the user reads before confirming. */
  moved: string[];
  /** How many of those carried an explicit `topic=` that had to be rewritten. */
  rewritten: number;
  write: { path: string; content: string };
  delete: string;
}

export type MergeResult = { ok: true; plan: MergePlan } | { ok: false; error: string };

export const topicPath = (topic: string): string => `.agents/notes/${slugTopic(topic)}.md`;

/**
 * Retopic the source text, then concatenate.
 *
 * Deliberately a line rewrite over the original text rather than a re-render of parsed notes:
 * re-rendering would silently drop anything the parser does not model — a preamble above the first
 * note, unusual spacing, a hand-written section — and a maintenance command that quietly discards
 * content is worse than no maintenance command.
 */
export function planMerge(input: MergeInput): MergeResult {
  const { from, to, fromContent, toContent } = input;

  if (!from || !to) return { ok: false, error: "merge needs a source and a destination topic" };
  if (slugTopic(from) === slugTopic(to)) {
    return { ok: false, error: `"${from}" and "${to}" are the same topic` };
  }
  if (fromContent === null) {
    return { ok: false, error: `no topic "${from}" — run \`dixti dict\` to see what exists` };
  }

  const notes = parseNotes(topicPath(from), fromContent);
  if (notes.length === 0) {
    return { ok: false, error: `"${from}" holds no notes` };
  }

  const lines = fromContent.split("\n");
  let rewritten = 0;
  for (const note of notes) {
    // Only an explicit `topic=` needs changing. A note without one takes its topic from the file's
    // basename, so moving the text into the destination file is the whole rename for it.
    if (note.meta.line === null || note.meta.topic !== from) continue;
    const i = note.meta.line - 1;
    const line = lines[i];
    if (line === undefined) continue;
    lines[i] = line.replace(`topic=${from}`, `topic=${to}`);
    rewritten++;
  }

  const moved = `${lines.join("\n").trim()}\n`;
  const existing = toContent?.trim();

  return {
    ok: true,
    plan: {
      fromPath: topicPath(from),
      toPath: topicPath(to),
      moved: notes.map((n) => n.heading),
      rewritten,
      write: { path: topicPath(to), content: existing ? `${existing}\n\n${moved}` : moved },
      delete: topicPath(from),
    },
  };
}

export function renderPlan(plan: MergePlan, applied: boolean): string {
  const out = [
    applied ? `  merged   ${plan.fromPath} → ${plan.toPath}` : `  would merge  ${plan.fromPath} → ${plan.toPath}`,
    "",
  ];
  for (const h of plan.moved) out.push(`    ${h}`);
  out.push(
    "",
    `  ${plan.moved.length} note${plan.moved.length === 1 ? "" : "s"} moved, ${plan.rewritten} topic line${plan.rewritten === 1 ? "" : "s"} rewritten, ${plan.delete} removed.`,
    `  Ids, headings, bodies and dates are unchanged.`,
  );
  return `${out.join("\n")}\n`;
}
