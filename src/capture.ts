/**
 * Capture — the write trigger.
 *
 * Notes do not get written because an agent remembers to write them; something has to ask. Every
 * agent host has some way to run a command when a session ends, and they all differ: Claude Code
 * wants a JSON envelope with `decision: "block"`, others want plain text on stdout, an exit code, or
 * a file. What must NOT differ is *what gets asked* and *when it is worth asking*.
 *
 * So both live here, in dixti, and a host adapter is a few lines that reshape the output. Putting
 * the prompt in a shell hook would mean every host reimplements the part that decides whether the
 * store is worth having.
 *
 * Pure: takes the state of the world, returns a decision. The CLI does the stat-ing and stamping.
 */

export interface CaptureState {
  /** Does a store exist to capture into? */
  storeExists: boolean;
  /** Unix seconds of the last prompt for this session, or null if never prompted. */
  lastPromptAt: number | null;
  /** Unix seconds a note was last written, or null when the store is empty. */
  lastNoteAt: number | null;
  /** Now, in unix seconds. */
  now: number;
  /** Minimum seconds between prompts for one session. */
  throttleSeconds: number;
}

export type SkipReason = "no-store" | "throttled" | "already-captured";

export interface CaptureDecision {
  shouldPrompt: boolean;
  /** Set when shouldPrompt is false. */
  skipReason?: SkipReason;
  /** Human-readable, for adapters that log. */
  explanation: string;
}

/**
 * Whether to ask for a note.
 *
 * Every ambiguous case declines. A prompt that fires when there is nothing to say — or twice for one
 * piece of work — trains the agent to skip it and the user to uninstall the hook, and a capture
 * trigger nobody runs is worth less than none at all.
 */
export function shouldCapture(state: CaptureState): CaptureDecision {
  if (!state.storeExists) {
    return {
      shouldPrompt: false,
      skipReason: "no-store",
      explanation: "no .agents/notes/ — asking for a note with nowhere to put it teaches the agent to ignore the prompt",
    };
  }

  if (state.lastPromptAt !== null) {
    // A note written since the last prompt means the agent already did this. Checked before the
    // throttle so that capturing promptly is never punished by being asked again.
    if (state.lastNoteAt !== null && state.lastNoteAt >= state.lastPromptAt) {
      return {
        shouldPrompt: false,
        skipReason: "already-captured",
        explanation: "a note was written since the last prompt",
      };
    }
    const elapsed = state.now - state.lastPromptAt;
    if (elapsed < state.throttleSeconds) {
      return {
        shouldPrompt: false,
        skipReason: "throttled",
        explanation: `asked ${elapsed}s ago; throttle is ${state.throttleSeconds}s`,
      };
    }
  }

  return { shouldPrompt: true, explanation: "no note written since the last prompt" };
}

/**
 * The instruction handed to the agent.
 *
 * This text is the product. Two things in it decide whether a store is worth reading a year later,
 * and both are counter-intuitive enough that an agent will not do them unprompted:
 *
 *   - **Most sessions should write nothing.** A store padded with session narration is worse than an
 *     empty one, because every future reader pays to scan past it.
 *   - **The heading must carry the words a future reader will search with.** Search is lexical, so a
 *     heading sharing no word with the question is invisible however good the note is. Fixing recall
 *     at write time costs nothing; fixing it at read time costs an index.
 *
 * `bin` is how dixti is invoked on this machine, so the commands can be run verbatim.
 */
export function capturePrompt(bin = "dixti"): string {
  return `Did this session establish anything a future agent working in this repo would want to know,
and could not cheaply rediscover? Most sessions do not. Writing nothing is the common, correct
outcome — a store padded with session narration is worse than an empty one.

Worth a note: a durable fact about THIS system that cost something to learn — a non-obvious
behaviour, a constraint, a gotcha, a decision and the reason for it.
Not worth a note: what you did, what you changed, or anything already in the code, the README, or
the commit message.

If nothing qualifies, say so in one line and stop. Do not invent one.

If something does:

1. Look first — \`${bin} search <words>\`. Not as a formality: if a note already covers this, reading
   it is how you find out whether you have anything to add. If it covers it fully, stop.
2. Write it — \`${bin} note --topic <topic> --heading <heading> --body <body>\`
   (omit --body to pipe a longer body in on stdin).
   dixti checks the store as it writes. If your note looks like one that already exists it will
   NOT write, will hold your note under a handle, and will print two commands: one to consolidate
   the two into a single note, one to say they are different findings. Nothing is lost either way —
   read the note it names, decide which is true, and run the command it gives you.
3. THE HEADING IS THE PRODUCT. It is the only line most readers ever see — in the topic list and in
   every search result. Write it as a standalone sentence stating the finding, not a label.
   "Billing notes" is not a heading. "Refunds re-enter the ledger as a second positive row" is.
4. PUT THE SEARCH WORDS IN THE HEADING. Search is lexical: a note whose heading shares no word with
   the question is invisible. If the finding covers refunds and chargebacks, name both.
5. Reuse an existing topic when one fits — \`${bin} dict\` lists them. A topic per note is a topic
   list nobody can scan.

Report in one line what you wrote, or that nothing was worth writing.`;
}
