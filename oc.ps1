<#
  OpenCode'a tek seferlik bir gorev gonderir, goreve gore modeli kendisi secer
  ve yalnizca cevabin metnini dondurur.

  Modlar:
    Salt okunur (varsayilan): -Dir ile verilen gercek klasorde arama/okuma.
        Ozel "claude-ro" ajani: yalnizca read/glob/grep/list; yazma, kabuk, web yasak.
    Yazma (-Write): yalnizca yeni, bos bir gecici klasorde; dosya olusturur, komut calistirir.

  Gorev turu (-Task) model zincirini belirler. Verilmezse tahmin edilir:
    search : -Dir verilmis ve -Write yok      -> dosya bulma, arama, okuma/ozet
    code   : -Write var                        -> betik, kod parcasi, boilerplate
    vision : -File ile resim eklenmis          -> ekran goruntusu/resim okuma
    text   : digerleri                         -> ceviri, yeniden yazma, kisa ozet

  Ucretli modeller yalnizca "code" zincirinin basinda, ucuz olanlar. Bakiye yetersiz
  hatasi gelirse 24 saat boyunca ucretli modeller atlanir. Pahali modeller
  (Opus, Fable, GPT Pro vb.) hicbir zaman otomatik secilmez; yalnizca -Model ile.

  Ornekler:
    oc.ps1 -Dir C:\proje -Prompt "Where is the login form defined? Reply with file paths only."
    oc.ps1 -Prompt "Translate to English: ..."
    oc.ps1 -Write -Prompt "Create csv_to_json.py that ..."
