/**
 * `dixti init` — scaffold a store. Pure: returns the writes to perform, so the CLI does the IO and
 * the tests need no temp directory.
 */

import { INSTRUCTIONS_HEADING, agentInstructions } from "./instructions.js";

/**
 * Union merge is the whole multi-agent story. Two agents writing different topics touch different
 * files; two writing the same topic append to the end of one file and git keeps both sides. It is
 * safe only because notes are appended and never rewritten in place.
 */
export const GITATTRIBUTES_LINE = ".agents/notes/*.md   merge=union";

export interface FileWrite {
  path: string;
  content: string;
  /** append leaves existing content in place; create writes a new file. */
  mode: "create" | "append";
}

export interface InitPlan {
  dirs: string[];
  writes: FileWrite[];
  /** Things already correct, reported so `init` is legible when partly done. */
  skipped: string[];
}

const README = `# Notes

Shared notes written by agents working in this repo. One file per topic, one note per \`###\` heading.

    dixti dict              what has been written about
    dixti search <words>    is there already a note on this?
    dixti show <id>         read one in full
    dixti note              write a new one

Notes are appended, never rewritten — that is what makes concurrent writes merge cleanly.
`;

/**
 * `gitattributes` and `agentsMd` are current file contents, or null when the file does not exist.
 * Both are appended to rather than rewritten — they belong to the project, not to dixti.
 */
export function planInit(existing: {
  gitattributes: string | null;
  agentsMd?: string | null;
  bin?: string;
}): InitPlan {
  const writes: FileWrite[] = [];
  const skipped: string[] = [];

  writes.push({ path: ".agents/notes/README.md", content: README, mode: "create" });

  const attrs = existing.gitattributes ?? "";
  const path = GITATTRIBUTES_LINE.split(/\s+/)[0] ?? "";
  const present = attrs
    .split("\n")
    .some((l) => l.trim().startsWith(path) && /merge=union/.test(l));

  if (present) {
    skipped.push(".gitattributes already has the union-merge line");
  } else {
    // Appended, never rewritten: .gitattributes belongs to the project, not to dixti.
    const prefix = attrs && !attrs.endsWith("\n") ? "\n" : "";
    writes.push({
      path: ".gitattributes",
      content: `${prefix}\n# dixti: notes are append-only, so concurrent writes merge instead of conflicting\n${GITATTRIBUTES_LINE}\n`,
      mode: "append",
    });
  }

  // A store nobody's agent knows how to use is a CLI nobody remembers to run. AGENTS.md is the file
  // most hosts read by convention, so the instructions go there — appended, and skipped outright if
  // the block is already present, so re-running init never duplicates it.
  const agents = existing.agentsMd ?? null;
  if (agents !== null && agents.includes(INSTRUCTIONS_HEADING)) {
    skipped.push("AGENTS.md already has the dixti instructions");
  } else {
    const prefix = agents && !agents.endsWith("\n") ? "\n\n" : agents ? "\n" : "";
    writes.push({
      path: "AGENTS.md",
      content: `${prefix}${agentInstructions(existing.bin ?? "dixti")}`,
      mode: "append",
    });
  }

  return { dirs: [".agents/notes"], writes, skipped };
}
