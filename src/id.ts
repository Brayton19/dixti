/** Note ids: 8 lowercase hex characters, random. spec/FORMAT.md §2.1. */

import { randomBytes } from "node:crypto";

/** An id not already present in `taken`, mutating `taken`. */
export function newId(taken: Set<string> = new Set()): string {
  for (;;) {
    const id = randomBytes(4).toString("hex");
    if (!taken.has(id)) {
      taken.add(id);
      return id;
    }
  }
}
