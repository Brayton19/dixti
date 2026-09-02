import { describe, expect, it } from "vitest";
import { agentInstructions, INSTRUCTIONS_HEADING } from "../src/instructions.js";
import { planInit } from "../src/init.js";

describe("agentInstructions", () => {
  it("leads with the reading habit, which is the part an agent cannot infer from --help", () => {
    expect(agentInstructions()).toMatch(/Before concluding that something is undocumented/);
  });

  it("tells the agent that writing nothing is normal", () => {
    expect(agentInstructions()).toMatch(/Most sessions learn nothing\s+worth recording/);
  });

  it("carries the heading discipline that makes lexical search work", () => {
    expect(agentInstructions()).toMatch(/use the words\s+someone would search for/);
  });

  it("uses the binary name the host actually invokes", () => {
    const p = agentInstructions("npx dixti");
    expect(p).toContain("npx dixti search <words>");
    expect(p).not.toMatch(/^ +dixti search/m);
  });

  it("starts with the marker heading, so appending can be made idempotent", () => {
    expect(agentInstructions().startsWith(INSTRUCTIONS_HEADING)).toBe(true);
  });
});

describe("planInit — agent instructions", () => {
  const base = { gitattributes: null };

  it("creates AGENTS.md when the project has none", () => {
    const w = planInit(base).writes.find((x) => x.path === "AGENTS.md");
    expect(w?.mode).toBe("append");
    expect(w?.content).toContain(INSTRUCTIONS_HEADING);
  });

  it("appends below the project's own rules rather than replacing them", () => {
    const w = planInit({ ...base, agentsMd: "# Rules\n\nRun make lint.\n" }).writes.find(
      (x) => x.path === "AGENTS.md",
    );
    // Append mode leaves existing content alone; the plan only carries what is added.
    expect(w?.mode).toBe("append");
    expect(w?.content).not.toContain("Run make lint");
  });

  it("does not touch AGENTS.md when the block is already there", () => {
    const plan = planInit({ ...base, agentsMd: `# Rules\n\n${agentInstructions()}` });
    expect(plan.writes.map((w) => w.path)).not.toContain("AGENTS.md");
    expect(plan.skipped.join(" ")).toMatch(/AGENTS\.md already has/);
  });

  it("separates itself from a file that does not end in a newline", () => {
    const w = planInit({ ...base, agentsMd: "# Rules" }).writes.find((x) => x.path === "AGENTS.md");
    expect(w?.content.startsWith("\n\n")).toBe(true);
  });

  it("does not open with blank lines when the project has no AGENTS.md", () => {
    const w = planInit(base).writes.find((x) => x.path === "AGENTS.md");
    expect(w?.content.startsWith("#")).toBe(true);
  });

  it("threads the binary name through to the file it writes", () => {
    const w = planInit({ ...base, bin: "npx dixti" }).writes.find((x) => x.path === "AGENTS.md");
    expect(w?.content).toContain("npx dixti search");
  });
});
