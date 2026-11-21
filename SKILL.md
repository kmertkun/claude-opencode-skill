---
name: opencode
description: Hand simple chores to the OpenCode AI on this computer (free models) to save Claude tokens, then verify the result. Use proactively in every project for simple, self-contained work — finding files or where something is defined, listing/counting matches across many files, summarizing a large file or folder, translating or rewording text, short standalone scripts, boilerplate, sample data, regex or command drafts. Also when the user types /opencode or asks to "use opencode" / "opencode'a yaptır". Not for tasks that need this conversation's context, edits to the user's real files, secrets or personal data, or hard work that must be right.
---

# /opencode — hand simple chores to OpenCode

OpenCode's CLI is installed on this machine and has free models. Send it the chores, keep the thinking and the real edits for yourself, and always check what it returns.

Wrapper (Windows, macOS, Linux; needs Node 18+):

```bash
node "<this skill folder>/oc.mjs" [options] "prompt"
```

The skill folder is usually `~/.claude/skills/opencode` (on Windows: `%USERPROFILE%\.claude\skills\opencode`). Run `node oc.mjs --doctor` once if something fails. It shows which OpenCode CLI was found. It searches the desktop app, `~/.opencode/bin`, Homebrew, npm and `PATH`, and the `OPENCODE_BIN` env var overrides the search.

## Two modes

**Read-only (default)**: searches and reads a real folder passed with `--dir`. Each run uses its own agent (`claude-ro`) that only has read/glob/grep/list. Writing, shell, web and MCP actions are denied. Tested on OpenCode 1.x and 2.x: it refused to create files or run commands. No OpenCode config file is changed.

```bash
node oc.mjs --dir "/path/to/project" "Find every file that defines or calls sendInvoice. Reply only with relative paths and line numbers, one per line."
```

**Write (`--write`)**: produces new files. It always runs in a fresh, empty temp folder with auto-approve on, so it may create files and run commands there only. It refuses a `--dir` outside the system temp folder.

```bash
node oc.mjs --write "Create csv_to_json.py that reads input.csv and writes output.json. Only create that one file."
```

Text-only tasks (translate, reword, draft) need neither option. Other options:
- `--file path` attaches a file (repeatable).
- `--prompt-file path` reads a long prompt from a UTF-8 file. On Windows PowerShell 5.1, use it whenever the prompt contains double quotes, because 5.1 breaks quotes on native command lines.
- `--timeout sec` sets the per-model timeout (default 240).
- `--free-only` skips paid models.
- `--model id` forces a single model. Use it only when the user names a model.

## Model selection (automatic)

The wrapper picks the chain from the task type and falls back to the next model on error, timeout or an empty answer.

| `--task` (guessed if omitted) | Guess rule | Chain |
|---|---|---|
| `search` | `--dir` given, no `--write` | big-pickle → deepseek-v4.1-flash-free → mimo-v2.6-flash-free |
| `text` | no `--dir`, no `--write` | deepseek-v4.1-flash-free → big-pickle → mimo-v2.6-flash-free |
| `code` | `--write` | **paid, cheap:** claude-haiku-5-5 → gpt-5.4-mini, then **free:** big-pickle → deepseek-v4.1-flash-free |
| `vision` | an image passed with `--file` | nemotron-3.5-super-vl-free → big-pickle |

Free models come first. Cheap paid models are tried only for code. Expensive models (Opus, Fable, GPT Pro, ...) are never picked automatically. Paid models bill the OpenCode Console credits. When a paid call returns "insufficient balance", the wrapper writes `.no-balance` next to itself and skips paid models for 24 hours. A paid success clears that file.

The last line of the output reports the `task`, the `model` actually used, and the `mode`. Mention the model in your one-line note to the user.

## When to use it

Delegate:
- File and code finding: "where is X defined", "which files use Y", "list config files", "find TODOs".
- Bulk reading: summarizing a big file or folder, counting or listing matches across many files.
- Text chores: translation, rewording, short summaries.
- Small standalone outputs (write mode): scripts, snippets, boilerplate, test data, regex or command drafts.

Keep it in Claude:
- One quick Glob or Grep that answers in a single call. Delegating takes 5–30 seconds and saves nothing.
- Anything that needs this conversation's context. OpenCode sees only the prompt, the attached files and the `--dir` folder.
- Editing the user's real files or running commands on their system.
- Passwords, tokens, `.env` contents or personal data, because they would go to a third-party model.
- Hard or high-stakes work.

## Rules

1. Write a self-contained prompt that states the exact output format ("reply only with paths, one per line").
2. Verify before relying on the result. Spot-check found paths (open one or two, or run a quick Grep). Read produced files and run or check the code yourself. Free models make mistakes.
3. Bring results into the user's project yourself, with Claude's own tools, after review. Never point `--write` at a real folder.
4. Tell the user in one short line that this part was done by OpenCode, and with which model.
5. The wrapper already falls back across models. If it prints `FAILED` (exit code 1), do the task yourself.
