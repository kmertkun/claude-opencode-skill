# One-command installer for claude-opencode-skill (Windows).
#   irm https://raw.githubusercontent.com/kmertkun/claude-opencode-skill/main/install.ps1 | iex
# Also add the auto-use rule to ~/.claude/CLAUDE.md:
#   $env:OC_WITH_RULE=1; irm https://raw.githubusercontent.com/kmertkun/claude-opencode-skill/main/install.ps1 | iex

$ErrorActionPreference = "Stop"
$repo = "kmertkun/claude-opencode-skill"
$ref = if ($env:OC_SKILL_REF) { $env:OC_SKILL_REF } else { "main" }
$base = if ($env:OC_SKILL_BASE) { $env:OC_SKILL_BASE } else { "https://raw.githubusercontent.com/$repo/$ref" }
$claudeDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME ".claude" }
$dest = Join-Path $claudeDir "skills\opencode"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host "Node.js 18+ is required (Claude Code installs it)."; return }

[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
New-Item -ItemType Directory -Force $dest | Out-Null
foreach ($f in "SKILL.md", "oc.mjs") {
  Invoke-WebRequest -UseBasicParsing "$base/$f" -OutFile (Join-Path $dest "$f.tmp")
  Move-Item -Force (Join-Path $dest "$f.tmp") (Join-Path $dest $f)
}
foreach ($old in "oc.ps1", ".cli-cache.json") { Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $dest $old) }
Write-Host "Installed to $dest"

if ($env:OC_WITH_RULE -eq "1") {
  $md = Join-Path $claudeDir "CLAUDE.md"
  $mark = "<!-- claude-opencode-skill -->"
  if ((Test-Path $md) -and (Select-String -Path $md -SimpleMatch $mark -Quiet)) {
    Write-Host "Rule already present in $md"
  } else {
    $tmp = [IO.Path]::GetTempFileName()
    Invoke-WebRequest -UseBasicParsing "$base/rule.md" -OutFile $tmp
    $rule = [IO.File]::ReadAllText($tmp, [Text.Encoding]::UTF8)
    Remove-Item -Force $tmp
    [IO.File]::AppendAllText($md, $rule, (New-Object Text.UTF8Encoding $false))
    Write-Host "Rule added to $md"
  }
}

Write-Host ""
& node (Join-Path $dest "oc.mjs") --doctor
if ($LASTEXITCODE -ne 0) { Write-Host "OpenCode CLI not found yet. Install OpenCode (https://opencode.ai), then run: node `"$dest\oc.mjs`" --doctor" }
