
<!-- claude-opencode-skill -->
## OpenCode for simple chores

In every project, hand simple, self-contained chores to OpenCode through the `opencode` skill (`/opencode`) instead of doing them yourself. Examples: finding files or where something is defined, listing matches across many files, summarizing large files, translation, short standalone scripts, boilerplate. Load the skill and follow its rules: read-only mode for real folders, write mode only in a temp folder, always verify the result, and tell the user in one line that OpenCode did that part. Do it yourself when one quick Glob or Grep is enough, when the task needs conversation context, touches secrets, or edits the user's real files.
