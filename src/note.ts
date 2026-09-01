/**
 * Writing a note. Pure: decides what to write and where, the CLI performs the IO.
 *
 * Notes append to a topic file, one file per topic. That is the whole storage model, and it is what
 * makes the store mergeable: two agents writing different topics touch different files, and two
 * agents writing the same topic append to the end of one file under `merge=union`.
 */

import { renderNote, type Note } from "./parse.js";

export interface NoteInput {
  heading: string;
  body: string;
  topic: string;
  id: string;
  date: string;
}

export interface WritePlan {
  /** Repo-relative file to append to, created if absent. */
  path: string;
  /** Markdown to append. */
  content: string;
}

/** Topics are filenames, so they must survive being one. */
export function slugTopic(topic: string): string {
  return (
    topic
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "general"
  );
}

export function planNote(input: NoteInput): WritePlan {
  const note: Note = {
    id: input.id,
    heading: input.heading.trim(),
    body: input.body.trim(),
    meta: { topic: input.topic, date: input.date, unknown: {}, line: null },
    file: "",
    line: 0,
  };
  return {
    path: `.agents/notes/${slugTopic(input.topic)}.md`,
    content: `\n${renderNote(note)}`,
  };
}
