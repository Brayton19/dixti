/**
 * Argument parsing. Pure, and separate from the CLI because it is the one part of argument handling
 * with rules worth testing: a flag's value must never be mistaken for a positional, or `dixti search
 * --dir /x billing` searches for "/x billing".
 */

/** Flags that consume the following argument. */
export const VALUE_FLAGS = [
  "--topic", "--budget", "--adapt", "--exclude", "--dir", "--heading", "--body", "--title",
  "--session", "--throttle", "--supersedes", "--resume",
];

export function flagValue(args: readonly string[], name: string): string | null {
  const i = args.indexOf(name);
  return i >= 0 ? (args[i + 1] ?? null) : null;
}

export function positional(args: readonly string[]): string[] {
  const skip = new Set<number>();
  args.forEach((a, i) => {
    if (VALUE_FLAGS.includes(a)) skip.add(i + 1);
  });
  return args.filter((a, i) => !a.startsWith("--") && !skip.has(i));
}

export function excludeList(args: readonly string[]): string[] {
  return (flagValue(args, "--exclude") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
}

/** A comma-separated list flag, e.g. `--supersedes a1b2c3d4,e5f6a7b8`. */
export function listFlag(args: readonly string[], name: string): string[] {
  return (flagValue(args, name) ?? "").split(",").map((x) => x.trim()).filter(Boolean);
}
