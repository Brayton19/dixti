import { describe, expect, it } from "vitest";
import { planNote, slugTopic } from "../src/note.js";
import { parseNotes } from "../src/parse.js";
import { planInit, GITATTRIBUTES_LINE } from "../src/init.js";

describe("slugTopic", () => {
  it("makes a topic safe to be a filename", () => {
    expect(slugTopic("SQL / BigQuery")).toBe("sql-bigquery");
    expect(slugTopic("  billing & refunds  ")).toBe("billing-refunds");
  });

  it("never produces an empty filename", () => {
    expect(slugTopic("///")).toBe("general");
    expect(slugTopic("")).toBe("general");
  });

  it("caps the length", () => {
    expect(slugTopic("x".repeat(200)).length).toBeLessThanOrEqual(60);
  });
});

describe("planNote", () => {
  const input = {
    heading: "Refunds re-enter the ledger as a second row",
    body: "Not a reversal.",
    topic: "billing",
    id: "7c2a91b4",
    date: "2026-09-01",
  };

  it("routes a note to its topic's file", () => {
    expect(planNote(input).path).toBe(".agents/notes/billing.md");
  });

  it("appends with a leading blank line so it never fuses to the previous note", () => {
    expect(planNote(input).content.startsWith("\n### ")).toBe(true);
  });

  it("writes something the parser reads back identically", () => {
    const [note] = parseNotes("billing.md", planNote(input).content);
    expect(note).toMatchObject({ id: "7c2a91b4", heading: input.heading, body: input.body });
    expect(note?.meta).toMatchObject({ topic: "billing", date: "2026-09-01" });
  });

  it("trims whitespace the caller left on the heading and body", () => {
    const [note] = parseNotes("x.md", planNote({ ...input, heading: "  H  ", body: "\n\nB\n\n" }).content);
    expect(note?.heading).toBe("H");
    expect(note?.body).toBe("B");
  });
});

describe("planInit", () => {
  it("scaffolds the notes directory and a README", () => {
    const plan = planInit({ gitattributes: null });
    expect(plan.dirs).toEqual([".agents/notes"]);
    expect(plan.writes.map((w) => w.path)).toContain(".agents/notes/README.md");
  });

  it("adds the union-merge line when it is missing", () => {
    const write = planInit({ gitattributes: null }).writes.find((w) => w.path === ".gitattributes");
    expect(write?.content).toContain(GITATTRIBUTES_LINE);
    expect(write?.mode).toBe("append");
  });

  it("leaves .gitattributes alone when the line is already there", () => {
    const plan = planInit({ gitattributes: `${GITATTRIBUTES_LINE}\n` });
    expect(plan.writes.map((w) => w.path)).not.toContain(".gitattributes");
    expect(plan.skipped).toHaveLength(1);
  });

  it("does not start a spurious newline when the file already ends with one", () => {
    const write = planInit({ gitattributes: "*.png binary\n" }).writes.find((w) => w.path === ".gitattributes");
    expect(write?.content.startsWith("\n\n")).toBe(false);
  });

  it("separates its line when the existing file has no trailing newline", () => {
    const write = planInit({ gitattributes: "*.png binary" }).writes.find((w) => w.path === ".gitattributes");
    expect(write?.content.startsWith("\n")).toBe(true);
  });
});
