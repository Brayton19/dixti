/**
 * Consolidation — one note replacing others, without rewriting anything.
 *
 * The store is append-only, so two notes stating one finding cannot be merged by editing either of
 * them. Instead the consolidating note carries `supersedes=<id>` and the notes it replaces are left
 * exactly where they are: `dixti dict` and `dixti search` stop showing them, `dixti show` still
 * resolves them and says what replaced them, and git still has every word.
 *
 * That keeps the invariant that makes `merge=union` safe — nothing is ever edited in place — while
 * still giving a store a way to stop growing two answers to one question.
 *
 * A superseding edge is the only link the format carries, and §5 of the spec rejects links in
 * general because a wrong edge is worse than no edge. This one earns its exception: it has exactly
 * one meaning, one consequence, and a bounded cost when wrong — the replaced note is hidden, not
 * lost, and pointing at the wrong id is undone by writing a note that supersedes nothing.
 *
 * Pure: takes notes, returns notes.
 */

import type { Note } from "./parse.js";

/** Every id claimed by some note's `supersedes`. */
export function supersededIds(notes: Note[]): Set<string> {
  const out = new Set<string>();
  for (const note of notes) for (const id of note.meta.supersedes) out.add(id);
  return out;
}

/**
 * The notes still worth showing.
 *
 * Chains collapse naturally: if C supersedes B and B supersedes A, both A and B are claimed, so only
 * C survives without any traversal.
 */
export function live(notes: Note[]): Note[] {
  const dead = supersededIds(notes);
  return notes.filter((n) => n.id === null || !dead.has(n.id));
}

/** The note that replaced this one, if any. `dixti show` uses it to point a reader forward. */
export function supersededBy(notes: Note[], id: string): Note | null {
  return notes.find((n) => n.meta.supersedes.includes(id)) ?? null;
}
