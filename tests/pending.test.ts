import { describe, expect, it } from "vitest";
import { isExpired, parsePending, renderPending, TTL_DAYS } from "../src/pending.js";

const candidate = {
  heading: "Refunds re-enter the ledger as a second positive row",
  body: "Not a reversal.\n\n#### Detail\nA refund lands as a positive amount, so a sum double-counts.",
  topic: "billing",
};

describe("a held note survives the round trip", () => {
  it("returns exactly what was held", () => {
    expect(parsePending(renderPending(candidate, "2026-01-01"))).toEqual(candidate);
  });

  it("keeps a multi-line body with its own sub-headings", () => {
    const back = parsePending(renderPending(candidate, "2026-01-01"));
    expect(back?.body).toContain("#### Detail");
  });

  it("holds no id — the handle is the filename, and the note id is minted when it lands", () => {
    expect(renderPending(candidate, "2026-01-01")).not.toContain("dx:");
  });

  it("survives a body containing a fenced block with a ### line in it", () => {
    const tricky = { ...candidate, body: "See:\n\n```md\n### Not a note\n```\n\nThat is body text." };
    expect(parsePending(renderPending(tricky, "2026-01-01"))?.body).toBe(tricky.body);
  });
});

describe("parsePending rejects what is not a held note", () => {
  it("returns null for an empty file rather than throwing", () => {
    expect(parsePending("")).toBeNull();
  });

  it("returns null for a file with no heading", () => {
    expect(parsePending("just some text\n")).toBeNull();
  });

  it("returns null for a heading with no body", () => {
    expect(parsePending("### A heading alone\n")).toBeNull();
  });
});

describe("isExpired", () => {
  const day = 86400;
  it("keeps a note held for the whole window", () => {
    expect(isExpired(0, TTL_DAYS * day - 1)).toBe(false);
  });
  it("drops one past it", () => {
    expect(isExpired(0, TTL_DAYS * day + 1)).toBe(true);
  });
});
