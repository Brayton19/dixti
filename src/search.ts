/**
 * Search: "is there already a note about this?"
 *
 * Deliberately lexical and deliberately small. It scores a note by where the query words appear —
 * heading and topic beat body, because a note's heading is written to be the thing you recognise it
 * by. There is no index, no stemming and no embeddings: a store of a few thousand one-line headings
 * is scanned faster than an index could be opened, and every result is explainable.
 *
 * This is a filter, not an oracle. It exists so an agent can decide *append to an existing topic or
 * start a new one*, and the agent reads the results itself.
 *
 * Pure: takes notes and a query, returns ranked notes.
 */

import type { Note } from "./parse.js";

export interface Hit {
  note: Note;
  score: number;
  /** Which query words matched, so a caller can say why a result is here. */
  matched: string[];
}

const STOP = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "of", "to", "in", "on", "for", "and", "or",
  "it", "its", "we", "i", "this", "that", "with", "as", "at", "by", "do", "does", "how", "what",
]);

export function terms(query: string): string[] {
  return [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9_.\-/]+/)
        .filter((w) => w.length > 1 && !STOP.has(w)),
    ),
  ];
}

const HEADING_WEIGHT = 4;
const TOPIC_WEIGHT = 3;
const BODY_WEIGHT = 1;

export function search(notes: Note[], query: string, limit = 10): Hit[] {
  const words = terms(query);
  if (words.length === 0) return [];

  const hits: Hit[] = [];
  for (const note of notes) {
    const heading = note.heading.toLowerCase();
    const topic = (note.meta.topic ?? "").toLowerCase();
    const body = note.body.toLowerCase();

    let score = 0;
    const matched: string[] = [];
    for (const w of words) {
      let s = 0;
      if (heading.includes(w)) s += HEADING_WEIGHT;
      if (topic.includes(w)) s += TOPIC_WEIGHT;
      if (body.includes(w)) s += BODY_WEIGHT;
      if (s > 0) {
        score += s;
        matched.push(w);
      }
    }
    // Reward covering more of the query rather than repeating one word: two distinct words matching
    // is a better answer than one word matching in three places.
    if (score > 0) hits.push({ note, score: score * (matched.length / words.length), matched });
  }

  return hits
    .sort((a, b) => b.score - a.score || a.note.heading.localeCompare(b.note.heading))
    .slice(0, limit);
}

export function renderHits(hits: Hit[], query: string): string {
  if (hits.length === 0) {
    return `No notes matching "${query}".\n\nNothing has been written about this. Write one with \`dixti note\`.\n`;
  }
  const out = [`${hits.length} note${hits.length === 1 ? "" : "s"} matching "${query}":`, ""];
  for (const h of hits) {
    out.push(`  ${h.note.id ?? "········"}  ${h.note.meta.topic ?? "—"}`);
    out.push(`            ${h.note.heading}`);
  }
  out.push("", "Read one in full with `dixti show <id>`.");
  return `${out.join("\n")}\n`;
}
