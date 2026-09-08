import { describe, expect, it } from "vitest";
import { capturePrompt, shouldCapture, type CaptureState } from "../src/capture.js";

const NOW = 1_700_000_000;
const base: CaptureState = {
  storeExists: true,
  lastPromptAt: null,
  lastNoteAt: null,
  now: NOW,
  throttleSeconds: 1800,
};

describe("shouldCapture", () => {
  it("asks on a first stop with a store present", () => {
    expect(shouldCapture(base).shouldPrompt).toBe(true);
  });

  it("never asks without a store — a prompt with nowhere to write teaches the agent to ignore it", () => {
    const d = shouldCapture({ ...base, storeExists: false });
    expect(d.shouldPrompt).toBe(false);
    expect(d.skipReason).toBe("no-store");
  });

  it("does not ask again inside the throttle window", () => {
    const d = shouldCapture({ ...base, lastPromptAt: NOW - 60 });
    expect(d.shouldPrompt).toBe(false);
    expect(d.skipReason).toBe("throttled");
  });

  it("asks again once the window has passed", () => {
    expect(shouldCapture({ ...base, lastPromptAt: NOW - 1801 }).shouldPrompt).toBe(true);
  });

  it("stays quiet when a note was written since the last prompt", () => {
    const d = shouldCapture({ ...base, lastPromptAt: NOW - 3600, lastNoteAt: NOW - 60 });
    expect(d.shouldPrompt).toBe(false);
    expect(d.skipReason).toBe("already-captured");
  });

  it("counts a note written in the same second as the prompt as a capture", () => {
    // The agent captures immediately; second-resolution mtimes must not make that look like a miss.
    const d = shouldCapture({ ...base, lastPromptAt: NOW - 3600, lastNoteAt: NOW - 3600 });
    expect(d.skipReason).toBe("already-captured");
  });

  it("ignores a note that predates the last prompt", () => {
    // Someone else's note from last week is not an answer to this session's prompt.
    expect(shouldCapture({ ...base, lastPromptAt: NOW - 1801, lastNoteAt: NOW - 100000 }).shouldPrompt).toBe(true);
  });

  it("prefers 'already captured' over 'throttled' so prompt capture is never punished", () => {
    const d = shouldCapture({ ...base, lastPromptAt: NOW - 5, lastNoteAt: NOW - 1 });
    expect(d.skipReason).toBe("already-captured");
  });

  it("has no store beat every other reason", () => {
    const d = shouldCapture({ ...base, storeExists: false, lastPromptAt: NOW - 5, lastNoteAt: NOW });
    expect(d.skipReason).toBe("no-store");
  });

  it("honours a custom throttle", () => {
    expect(shouldCapture({ ...base, lastPromptAt: NOW - 10, throttleSeconds: 5 }).shouldPrompt).toBe(true);
  });
});

describe("capturePrompt", () => {
  it("tells the agent that writing nothing is the usual outcome", () => {
    expect(capturePrompt()).toMatch(/writing nothing is the common, correct/i);
  });

  it("tells the agent to look at what exists before writing", () => {
    expect(capturePrompt()).toMatch(/Look first/);
    expect(capturePrompt()).toMatch(/search <words>/);
  });

  it("warns that a write can be stopped, and that nothing is lost when it is", () => {
    // The agent has to know the refusal is answerable, or it will treat exit 2 as a failed write.
    expect(capturePrompt()).toMatch(/NOT write/);
    expect(capturePrompt()).toMatch(/Nothing is lost/i);
  });

  it("carries the heading discipline that makes lexical search work", () => {
    // Without this the store fills with findable-only-if-you-already-know-the-wording notes.
    expect(capturePrompt()).toMatch(/PUT THE SEARCH WORDS IN THE HEADING/);
  });

  it("uses the binary name the host actually invokes", () => {
    const p = capturePrompt("node /opt/dixti/cli.js");
    expect(p).toContain("`node /opt/dixti/cli.js search <words>`");
    expect(p).not.toContain("`dixti search");
  });
});
