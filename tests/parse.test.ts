import { describe, expect, it } from "vitest";
import { parseNotes, renderNote, parseMeta } from "../src/parse.js";

describe("parseNotes", () => {
  it("parses a note's id, heading, meta and body", () => {
    const md = `### Refunds re-enter the ledger as a second row <!--dx:7c2a91b4-->
<!--dx topic=billing date=2026-09-01-->

Not a reversal.
`;
    const [note] = parseNotes("notes/billing.md", md);
    expect(note).toMatchObject({
      id: "7c2a91b4",
      heading: "Refunds re-enter the ledger as a second row",
      body: "Not a reversal.",
      file: "notes/billing.md",
      line: 1,
    });
    expect(note?.meta).toMatchObject({ topic: "billing", date: "2026-09-01" });
  });

  it("accepts a note with no meta line and no id", () => {
    const [note] = parseNotes("x.md", "### Just a heading\n\nBody.\n");
    expect(note?.id).toBeNull();
    expect(note?.meta.topic).toBeNull();
    expect(note?.body).toBe("Body.");
  });

  it("keeps unknown meta keys instead of dropping them", () => {
    // A store written by a newer dixti, or by the version that had evidence tiers, must still parse.
    const [note] = parseNotes("x.md", "### H <!--dx:aaaaaaaa-->\n<!--dx topic=t tier=T1 anchors=src/a.ts-->\n\nB.\n");
    expect(note?.meta.unknown).toEqual({ tier: "T1", anchors: "src/a.ts" });
    expect(note?.meta.topic).toBe("t");
  });

  it("does not invent notes from a ### inside a fenced block", () => {
    // The spec's own examples embed markdown, so a naive line scan hallucinates notes out of docs.
    const md = "### Real note <!--dx:aaaaaaaa-->\n\nExample:\n\n```markdown\n### Not a note\n```\n\nEnd.\n";
    const notes = parseNotes("x.md", md);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.body).toContain("### Not a note");
  });

  it("handles nested fences of different markers", () => {
    const md = "### Real <!--dx:aaaaaaaa-->\n\n~~~\n```\n### Nope\n```\n~~~\n\nEnd.\n";
    expect(parseNotes("x.md", md)).toHaveLength(1);
  });

  it("terminates a note at a heading of level 3 or shallower, but keeps deeper ones as body", () => {
    const md = "### One <!--dx:aaaaaaaa-->\n\n#### Subsection\n\nstill one.\n\n### Two <!--dx:bbbbbbbb-->\n\nBody.\n";
    const notes = parseNotes("x.md", md);
    expect(notes.map((n) => n.heading)).toEqual(["One", "Two"]);
    expect(notes[0]?.body).toContain("#### Subsection");
  });

  it("ignores content before the first note", () => {
    expect(parseNotes("x.md", "# Title\n\nPreamble.\n\n### A note <!--dx:aaaaaaaa-->\n\nBody.\n")).toHaveLength(1);
  });

  it("returns nothing for a file with no notes", () => {
    expect(parseNotes("x.md", "# Title\n\nJust prose.\n")).toEqual([]);
  });
});

describe("parseMeta", () => {
  it("ignores tokens that are not key=value", () => {
    const meta = parseMeta("topic=billing garbage =novalue date=2026-09-01", 2);
    expect(meta).toMatchObject({ topic: "billing", date: "2026-09-01" });
    expect(meta.unknown).toEqual({});
  });

  it("does not split a value on internal punctuation", () => {
    expect(parseMeta("topic=sql-bigquery", 1).topic).toBe("sql-bigquery");
  });
});

describe("renderNote", () => {
  it("round-trips a note without reformatting it", () => {
    const md = "### A heading <!--dx:7c2a91b4-->\n<!--dx topic=billing date=2026-09-01-->\n\nThe body.\n";
    const [note] = parseNotes("x.md", md);
    expect(renderNote(note!)).toBe(md);
  });

  it("round-trips through a second parse unchanged", () => {
    const md = "### H <!--dx:7c2a91b4-->\n<!--dx topic=t date=2026-09-01-->\n\nBody.\n";
    const once = renderNote(parseNotes("x.md", md)[0]!);
    expect(renderNote(parseNotes("x.md", once)[0]!)).toBe(once);
  });

  it("preserves unknown keys on the way back out", () => {
    const [note] = parseNotes("x.md", "### H <!--dx:aaaaaaaa-->\n<!--dx topic=t tier=T1-->\n\nB.\n");
    expect(renderNote(note!)).toContain("tier=T1");
  });
});
