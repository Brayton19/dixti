/**
 * Markdown → notes. Pure: takes file contents, never touches the filesystem.
 *
 * A note is a `###` heading, an optional meta comment, and a body. That is the whole format; see
 * spec/FORMAT.md §2. Unknown meta keys are preserved rather than rejected, so a store written by a
 * newer version of dixti still parses here, and so the fields this version dropped do not break
 * notes already on disk.
 */

export interface Meta {
  /** Grouping for search and browse. Falls back to the file's basename. */
  topic: string | null;
  /** ISO date the note was written. */
  date: string | null;
  /** Keys this version does not know about, preserved verbatim. */
  unknown: Record<string, string>;
  /** 1-indexed line of the meta comment; null when the note has none. */
  line: number | null;
}

export interface Note {
  /** null when the heading carries no `<!--dx:id-->` comment. */
  id: string | null;
  heading: string;
  body: string;
  meta: Meta;
  /** Repo-relative file the note was read from. */
  file: string;
  /** 1-indexed line of the heading. */
  line: number;
}

const HEADING = /^(#{1,6})\s+(.*?)\s*$/;
const ID_COMMENT = /<!--\s*dx:([0-9a-f]{8})\s*-->/;
const META_COMMENT = /^<!--\s*dx\s+(.*?)\s*-->\s*$/;
const FENCE = /^\s*(```+|~~~+)/;

function emptyMeta(): Meta {
  return { topic: null, date: null, unknown: {}, line: null };
}

/**
 * `key=value`, whitespace-separated. Values may not contain whitespace — a path with a space would
 * otherwise silently split, which is a spec bug found the hard way in 0.1.0.
 */
export function parseMeta(raw: string, line: number): Meta {
  const meta = emptyMeta();
  meta.line = line;
  for (const token of raw.split(/\s+/).filter(Boolean)) {
    const eq = token.indexOf("=");
    if (eq <= 0) continue;
    const key = token.slice(0, eq);
    const value = token.slice(eq + 1);
    if (key === "topic") meta.topic = value;
    else if (key === "date") meta.date = value;
    else meta.unknown[key] = value;
  }
  return meta;
}

/**
 * Split a markdown file into notes.
 *
 * Fenced blocks are tracked because a note's body can contain fenced markdown that itself contains
 * `###` — the spec's own examples do — and a naive line scan invents notes out of documentation.
 */
export function parseNotes(file: string, content: string): Note[] {
  const lines = content.split("\n");
  const notes: Note[] = [];
  let current: Note | null = null;
  let body: string[] = [];
  let fence: string | null = null;

  const flush = (): void => {
    if (!current) return;
    current.body = body.join("\n").trim();
    notes.push(current);
    current = null;
    body = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    const fenceMatch = FENCE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1] ?? "";
      if (fence === null) fence = marker[0] ?? null;
      else if (marker[0] === fence) fence = null;
    }

    if (fence === null) {
      const heading = HEADING.exec(line);
      if (heading) {
        const level = (heading[1] ?? "").length;
        // A note is a level-3 heading. Anything shallower terminates the one in progress; `####`
        // and deeper are body content, which is how a note keeps its own sub-structure.
        if (level <= 3) {
          flush();
          if (level === 3) {
            const text = heading[2] ?? "";
            const id = ID_COMMENT.exec(text);
            current = {
              id: id?.[1] ?? null,
              heading: text.replace(ID_COMMENT, "").trim(),
              body: "",
              meta: emptyMeta(),
              file,
              line: i + 1,
            };
          }
          continue;
        }
      }

      if (current && body.length === 0) {
        const metaMatch = META_COMMENT.exec(line.trim());
        if (metaMatch) {
          current.meta = parseMeta(metaMatch[1] ?? "", i + 1);
          continue;
        }
      }
    }

    if (current) body.push(line);
  }

  flush();
  return notes;
}

/** Render a note back to markdown. Round-trips whatever `parseNotes` produced. */
export function renderNote(note: Note): string {
  const meta = [
    note.meta.topic ? `topic=${note.meta.topic}` : null,
    note.meta.date ? `date=${note.meta.date}` : null,
    ...Object.entries(note.meta.unknown).map(([k, v]) => `${k}=${v}`),
  ].filter(Boolean);

  const head = `### ${note.heading}${note.id ? ` <!--dx:${note.id}-->` : ""}`;
  const metaLine = meta.length ? `\n<!--dx ${meta.join(" ")}-->` : "";
  return `${head}${metaLine}\n\n${note.body}\n`;
}
