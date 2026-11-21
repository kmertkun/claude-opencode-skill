---
name: opencode
description: Hand simple chores to the OpenCode AI on this PC (free models) to save Claude tokens, then verify the result. Use proactively in every project for simple, self-contained work — finding files or where something is defined, listing/counting matches across many files, summarizing a large file or folder, translating or rewording text, short standalone scripts, boilerplate, sample data, regex or command drafts. Also when the user types /opencode or says "opencode'a yaptır" / "opencode ile". Not for tasks that need this conversation's context, edits to the user's real files, secrets or personal data, or hard work that must be right.
---

# /opencode — basit işleri OpenCode'a ver

OpenCode is installed with a CLI and free models. Send it the chores, keep the thinking and the real edits for yourself, and always check what it returns.

Wrapper (PowerShell):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.claude\skills\opencode\oc.ps1" <options>
```

## Two modes

**Read-only (default)** — for searching and reading a real folder. Pass the folder with `-Dir`.
It runs a per-run agent (`claude-ro`) that may only read/glob/grep/list. Writing, shell, web and other folders are denied (tested: it refused to create files or run commands). No OpenCode config file is changed.

```powershell
... oc.ps1 -Dir "C:\path\to\project" -Prompt "Find every file that defines or calls sendInvoice. Reply only with relative paths and line numbers, one per line."
```

**Write (`-Write`)** — for producing new files. It always runs in a fresh, empty temp folder (it refuses a `-Dir` outside `%TEMP%`) with auto-approve on, so it may create files and run commands there only.

```powershell
... oc.ps1 -Write -Prompt "Create csv_to_json.py that reads input.csv and writes output.json. Only create that one file."
```

For long prompts or prompts containing double quotes, write the prompt to a UTF-8 file in your scratchpad and pass `-PromptFile path` instead of `-Prompt` (quotes on the powershell.exe command line get split into separate arguments).

Text-only tasks (translate, reword, draft) need neither option. Attach input files with `-File path` (repeatable). Other options: `-TimeoutSec` (default 240).

## Model selection (automatic)

The wrapper picks the model from the task type and falls back down the chain on error, timeout or empty answer. Don't pass `-Model` normally.

| `-Task` (guessed if omitted) | Guess rule | Chain |
|---|---|---|
| `search` | `-Dir` given, no `-Write` | big-pickle → deepseek-v4.1-flash-free → mimo-v2.6-flash-free |
| `text` | no `-Dir`, no `-Write` | deepseek-v4.1-flash-free → big-pickle → mimo-v2.6-flash-free |
| `code` | `-Write` | **paid cheap:** claude-haiku-5-5 → gpt-5.4-mini, then **free:** big-pickle → deepseek-v4.1-flash-free |
| `vision` | an image passed with `-File` | nemotron-3.5-super-vl-free → big-pickle |

User's choice: free first, and cheap paid models only for code. Expensive models (Opus, Fable, GPT Pro, etc.) are never picked automatically. Use `-Model` only when the user names a model. `-FreeOnly` skips paid models.

Paid models bill the user's OpenCode Console credits. When a paid call returns "insufficient balance", the wrapper writes `.no-balance` in this folder and skips paid models for 24 hours. A paid success clears it.

The footer line reports `gorev` (task), the `model` actually used, and any skipped models. Mention the model in your one-line note to the user.

## When to use it

Delegate:
- File and code finding: "where is X defined", "which files use Y", "list config files", "find TODOs".
- Bulk reading: summarizing a big file or folder, counting or listing matches across many files.
- Text chores: translation, rewording, short summaries.
- Small standalone outputs: scripts, snippets, boilerplate, test data, regex or command drafts (in write mode).

Keep it in Claude:
- A single quick Glob or Grep that answers in one call. Delegating takes 10–30 seconds and saves nothing.
- Anything that needs this conversation's context. OpenCode sees only the prompt, files you attach, and the `-Dir` folder.
- Editing the user's real files or running commands on their system.
- Passwords, tokens, `.env` contents or personal data, which would go to a third-party free model.
- Hard or high-stakes work.

## Rules

1. Write a self-contained prompt with the exact output format ("reply only with paths, one per line").
2. Verify before relying on it. Spot-check found paths (open one or two, or run a quick Grep). Read produced files and run or check the code yourself. Free models make mistakes.
3. Bring results into the user's project yourself with Claude's own tools, after review. Never point `-Write` at a real folder.
4. Tell the user in one short line that this part was done by OpenCode.
5. The wrapper already falls back across models. If it prints `BASARISIZ` (all models failed), just do the task yourself.

## Notes

- Each run uses `--standalone` (a private OpenCode server for that run) and is titled "claude-delegate".
- `%TEMP%\opencode-task-*` folders may stay behind. They are small and safe to delete later.
