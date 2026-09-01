/** Reading a .agents/ store off disk. */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseNotes, type Note } from "./parse.js";

export const NOTES_DIR = ".agents/notes";
export const GITATTRIBUTES = ".gitattributes";

export function storeExists(root: string): boolean {
  return existsSync(join(root, ".agents"));
}

/**
 * Every markdown file under a directory, recursively, skipping dotfiles.
 *
 * `exclude` matches a basename exactly or by `_`-suffix, so one word covers `archive/`,
 * `archive.md` and `<project>_archive.md` alike — which is what keeps a single flag working as a
 * corpus grows new archives over time.
 */
export function markdownFiles(dir: string, exclude: string[] = []): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const base = e.name.replace(/\.md$/, "");
      if (exclude.some((x) => base === x || base.endsWith(`_${x}`))) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".md")) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

export function readNotes(root: string): Note[] {
  const dir = join(root, NOTES_DIR);
  return markdownFiles(dir).flatMap((f) => parseNotes(relative(root, f), readFileSync(f, "utf8")));
}
