import { describe, expect, it } from "vitest";
import { parseNotes, renderNote } from "../src/parse.js";
import { live, supersededBy, supersededIds } from "../src/supersede.js";

const store = (...blocks: string[]) => parseNotes("billing.md", blocks.join("\n"));
const withId = (id: string, heading: string, supersedes?: string) =>
  `### ${heading} <!--dx:${id}-->\n<!--dx topic=billing${supersedes ? ` supersedes=${supersedes}` : ""}-->\n\nBody for ${heading}.\n`;

describe("supersedes round-trips through the format", () => {
  it("parses a comma-separated list", () => {
    const [n] = store(withId("aaaaaaaa", "Consolidated", "bbbbbbbb,cccccccc"));
    expect(n?.meta.supersedes).toEqual(["bbbbbbbb", "cccccccc"]);
  });

  it("is an empty list, never undefined, when absent", () => {
    const [n] = store(withId("aaaaaaaa", "Plain"));
    expect(n?.meta.supersedes).toEqual([]);
  });

  it("renders back out unchanged", () => {
    const [n] = store(withId("aaaaaaaa", "Consolidated", "bbbbbbbb,cccccccc"));
    expect(renderNote(n!)).toContain("supersedes=bbbbbbbb,cccccccc");
    expect(parseNotes("x.md", renderNote(n!))[0]?.meta.supersedes).toEqual(["bbbbbbbb", "cccccccc"]);
  });

  it("does not emit the key for a note that replaces nothing", () => {
    const [n] = store(withId("aaaaaaaa", "Plain"));
    expect(renderNote(n!)).not.toContain("supersedes");
  });
});

describe("live", () => {
  it("hides a replaced note but keeps the one that replaced it", () => {
    const notes = store(withId("aaaaaaaa", "Old"), withId("bbbbbbbb", "New", "aaaaaaaa"));
    expect(live(notes).map((n) => n.heading)).toEqual(["New"]);
  });

  it("collapses a chain without traversing it", () => {
    const notes = store(
      withId("aaaaaaaa", "First"),
      withId("bbbbbbbb", "Second", "aaaaaaaa"),
      withId("cccccccc", "Third", "bbbbbbbb"),
    );
    expect(live(notes).map((n) => n.heading)).toEqual(["Third"]);
  });

  it("keeps a note with no id — it cannot be addressed, so it cannot be replaced", () => {
    const notes = parseNotes("x.md", "### Anonymous\n\nBody.\n");
    expect(live(notes)).toHaveLength(1);
  });

  it("hides a note replaced from a different topic file", () => {
    const a = parseNotes("billing.md", withId("aaaaaaaa", "Old"));
    const b = parseNotes("finance.md", withId("bbbbbbbb", "New", "aaaaaaaa"));
    expect(live([...a, ...b]).map((n) => n.heading)).toEqual(["New"]);
  });

  it("ignores an id that no note has", () => {
    const notes = store(withId("aaaaaaaa", "Only", "deadbeef"));
    expect(supersededIds(notes).has("deadbeef")).toBe(true);
    expect(live(notes)).toHaveLength(1);
  });
});

describe("supersededBy", () => {
  it("points a reader from an old id to the current note", () => {
    const notes = store(withId("aaaaaaaa", "Old"), withId("bbbbbbbb", "New", "aaaaaaaa"));
    expect(supersededBy(notes, "aaaaaaaa")?.id).toBe("bbbbbbbb");
    expect(supersededBy(notes, "bbbbbbbb")).toBeNull();
  });
});
