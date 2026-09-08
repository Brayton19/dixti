/**
 * Near-duplicate detection — "has this already been written down?"
 *
 * This is not `search`, and the difference matters. `search` scores *does this note answer a
 * question*: it scales by the fraction of the query that matched, because a question is a short,
 * possibly half-remembered handful of words. Duplicate detection asks *are these two notes the same
 * thing*, which is symmetric — neither side is a query — and the comparison runs on the candidate's
 * full text rather than someone's recollection of it.
 *
 * That distinction is why this problem is tractable where search recall is not. Lexical search
 * measured 6/15 on paraphrased queries, and reweighting the fields moved that by one, so ranking is
 * not where the loss is. But a duplicate check does not depend on anyone phrasing the question well:
 * the query *is* the note being written, which is the richest input the tool will ever get.
 *
 * Dice on term sets, headings weighted over bodies. Symmetric, bounded 0–1, and explainable — a
 * caller can print exactly which words two notes share.
 *
 * Pure: takes notes and a candidate, returns matches.
 */

import type { Note } from "./parse.js";
import { terms } from "./search.js";
import { topicOf } from "./dict.js";

export interface Candidate {
  heading: string;
  body: string;
  topic: string;
}

export interface Duplicate {
  note: Note;
  /** 0–1. See THRESHOLDS below for what the bands mean. */
  score: number;
  /** Heading words the two notes share, so a caller can say why this is here. */
  shared: string[];
}

/**
 * Above CONFIRM, `dixti note` will not write until it is told which note this replaces or that they
 * are different. Above WARN, it writes and says what it saw.
 *
 * Measured leave-one-out over a real 467-note corpus — every note re-offered as if it were being
 * written against the other 466:
 *
 *   CONFIRM 0.50  blocks 1 write in 27. Of the nine distinct pairs it caught, two were genuine
 *                 duplicates and seven were *parallel work* — the same analysis run for Paris and
 *                 for Belgium, three reviews of different artefacts on one day.
 *   WARN    0.40  shows a line on 1 write in 10. At 0.28 it fired on one in four, which is the rate
 *                 at which a warning stops being read (see the same argument in capture.ts).
 *
 * **Lexical similarity cannot separate "written twice" from "the same analysis, different subject."**
 * The highest-scoring pair in the corpus (0.838, identical headings) is two different cities, and it
 * scores above every true duplicate. So the precision at CONFIRM is ~22% and no threshold fixes it:
 * the false positives are genuinely more alike, textually, than the true positives.
 *
 * The bands are therefore set for **recall**, and the agent adjudicates — which is the same division
 * of labour as search ("a filter, not an oracle"). It is affordable only because a blocked note is
 * stashed rather than discarded, so a false positive costs one command and a duplicate that slips
 * through costs a reader forever. Asymmetric, so err towards asking.
 *
 * Caveat on the measurement: that corpus is adapted markdown with templated section headings, not a
 * native store whose headings are standalone sentences. Native-store precision is probably better
 * and is unmeasured.
 */
export const CONFIRM = 0.5;
export const WARN = 0.4;

/** Heading over body: two notes stating one finding almost always collide in the heading first. */
const HEADING_WEIGHT = 0.7;
const BODY_WEIGHT = 0.3;

/** 2|A∩B| / (|A|+|B|). Symmetric, and kinder than Jaccard to short sets like a heading. */
function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const x of a) if (b.has(x)) shared++;
  return (2 * shared) / (a.size + b.size);
}

/**
 * A leading section number is structure, not subject. Two documents analysing different cities under
 * the same outline collide on "3.1" and "6.7" for reasons that say nothing about what they contain —
 * measured as the single largest source of false matches on a 467-note corpus.
 */
const SECTION_NUMBER = /^\s*\d+(\.\d+)*\.?\s+/;

const setOf = (s: string): Set<string> => new Set(terms(s.replace(SECTION_NUMBER, "")));

/**
 * How alike two pieces of note-shaped text are, 0–1.
 *
 * Exported so the thresholds can be re-measured against a real corpus rather than argued about.
 */
export function similarity(a: Candidate, b: Candidate): number {
  return score(a, b).score;
}

interface Scored {
  score: number;
  /** Heading terms the two share. Dice over-rewards very short headings, so callers gate on this. */
  shared: string[];
}

function score(a: Candidate, b: Candidate): Scored {
  const [ha, hb] = [setOf(a.heading), setOf(b.heading)];
  const shared = [...ha].filter((w) => hb.has(w));
  return {
    score: HEADING_WEIGHT * dice(ha, hb) + BODY_WEIGHT * dice(setOf(a.body), setOf(b.body)),
    shared,
  };
}

/**
 * Existing notes that may be the same finding as `candidate`, worst-first-excluded and best first.
 *
 * Topic is deliberately not part of the score. A duplicate filed under a *different* topic name is
 * the split-topic case, and it is the one worth catching most — scoring same-topic pairs higher
 * would hide exactly that.
 */
export function duplicates(notes: Note[], candidate: Candidate, limit = 3): Duplicate[] {
  const out: Duplicate[] = [];

  for (const note of notes) {
    const s = score(candidate, { heading: note.heading, body: note.body, topic: topicOf(note) });
    if (s.score < WARN) continue;
    out.push({ note, score: s.score, shared: s.shared });
  }

  return out
    .sort((a, b) => b.score - a.score || a.note.heading.localeCompare(b.note.heading))
    .slice(0, limit);
}

/** Below this many shared heading words, a high score is Dice flattering a very short heading. */
const MIN_SHARED = 2;

/**
 * The strongest match, when it is strong enough that the write should stop and ask.
 *
 * Two gates, not one: a score, and an absolute count of shared heading words. "THE GAP" and "Open
 * gap" share exactly one word and score 0.47 purely because both headings are two words long.
 *
 * `resolved` is the ids the author has already said this note replaces. Naming one is an answer to
 * the question, so it stops being asked — but only for that note, since consolidating one duplicate
 * says nothing about a second.
 */
export function blocking(dupes: Duplicate[], resolved: readonly string[] = []): Duplicate | null {
  return (
    dupes.find(
      (d) =>
        d.score >= CONFIRM &&
        d.shared.length >= MIN_SHARED &&
        !(d.note.id !== null && resolved.includes(d.note.id)),
    ) ?? null
  );
}
