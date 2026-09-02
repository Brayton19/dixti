/**
 * The instructions an agent needs in order to use the store.
 *
 * `dixti capture` tells an agent what to do at the *end* of a session, and only if someone wired a
 * stop hook. Nothing tells it what to do during one — and the behaviour that makes the store worth
 * having is a reading habit, not a writing one: search before concluding that something is
 * undocumented. An agent will not infer that from `--help`.
 *
 * So dixti owns this text and the host decides where it goes. `dixti init` appends it to `AGENTS.md`,
 * which most agent hosts read by convention; `dixti instructions` prints it for anyone whose host
 * reads something else.
 *
 * Keep it short. It is loaded into every session that reads the file, so every sentence competes with
 * the user's own instructions for attention.
 *
 * Pure: returns a string.
 */

/** The marker that makes appending idempotent — the block is recognisable without parsing it. */
export const INSTRUCTIONS_HEADING = "## Notes from earlier sessions (dixti)";

export function agentInstructions(bin = "dixti"): string {
  return `${INSTRUCTIONS_HEADING}

This repository has a shared store of notes: things agents worked out before that are not obvious
from the code. It is in \`.agents/notes/\`, and it is plain markdown.

**Before concluding that something is undocumented or unknown, look:**

    ${bin} search <words>      is there already a note on this?
    ${bin} dict               every note as one line, grouped by topic
    ${bin} show <id>          read one in full

**When you work something out that a future session would want and could not cheaply rediscover,
write it down:**

    ${bin} note --topic <topic> --heading <a sentence stating the finding> --body <the detail>

Search first. If a note already covers it, do not write a second one. Most sessions learn nothing
worth recording and that is the normal outcome — a store padded with narration is worse than an
empty one.

**The heading is the whole product.** It is the only line most readers ever see, in the topic list
and in every search result, so write it as a sentence that states the finding and use the words
someone would search for. "Billing notes" is not a heading. "Refunds re-enter the ledger as a second
positive row" is.
`;
}
