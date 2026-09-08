import { describe, expect, it } from "vitest";
import { parseNotes } from "../src/parse.js";
import { planMerge, topicPath } from "../src/merge.js";

const noteText = (id: string, heading: string, topic: string | null) =>
  `### ${heading} <!--dx:${id}-->\n${topic ? `<!--dx topic=${topic} date=2026-01-01-->\n` : ""}\nBody for ${heading}.\n`;

const ok = (r: ReturnType<typeof planMerge>) => {
  if (!r.ok) throw new Error(r.error);
  return r.plan;
};

describe("planMerge", () => {
  it("rewrites the explicit topic on every note it moves", () => {
    const plan = ok(planMerge({
      from: "billings",
      to: "billing",
      fromContent: noteText("aaaaaaaa", "One", "billings") + noteText("bbbbbbbb", "Two", "billings"),
      toContent: noteText("cccccccc", "Existing", "billing"),
    }));
    expect(plan.rewritten).toBe(2);
    expect(plan.write.content).not.toContain("topic=billings");
    expect((plan.write.content.match(/topic=billing\b/g) ?? [])).toHaveLength(3);
  });

  it("leaves an implicit topic alone — the destination filename already carries it", () => {
    const plan = ok(planMerge({
      from: "billings", to: "billing",
      fromContent: noteText("aaaaaaaa", "One", null),
      toContent: null,
    }));
    expect(plan.rewritten).toBe(0);
    expect(parseNotes("billing.md", plan.write.content)[0]?.meta.topic).toBeNull();
  });

  it("preserves every id, heading, body and date", () => {
    const from = noteText("aaaaaaaa", "One", "billings") + noteText("bbbbbbbb", "Two", "billings");
    const plan = ok(planMerge({ from: "billings", to: "billing", fromContent: from, toContent: null }));
    const after = parseNotes("billing.md", plan.write.content);
    expect(after.map((n) => n.id)).toEqual(["aaaaaaaa", "bbbbbbbb"]);
    expect(after.map((n) => n.heading)).toEqual(["One", "Two"]);
    expect(after.map((n) => n.meta.date)).toEqual(["2026-01-01", "2026-01-01"]);
    expect(after[0]?.body).toBe("Body for One.");
  });

  it("keeps content the parser does not model, rather than re-rendering", () => {
    const preamble = "Hand-written preamble that is not a note.\n\n";
    const plan = ok(planMerge({
      from: "billings", to: "billing",
      fromContent: preamble + noteText("aaaaaaaa", "One", "billings"),
      toContent: null,
    }));
    expect(plan.write.content).toContain("Hand-written preamble");
  });

  it("appends after existing notes rather than replacing them", () => {
    const plan = ok(planMerge({
      from: "billings", to: "billing",
      fromContent: noteText("aaaaaaaa", "Moved", "billings"),
      toContent: noteText("cccccccc", "Already there", "billing"),
    }));
    expect(parseNotes("x.md", plan.write.content).map((n) => n.heading)).toEqual(["Already there", "Moved"]);
  });

  it("names the file it will delete and the one it will write", () => {
    const plan = ok(planMerge({ from: "billings", to: "billing", fromContent: noteText("aaaaaaaa", "One", "billings"), toContent: null }));
    expect(plan.delete).toBe(topicPath("billings"));
    expect(plan.write.path).toBe(topicPath("billing"));
  });

  it("refuses a source that does not exist", () => {
    const r = planMerge({ from: "nope", to: "billing", fromContent: null, toContent: "x" });
    expect(r.ok).toBe(false);
  });

  it("refuses when source and destination are the same topic after slugging", () => {
    const r = planMerge({ from: "Bill Ing", to: "bill-ing", fromContent: "### x\n\ny\n", toContent: null });
    expect(r.ok).toBe(false);
  });

  it("refuses a source holding no notes", () => {
    const r = planMerge({ from: "billings", to: "billing", fromContent: "\n\n", toContent: null });
    expect(r.ok).toBe(false);
  });
});
