import { describe, expect, it } from "vitest";
import { parseNotes, type Note } from "../src/parse.js";
import { blocking, CONFIRM, duplicates, similarity, WARN } from "../src/similar.js";

const note = (heading: string, body: string, topic = "billing"): Note => {
  const n = parseNotes("t.md", `### ${heading} <!--dx:${"0".repeat(7)}${heading.length % 10}-->\n<!--dx topic=${topic}-->\n\n${body}\n`)[0];
  if (!n) throw new Error("fixture did not parse");
  return n;
};

const REFUND = note(
  "Refunds re-enter the ledger as a second positive row",
  "Not a reversal. A refund appears as kind='refund' with a positive amount, so summing amount double-counts it.",
);

describe("similarity", () => {
  it("is 1 for identical text and symmetric", () => {
    const a = { heading: "Tokens rotate on privilege change", body: "New token, old revoked.", topic: "auth" };
    expect(similarity(a, a)).toBeCloseTo(1, 5);
    const b = { heading: "Tokens rotate", body: "Something else entirely.", topic: "auth" };
    expect(similarity(a, b)).toBeCloseTo(similarity(b, a), 10);
  });

  it("scores a rewording of the same finding above CONFIRM", () => {
    const s = similarity(
      { heading: REFUND.heading, body: REFUND.body, topic: "billing" },
      {
        heading: "Refunds post back to the ledger as a positive row",
        body: "A refund is not a reversal; it lands as a positive amount row, so summing the amount column double-counts refunds.",
        topic: "billing",
      },
    );
    expect(s).toBeGreaterThan(CONFIRM);
  });

  it("scores a different finding in the same subject area below WARN", () => {
    const s = similarity(
      { heading: REFUND.heading, body: REFUND.body, topic: "billing" },
      {
        heading: "Invoice line items round half-up before VAT is applied",
        body: "Rounding happens per line rather than on the total, so the lines can differ from the total by a cent.",
        topic: "billing",
      },
    );
    expect(s).toBeLessThan(WARN);
  });

  it("ignores a leading section number, which is structure rather than subject", () => {
    const body = "Leave the remaining parameters untouched until the next review.";
    const plain = { heading: "Hold everything else", body, topic: "a" };
    const numbered = { heading: "6.7 Hold everything else", body, topic: "a" };
    expect(similarity(plain, numbered)).toBeCloseTo(1, 5);
  });
});

describe("duplicates", () => {
  it("returns nothing when the store holds nothing alike", () => {
    expect(duplicates([REFUND], { heading: "Deploys roll back automatically after a failed health check", body: "Two consecutive failures trigger the previous revision.", topic: "deploys" })).toEqual([]);
  });

  it("names the words two headings share, so a caller can say why", () => {
    const [hit] = duplicates([REFUND], {
      heading: "Refunds post back to the ledger as a positive row",
      body: "A refund lands as a positive amount row and double-counts in a sum.",
      topic: "billing",
    });
    expect(hit?.shared).toEqual(expect.arrayContaining(["refunds", "ledger", "positive", "row"]));
  });

  it("finds a duplicate filed under a different topic — the split-topic case", () => {
    const elsewhere = { ...REFUND, meta: { ...REFUND.meta, topic: "finance" } };
    const hits = duplicates([elsewhere], {
      heading: "Refunds re-enter the ledger as a second positive row",
      body: REFUND.body,
      topic: "billing",
    });
    expect(hits).toHaveLength(1);
  });

  it("ranks the closest first", () => {
    const near = note("Refunds post back to the ledger as a positive row", "A refund lands as a positive amount row, double-counting in a sum over amount.");
    const far = note("Refunds are excluded from the daily revenue rollup", "The rollup filters kind='refund' before summing, so refunds never reach it.");
    const hits = duplicates([far, near], { heading: REFUND.heading, body: REFUND.body, topic: "billing" });
    expect(hits[0]?.note.heading).toBe(near.heading);
  });
});

describe("blocking", () => {
  const strong = duplicates([REFUND], {
    heading: "Refunds post back to the ledger as a positive row",
    body: "A refund is not a reversal; it lands as a positive amount row, so summing the amount column double-counts refunds.",
    topic: "billing",
  });

  it("stops a write that looks like an existing note", () => {
    expect(blocking(strong)?.note.id).toBe(REFUND.id);
  });

  it("stops asking once the author says which note this replaces", () => {
    expect(blocking(strong, [REFUND.id ?? ""])).toBeNull();
  });

  it("keeps asking about a second duplicate the author did not name", () => {
    const other = note("Refunds post to the ledger as a positive row again", "A refund lands as a positive amount row, so summing the amount column double-counts refunds entirely.");
    const both = duplicates([REFUND, other], {
      heading: "Refunds post back to the ledger as a positive row",
      body: "A refund is not a reversal; it lands as a positive amount row, so summing the amount column double-counts refunds.",
      topic: "billing",
    });
    expect(blocking(both, [REFUND.id ?? ""])).not.toBeNull();
  });

  it("does not stop a write on one shared word in two very short headings", () => {
    // "THE GAP" / "Open gap" scored 0.47 on a real corpus purely because both headings are tiny.
    const gap = note("THE GAP", "The market has no occupant between the two tiers described above.");
    const hits = duplicates([gap], { heading: "Open gap", body: "The market has no occupant between the two tiers described above.", topic: "x" });
    expect(blocking(hits)).toBeNull();
  });
});
