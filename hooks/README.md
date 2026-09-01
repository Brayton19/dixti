# Wiring dixti into your agent

dixti has no opinion about which agent you use. Two integration points, both plain commands:

| when | command | what it does |
|---|---|---|
| session start | `dixti dict` | prints the topic list, so the agent begins knowing what has been written about |
| session end | `dixti capture` | prints the instruction asking the agent to write a note — **or prints nothing and exits 1** when it is not worth asking |

Everything that matters is inside those two commands. The files in this directory are ~30-line
adapters that reshape their output for one specific host. **The instruction text and the decision of
whether to ask both live in `src/capture.ts`**, so every host asks the same thing under the same
conditions, and adding a host does not mean re-deriving what makes a store worth reading.

## The session-end contract

```bash
dixti capture --session "<id>" [--throttle 1800] [--force] [--json]
```

- **exit 0 + text on stdout** → ask the agent this, verbatim
- **exit 1 + no output** → say nothing; there is no store, it asked recently, or a note was already
  written since it last asked
- `--session` scopes throttling. Pass whatever your host calls a session; it defaults to `default`,
  which is fine for a host that has no concept of one.
- `--json` returns `{shouldPrompt, skipReason, explanation, prompt}` instead, for hosts that want to
  log or decide for themselves. **`--json` does not stamp**, so it is safe to poll.
- `--force` ignores the gating. Useful for testing and for a "capture now" command.
- `DIXTI_BIN_NAME` sets how dixti is named *inside* the prompt, for when it is not on PATH as
  `dixti` (e.g. `DIXTI_BIN_NAME="node /opt/dixti/cli.js"`).

Prompt timestamps live in `~/.dixti/capture/<session>` — per machine, not per repo, because which
session last asked is not a fact about the project and does not belong in its history.

## Any host, in three lines

```bash
sid="${MY_HOST_SESSION_ID:-default}"
prompt=$(dixti capture --session "$sid") || exit 0   # exit 1 = nothing to ask
printf '%s\n' "$prompt"                              # …however your host delivers instructions
```

If your host has no session-end event at all, run it on a timer or bind it to a command the user
types. A prompt that arrives late is worth far more than one that never arrives.

## Claude Code

`session-start.sh` and `session-stop.sh` here. Both wrap the command output in the JSON envelope
Claude Code expects (`hookSpecificOutput` / `decision: "block"`).

```jsonc
// ~/.claude/settings.json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command",
      "command": "$HOME/dev/dixti/hooks/session-start.sh", "timeout": 15 }] }],
    "Stop":         [{ "hooks": [{ "type": "command",
      "command": "$HOME/dev/dixti/hooks/session-stop.sh", "timeout": 15 }] }]
  }
}
```

**If you already have a blocking `Stop` hook**, do not add `session-stop.sh` beside it — two blocking
hooks re-wake the agent twice at every stop. Call dixti from the hook you already have and append its
output to your own instructions:

```bash
extra=$(dixti capture --session "$sid" 2>/dev/null) || extra=""
# …then include "$extra" in the reason string your hook already emits
```

## Other hosts

Not written yet, and each is a short file. `dixti capture` is the whole integration; the adapter only
has to deliver a string.

- **Codex / Cursor / Zed** — wherever the host runs a command at the end of a turn or session.
- **CI** — run `dixti capture --force` after a job and hand the output to whatever agent runs there.
- **A bare script** — the three lines above.

Contributions welcome: an adapter that does anything beyond reshaping the output is doing too much,
and the part it is duplicating probably belongs in `src/capture.ts` instead.
