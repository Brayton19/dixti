import { describe, expect, it } from "vitest";
import { buildDictionary, renderDictionary, topicOf } from "../src/dict.js";
import { adaptFile, derivedId, topicFromPath } from "../src/adapt.js";
import { parseNotes, type Note } from "../src/parse.js";

function note(file: string, heading: string, meta = ""): Note {
  const metaLine = meta ? `<!--dx ${meta}-->\n` : "";
  return parseNotes(file, `### ${heading} <!--dx:aaaaaaaa-->\n${metaLine}\nBody.\n`)[0]!;
}

describe("topicOf", () => {
  it("prefers the explicit topic", () => {
    expect(topicOf(note("x.md", "H", "topic=billing"))).toBe("billing");
  });

  it("falls back to the filename", () => {
    expect(topicOf(note("sql_bigquery.md", "H"))).toBe("sql bigquery");
  });

  it("uses the parent directory when the filename is generic", () => {
    expect(topicFromPath("services/ios_payment/state.md")).toBe("ios payment");
    expect(topicFromPath("core/_index.md")).toBe("core");
  });

  it("strips the store scaffolding from the path", () => {
    expect(topicFromPath(".agents/notes/billing.md")).toBe("billing");
  });
});

describe("derivedId", () => {
  it("is stable for the same input", () => {
    expect(derivedId("a.md", "H")).toBe(derivedId("a.md", "H"));
  });

  it("differs for a different file or heading", () => {
    expect(derivedId("a.md", "H")).not.toBe(derivedId("b.md", "H"));
    expect(derivedId("a.md", "H")).not.toBe(derivedId("a.md", "J"));
  });

  it("is eight hex characters", () => {
    expect(derivedId("a.md", "H")).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("adaptFile", () => {
  it("gives an id and a topic to a corpus that has neither", () => {
    const [n] = adaptFile("kernel.md", "### A rule about greps\n\nBody.\n");
    expect(n?.id).toMatch(/^[0-9a-f]{8}$/);
    expect(n?.meta.topic).toBe("kernel");
  });

  it("does not overwrite an id or topic the corpus already carries", () => {
    const [n] = adaptFile("kernel.md", "### H <!--dx:7c2a91b4-->\n<!--dx topic=explicit-->\n\nB.\n");
    expect(n?.id).toBe("7c2a91b4");
    expect(n?.meta.topic).toBe("explicit");
  });
});

describe("renderDictionary", () => {
  const many = (n: number, file = ".agents/notes/billing.md") =>
    Array.from({ length: n }, (_, i) => note(file, `Note number ${i} about a thing that happened`));

  it("lists every note when under budget", () => {
    const out = renderDictionary(buildDictionary(many(3)));
    expect(out).toContain("Notes in this repo — 3 notes");
    expect(out.match(/^ {2}aaaaaaaa/gm)).toHaveLength(3);
  });

  it("collapses when over budget, keeping the topic and its size", () => {
    const out = renderDictionary(buildDictionary(many(400)), { budget: 100 });
    expect(out).toContain("Over budget");
    expect(out).toContain("## billing  (400)");
    // A budget this small leaves no room even for one sample heading.
    expect(out).not.toContain("Note number 0");
  });

  it("expands a single topic on request", () => {
    const out = renderDictionary(buildDictionary(many(3)), { topic: "billing" });
    expect(out).toContain("# billing — 3 notes");
  });

  it("says so when the requested topic does not exist", () => {
    expect(renderDictionary(buildDictionary(many(1)), { topic: "nope" })).toContain('no topic "nope"');
  });

  it("sorts topics by size", () => {
    const dict = buildDictionary([...many(2, "a.md"), ...many(5, "b.md")]);
    expect(dict.topics.map((t) => t.name)).toEqual(["b", "a"]);
  });

  it("always tells the reader how to search before writing", () => {
    expect(renderDictionary(buildDictionary(many(3)))).toContain("dixti search <words>");
  });

  it("round-trips corpus flags into every command it prints", () => {
    // A list that tells the agent to run a command missing --adapt sends it to "no note".
    const out = renderDictionary(buildDictionary(many(400)), {
      budget: 100,
      showCmd: "dixti show <id> --adapt ~/notes --exclude archive",
    });
    expect(out).toContain("`dixti dict --topic <name> --adapt ~/notes --exclude archive`");
    expect(out).toContain("`dixti search <words> --adapt ~/notes --exclude archive`");
  });
});

describe("renderDictionary — title", () => {
  const one = [parseNotes(".agents/notes/a.md", "### H <!--dx:aaaaaaaa-->\n\nB.\n")[0]!];

  it("names the repo by default", () => {
    expect(renderDictionary(buildDictionary(one))).toContain("# Notes in this repo — 1 notes");
  });

  it("can be retitled, so two lists in one session are distinguishable", () => {
    expect(renderDictionary(buildDictionary(one), { title: "What the ops notes say" }))
      .toContain("# What the ops notes say — 1 notes");
  });
});

describe("renderDictionary — over budget, samples beat bare names", () => {
  const corpus = (topics: number, per: number) =>
    Array.from({ length: topics }, (_, t) =>
      Array.from({ length: per }, (_, i) =>
        note(`.agents/notes/topic${t}.md`, `Topic ${t} finding ${i} about something specific`),
      ),
    ).flat();

  const tokensOf = (s: string) => Math.ceil(s.length / 4);

  it("shows sample headings rather than counts alone", () => {
    const out = renderDictionary(buildDictionary(corpus(20, 30)), { budget: 4000 });
    // A bare topic name is a guess; a real heading says what the topic contains.
    expect(out).toMatch(/Topic 0 finding 0/);
    expect(out).toMatch(/… 2[0-9] more/);
  });

  it("stays inside the budget it was given", () => {
    for (const [topics, per] of [[20, 30], [40, 200], [5, 10], [60, 5]] as const) {
      const out = renderDictionary(buildDictionary(corpus(topics, per)), { budget: 4000 });
      expect(tokensOf(out)).toBeLessThanOrEqual(4400); // budget + prose overhead
    }
  });

  it("degrades to counts only when even one sample per topic will not fit", () => {
    const out = renderDictionary(buildDictionary(corpus(300, 50)), { budget: 500 });
    expect(out).toContain("a count");
    expect(out).not.toMatch(/Topic 0 finding 0/);
  });

  it("never claims more samples than a small topic has", () => {
    const out = renderDictionary(buildDictionary([...corpus(30, 40), note(".agents/notes/lonely.md", "Only note here")]), {
      budget: 4000,
    });
    expect(out).toContain("## lonely  (1)");
    expect(out).toContain("Only note here");
    // One note shown out of one means nothing is hidden, so no "… more" line.
    expect(out).not.toMatch(/## lonely {2}\(1\)\n {2}\S+ {2}Only note here\n {4}…/);
  });

  it("still tells the reader search covers what is hidden", () => {
    const out = renderDictionary(buildDictionary(corpus(20, 30)), { budget: 4000 });
    expect(out).toMatch(/Search across every note, shown or not/);
  });

  it("does not sample when everything fits", () => {
    const out = renderDictionary(buildDictionary(corpus(2, 3)), { budget: 4000 });
    expect(out).not.toContain("more");
    expect(out).toContain("One line per note");
  });
});
