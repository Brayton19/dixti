import { describe, expect, it } from "vitest";
import { adviseTopic, renderAdvice } from "../src/topic.js";

const kinds = (name: string, existing: string[] = []) =>
  adviseTopic(name, existing).issues.map((i) => i.kind);

describe("adviseTopic", () => {
  it("is silent on a good new topic", () => {
    expect(kinds("billing", ["auth", "deploys"])).toEqual([]);
  });

  it("is silent on an exact existing topic — reuse is the desired behaviour", () => {
    const a = adviseTopic("billing", ["billing", "auth"]);
    expect(a.existing).toBe(true);
    expect(a.issues).toEqual([]);
  });

  it("matches an existing topic case-insensitively", () => {
    expect(adviseTopic("Billing", ["billing"]).existing).toBe(true);
  });

  it("flags names that describe origin rather than subject", () => {
    for (const n of ["misc", "notes", "session log", "scratch", "tmp", "todo"]) {
      expect(kinds(n), n).toContain("uninformative");
    }
  });

  it("flags a date, which files notes by when rather than what", () => {
    expect(kinds("matching parameters 2026 07 31")).toContain("dated");
    expect(kinds("2026-07-31")).toContain("dated");
    expect(kinds("retro 2025")).toContain("dated");
  });

  it("does not mistake an ordinary number for a date", () => {
    expect(kinds("http 500 errors")).not.toContain("dated");
    expect(kinds("s3 buckets")).not.toContain("dated");
  });

  it("flags a topic that is really a heading", () => {
    expect(kinds("the auth token refresh race condition")).toContain("too-long");
    expect(kinds("auth token refresh")).not.toContain("too-long");
  });

  it("catches a plural splitting an existing topic", () => {
    expect(kinds("billings", ["billing"])).toContain("near-duplicate");
    expect(kinds("deploy", ["deploys"])).toContain("near-duplicate");
  });

  it("catches a subset splitting an existing topic in either direction", () => {
    expect(kinds("auth", ["auth flow"])).toContain("near-duplicate");
    expect(kinds("auth flow", ["auth"])).toContain("near-duplicate");
  });

  it("does not call merely related topics duplicates", () => {
    expect(kinds("billing", ["auth", "deploys", "search index"])).toEqual([]);
    expect(kinds("payment retries", ["payment gateway"])).toEqual([]);
  });

  it("suggests the topic it thinks the note belongs to", () => {
    expect(adviseTopic("billings", ["billing"]).suggestion).toBe("billing");
    expect(adviseTopic("billing", []).suggestion).toBeNull();
  });

  it("reports every issue a name has, not just the first", () => {
    expect(kinds("misc notes 2026", []).sort()).toEqual(["dated", "uninformative"]);
  });
});

describe("renderAdvice", () => {
  it("prints nothing when there is nothing to say", () => {
    expect(renderAdvice("billing", adviseTopic("billing", ["auth"]))).toBe("");
  });

  it("names the offending word so the advice is actionable", () => {
    expect(renderAdvice("misc", adviseTopic("misc", []))).toContain('"misc"');
  });

  it("names the existing topic a near-duplicate should merge into", () => {
    expect(renderAdvice("billings", adviseTopic("billings", ["billing"]))).toContain('"billing"');
  });
});
