import { describe, expect, it } from "vitest";
import { search, terms } from "../src/search.js";
import { parseNotes, type Note } from "../src/parse.js";

function note(topic: string, heading: string, body = "Body."): Note {
  const md = `### ${heading} <!--dx:${Math.random().toString(16).slice(2, 10).padEnd(8, "0")}-->\n<!--dx topic=${topic}-->\n\n${body}\n`;
  return parseNotes(`${topic}.md`, md)[0]!;
}

const corpus = [
  note("billing", "Refunds re-enter the ledger as a second positive row", "Summing amount double-counts them."),
  note("billing", "Chargebacks are not in fct_ledger at all", "They live in stripe_disputes."),
  note("matching", "Driver supply is constrained by card-versus-cash preference", "Cash-only drivers cannot take card rides."),
  note("infra", "The stripe dump lands nightly at 02:00 UTC", "Anything before that is yesterday's data."),
];

describe("terms", () => {
  it("drops stopwords and single characters", () => {
    expect(terms("what is the a refund")).toEqual(["refund"]);
  });

  it("keeps identifiers with dots, slashes and underscores intact", () => {
    expect(terms("analytics.fct_ledger src/billing.py")).toEqual(["analytics.fct_ledger", "src/billing.py"]);
  });

  it("deduplicates repeated words", () => {
    expect(terms("refund refund refund")).toEqual(["refund"]);
  });
});

describe("search", () => {
  it("finds a note by a word in its heading", () => {
    expect(search(corpus, "chargebacks")[0]?.note.heading).toContain("Chargebacks");
  });

  it("finds a note by a word only in its body", () => {
    expect(search(corpus, "stripe_disputes")[0]?.note.heading).toContain("Chargebacks");
  });

  it("ranks a heading match above a body-only match", () => {
    // Both notes mention refunds; only one says so in its heading.
    const hits = search(corpus, "refunds");
    expect(hits[0]?.note.heading).toContain("Refunds re-enter");
  });

  it("prefers covering more of the query over repeating one word", () => {
    const hits = search(corpus, "chargebacks stripe_disputes");
    expect(hits[0]?.matched).toHaveLength(2);
  });

  it("matches on topic", () => {
    expect(search(corpus, "matching").map((h) => h.note.meta.topic)).toContain("matching");
  });

  it("returns nothing for a query with no content words", () => {
    expect(search(corpus, "is the a")).toEqual([]);
  });

  it("returns nothing when the topic has never been written about", () => {
    expect(search(corpus, "kubernetes autoscaling")).toEqual([]);
  });

  it("respects the limit", () => {
    expect(search(corpus, "the ledger stripe drivers", 2)).toHaveLength(2);
  });

  it("is case-insensitive", () => {
    expect(search(corpus, "CHARGEBACKS")).toHaveLength(search(corpus, "chargebacks").length);
  });
});
