import { describe, expect, it } from "vitest";
import { excludeList, flagValue, listFlag, positional } from "../src/args.js";

describe("positional", () => {
  it("does not mistake a flag's value for a positional", () => {
    expect(positional(["--dir", "/x", "billing", "ledger"])).toEqual(["billing", "ledger"]);
  });

  it("handles a value that looks like a word after every value flag", () => {
    expect(positional(["--topic", "merge", "merge", "a", "b"])).toEqual(["merge", "a", "b"]);
  });

  it("keeps boolean flags out of the positionals", () => {
    expect(positional(["merge", "a", "b", "--yes"])).toEqual(["merge", "a", "b"]);
  });
});

describe("flagValue", () => {
  it("returns null when the flag is absent", () => {
    expect(flagValue(["--topic", "billing"], "--heading")).toBeNull();
  });

  it("returns null when the flag is last and has no value", () => {
    expect(flagValue(["--heading"], "--heading")).toBeNull();
  });
});

describe("list flags", () => {
  it("splits and trims a comma-separated list", () => {
    expect(listFlag(["--supersedes", "aaaaaaaa, bbbbbbbb"], "--supersedes")).toEqual(["aaaaaaaa", "bbbbbbbb"]);
  });

  it("is empty rather than [''] when absent", () => {
    expect(listFlag([], "--supersedes")).toEqual([]);
    expect(excludeList([])).toEqual([]);
  });
});
