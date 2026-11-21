#!/usr/bin/env bash
# One-command installer for claude-opencode-skill (macOS / Linux).
#   curl -fsSL https://raw.githubusercontent.com/kmertkun/claude-opencode-skill/main/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/kmertkun/claude-opencode-skill/main/install.sh | bash -s -- --with-rule
#
# --with-rule   also add a short rule to ~/.claude/CLAUDE.md so Claude uses the skill on its own in every project.
set -euo pipefail

REPO="kmertkun/claude-opencode-skill"
REF="${OC_SKILL_REF:-main}"
BASE="${OC_SKILL_BASE:-https://raw.githubusercontent.com/$REPO/$REF}"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
DEST="$CLAUDE_DIR/skills/opencode"
WITH_RULE=0
for a in "$@"; do [ "$a" = "--with-rule" ] && WITH_RULE=1; done

say() { printf '%s\n' "$*"; }

command -v node >/dev/null 2>&1 || { say "Node.js 18+ is required (Claude Code installs it)."; exit 1; }
command -v curl >/dev/null 2>&1 || { say "curl is required."; exit 1; }

mkdir -p "$DEST"
for f in SKILL.md oc.mjs; do
  curl -fsSL "$BASE/$f" -o "$DEST/$f.tmp"
  mv "$DEST/$f.tmp" "$DEST/$f"
done
rm -f "$DEST/oc.ps1" "$DEST/.cli-cache.json"
say "Installed to $DEST"

if [ "$WITH_RULE" = 1 ]; then
  MD="$CLAUDE_DIR/CLAUDE.md"
  MARK="<!-- claude-opencode-skill -->"
  if [ -f "$MD" ] && grep -qF "$MARK" "$MD"; then
    say "Rule already present in $MD"
  else
    curl -fsSL "$BASE/rule.md" >> "$MD"
    say "Rule added to $MD"
  fi
fi

say ""
node "$DEST/oc.mjs" --doctor || say "OpenCode CLI not found yet. Install OpenCode (https://opencode.ai), then run: node \"$DEST/oc.mjs\" --doctor"