#>
param(
  [string]$Prompt = "",
  [string]$PromptFile = "",
  [string]$Dir = "",
  [switch]$Write,
  [ValidateSet("", "search", "text", "code", "vision")][string]$Task = "",
  [string]$Model = "",
  [switch]$FreeOnly,
  [string[]]$File = @(),
  [int]$TimeoutSec = 240
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if ($PromptFile) { $Prompt = [IO.File]::ReadAllText((Resolve-Path $PromptFile).Path, [Text.Encoding]::UTF8) }
if (-not $Prompt.Trim()) { Write-Output "[opencode] -Prompt veya -PromptFile gerekli."; exit 2 }
# Windows PowerShell 5.1 does not escape embedded quotes for native programs; do it here.
$nativePrompt = $Prompt -replace '(\\*)"', '$1$1\"'
if ($nativePrompt -match '\\+$') { $nativePrompt += $Matches[0] }
$cli = Join-Path $env:LOCALAPPDATA "Programs\@opencode-aidesktop\resources\opencode-cli.exe"
if (-not (Test-Path $cli)) {
  $cmd = Get-Command opencode -ErrorAction SilentlyContinue
  if ($cmd) { $cli = $cmd.Source } else { Write-Output "[opencode] CLI bulunamadi."; exit 2 }
}

# ---------- model zincirleri ----------
$chains = @{
  search = @{ paid = @();                                                   free = @("opencode/big-pickle", "opencode/deepseek-v4.1-flash-free", "opencode/mimo-v2.6-flash-free") }
  text   = @{ paid = @();                                                   free = @("opencode/deepseek-v4.1-flash-free", "opencode/big-pickle", "opencode/mimo-v2.6-flash-free") }
  code   = @{ paid = @("opencode/claude-haiku-5-5", "opencode/gpt-5.4-mini"); free = @("opencode/big-pickle", "opencode/deepseek-v4.1-flash-free") }
  vision = @{ paid = @();                                                   free = @("opencode/nemotron-3.5-super-vl-free", "opencode/big-pickle") }
}

# ---------- gorev turu tahmini ----------
if (-not $Task) {
  $imageExt = '\.(png|jpe?g|gif|webp|bmp)$'
  if ($File | Where-Object { $_ -match $imageExt }) { $Task = "vision" }
  elseif ($Write) { $Task = "code" }
  elseif ($Dir) { $Task = "search" }
  else { $Task = "text" }
}

$quotaFlag = Join-Path $here ".no-balance"
$paidBlocked = $FreeOnly -or ((Test-Path $quotaFlag) -and ((Get-Date) - (Get-Item $quotaFlag).LastWriteTime).TotalHours -lt 24)

if ($Model) { $models = @($Model) }
else {
  $models = @()
  if (-not $paidBlocked) { $models += $chains[$Task].paid }
  $models += $chains[$Task].free
}

# ---------- klasor ----------
$tempRoot = [IO.Path]::GetFullPath($env:TEMP)
if ($Write) {
  if ($Dir) {
    $full = [IO.Path]::GetFullPath($Dir)
    if (-not $full.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) {
      Write-Output "[opencode] REDDEDILDI: -Write yalnizca gecici klasorde calisir. -Dir vermeyin."
      exit 3
    }
  } else {
    $Dir = Join-Path $tempRoot ("opencode-task-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
    New-Item -ItemType Directory -Force $Dir | Out-Null
  }
} else {
  if (-not $Dir) {
    $Dir = Join-Path $tempRoot ("opencode-task-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
    New-Item -ItemType Directory -Force $Dir | Out-Null
  }
  if (-not (Test-Path $Dir -PathType Container)) { Write-Output "[opencode] Klasor yok: $Dir"; exit 2 }
  $Dir = (Resolve-Path $Dir).Path
}

$configJson = ""
if (-not $Write) {
  $perm = [ordered]@{ "*" = "deny"; read = "allow"; glob = "allow"; grep = "allow"; list = "allow" }
  $configJson = @{ agent = @{ "claude-ro" = @{ mode = "primary"; description = "Read-only search for Claude"; permission = $perm } } } |
    ConvertTo-Json -Depth 6 -Compress
}
$fileArgs = @(); foreach ($f in $File) { $fileArgs += @("--file", (Resolve-Path $f).Path) }

# ---------- calistir ----------
function Invoke-OC([string]$m) {
  $a = @("run", "--standalone", "--model", $m, "--format", "json", "--title", "claude-delegate")
  if ($Write) { $a += "--auto" } else { $a += @("--agent", "claude-ro") }
  $a += $fileArgs; $a += $nativePrompt

  $job = Start-Job -ScriptBlock {
    param($cli, $dir, $a, $cfg)
    if ($cfg) { $env:OPENCODE_CONFIG_CONTENT = $cfg }
    [Console]::OutputEncoding = [Text.Encoding]::UTF8
    Set-Location $dir
    & $cli @a 2>$null
  } -ArgumentList $cli, $Dir, $a, $configJson

  $r = [pscustomobject]@{ texts = @(); tools = @(); error = ""; quota = $false; session = ""; timeout = $false }
  if (-not (Wait-Job $job -Timeout $TimeoutSec)) {
    Stop-Job $job; Remove-Job $job -Force; $r.timeout = $true; $r.error = "zaman asimi ($TimeoutSec sn)"; return $r
  }
  foreach ($l in (Receive-Job $job)) {
    if (-not $l -or $l[0] -ne '{') { continue }
    try { $o = $l | ConvertFrom-Json } catch { continue }
    if ($o.sessionID) { $r.session = $o.sessionID }
    switch ($o.type) {
      "text"     { if ($o.part.text) { $r.texts += $o.part.text } }
      "tool_use" { $r.tools += $o.part.tool }
      "error"    {
        $msg = "$($o.error.message)"; if (-not $msg) { $msg = ($o | ConvertTo-Json -Depth 6 -Compress) }
        $r.error = $msg
        if ($o.error.type -eq "provider.quota" -or $o.error.status -eq 402 -or $msg -match "Insufficient balance") { $r.quota = $true }
      }
    }
  }
  Remove-Job $job -Force
  return $r
}

$tried = @(); $result = $null; $used = ""
foreach ($m in $models) {
  $isPaid = $m -notmatch '(-free$|^opencode/big-pickle$)'
  if ($isPaid -and $paidBlocked -and -not $Model) { continue }
  $r = Invoke-OC $m
  if ($r.quota) {
    New-Item -ItemType File -Force $quotaFlag | Out-Null
    $paidBlocked = $true
    $tried += "$m (bakiye yok)"
    continue
  }
  if ($r.texts.Count -and -not $r.error) { $result = $r; $used = $m; break }
  $tried += "$m ($(if ($r.error) { $r.error.Substring(0, [Math]::Min(120, $r.error.Length)) } else { 'bos cevap' }))"
  $result = $r
}
$usedPaid = $used -and ($used -notmatch '(-free$|^opencode/big-pickle$)')
if ($usedPaid -and (Test-Path $quotaFlag)) { Remove-Item $quotaFlag -Force }

$mode = if ($Write) { "yazma (gecici klasor)" } else { "salt okunur" }
if ($used) {
  $result.texts -join "`n"
  if ($result.tools.Count) { "`n[opencode] kullanilan araclar: " + (($result.tools | Select-Object -Unique) -join ", ") }
} else {
  "[opencode] BASARISIZ: hicbir model cevap vermedi."
}
if ($tried.Count) { "[opencode] atlanan/basarisiz: " + ($tried -join "; ") }
$paidNote = if ($paidBlocked -and -not $Model -and $chains[$Task].paid.Count) { " (ucretli atlandi: bakiye yok)" } else { "" }
"[opencode] gorev: $Task | model: $(if ($used) { $used } else { '-' })$paidNote | mod: $mode | klasor: $Dir | oturum: $($result.session)"
if (-not $used) { exit 1 }
