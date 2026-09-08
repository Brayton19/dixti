/**
 * Held notes — what a refused write turns into instead of being lost.
 *
 * `dixti note` stops and asks when a note looks like one already in the store. That is only tolerable
 * because the note is not thrown away when it does: bodies are normally piped in on stdin at the end
 * of a session, so a rejected write with nowhere to land means the agent must reconstruct prose it
 * has already written, and the realistic outcome is that the note is simply never written.
 *
 * So the candidate is held on disk and re-offered by a short handle. The check can then be strict
 * without the strictness costing anything: a false positive is one more command, not a lost note.
 *
 * A held note is markdown in the note format, so it is readable — and repairable — with an editor,
 * and it parses with the parser that already exists rather than a second one.
 *
 * Pure: renders and parses text. The CLI owns the directory.
 */

import { parseNotes, renderNote } from "./parse.js";
import type { Candidate } from "./similar.js";

/**
 * Held notes are machine state, not project state — the same argument as the capture stamps. A
 * half-written note awaiting a decision says nothing about the repository and would only put churn
 * in front of a reviewer.
 */
export const PENDING_DIR = [".dixti", "pending"];

/** Long enough to survive a weekend, short enough that the directory does not become an archive. */
export const TTL_DAYS = 14;

export function renderPending(candidate: Candidate, date: string): string {
  return renderNote({
    id: null,
    heading: candidate.heading,
    body: candidate.body,
    meta: { topic: candidate.topic, date, supersedes: [], unknown: {}, line: null },
    file: "",
    line: 0,
  });
}

/** Read a held note back. Returns null when the file is not one — a stray file must not crash a write. */
export function parsePending(content: string): Candidate | null {
  const note = parseNotes("", content)[0];
  if (!note || !note.heading.trim() || !note.body.trim()) return null;
  return { heading: note.heading, body: note.body, topic: note.meta.topic ?? "general" };
}

export function isExpired(mtimeSeconds: number, now: number, ttlDays = TTL_DAYS): boolean {
  return now - mtimeSeconds > ttlDays * 86400;
}
