#!/usr/bin/env node
// claude-opencode-skill — hand simple chores from Claude Code to the OpenCode CLI.
// Cross-platform (Windows, macOS, Linux). Needs Node 18+ (Claude Code already ships with Node).
//
//   node oc.mjs [options] "prompt"
//   node oc.mjs [options] --prompt-file prompt.txt
//   node oc.mjs --doctor
//
// Options:
//   --dir <path>        Folder to work in. Without --write it is opened read-only.
//   --write             Write mode: runs in a fresh temp folder with auto-approve (refuses non-temp --dir).
//   --task <t>          search | text | code | vision (guessed when omitted).
//   --model <id>        Force one model (skips the automatic chain).
//   --free-only         Never try paid models.
//   --file <path>       Attach a file (repeatable).
//   --timeout <sec>     Per-model timeout, default 240.
//   --prompt-file <p>   Read the prompt from a UTF-8 file.
//   --doctor            Show which OpenCode CLI was found and what it supports.

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IS_WIN = process.platform === "win32";
const HOME = os.homedir();

// ---------------------------------------------------------------- model chains
const CHAINS = {
  search: { paid: [], free: ["opencode/big-pickle", "opencode/deepseek-v4.1-flash-free", "opencode/mimo-v2.6-flash-free"] },
  text:   { paid: [], free: ["opencode/deepseek-v4.1-flash-free", "opencode/big-pickle", "opencode/mimo-v2.6-flash-free"] },
  code:   { paid: ["opencode/claude-haiku-5-5", "opencode/gpt-5.4-mini"], free: ["opencode/big-pickle", "opencode/deepseek-v4.1-flash-free"] },
  vision: { paid: [], free: ["opencode/nemotron-3.5-super-vl-free", "opencode/big-pickle"] },
};
const isFree = (m) => /-free$/.test(m) || m === "opencode/big-pickle";
const QUOTA_FLAG = path.join(HERE, ".no-balance");
const QUOTA_HOURS = 24;

// ---------------------------------------------------------------- args
function parseArgs(argv) {
  const o = { files: [], timeout: 240, rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) fail(`missing value for ${a}`);
      return argv[++i];
    };
    switch (a) {
      case "--dir": o.dir = next(); break;
      case "--write": o.write = true; break;
      case "--task": o.task = next(); break;
      case "--model": o.model = next(); break;
      case "--free-only": o.freeOnly = true; break;
      case "--file": o.files.push(next()); break;
      case "--timeout": o.timeout = Number(next()) || 240; break;
      case "--prompt": o.prompt = next(); break;
      case "--prompt-file": o.promptFile = next(); break;
      case "--doctor": o.doctor = true; break;
      case "-h": case "--help": o.help = true; break;
      case "--": o.rest.push(...argv.slice(i + 1)); i = argv.length; break;
      default: o.rest.push(a);
    }
  }
  return o;
}

function fail(msg, code = 2) {
  console.log(`[opencode] ${msg}`);
  process.exit(code);
}

// ---------------------------------------------------------------- CLI discovery
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };

function whichAll(names) {
  const dirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const exts = IS_WIN ? [".exe", ".cmd", ".bat", ""] : [""];
  const out = [];
  for (const d of dirs) for (const n of names) for (const e of exts) {
    const p = path.join(d, n + e);
    if (isFile(p)) out.push(p);
  }
  return out;
}

// npm installs a .cmd/.ps1/sh shim; resolve it to the real platform binary so arguments
// are passed without a shell (no quoting problems).
function resolveNpmShim(shim) {
  const dir = path.dirname(shim);
  // Platform package may be nested under opencode-ai or hoisted next to it.
  const searchDirs = [
    path.join(dir, "node_modules", "opencode-ai", "node_modules"),
    path.join(dir, "node_modules"),
    path.join(dir, "..", "node_modules", "opencode-ai", "node_modules"), // <prefix>/node_modules/.bin shim
    path.join(dir, ".."),
    path.join(dir, "..", "lib", "node_modules", "opencode-ai", "node_modules"), // unix prefix/bin -> prefix/lib
    path.join(dir, "..", "lib", "node_modules"),
  ];
  for (const nm of searchDirs) {
    if (!exists(nm)) continue;
    const plat = { win32: "windows", darwin: "darwin", linux: "linux" }[process.platform];
    const arch = process.arch === "x64" ? "x64" : process.arch;
    const names = fs.readdirSync(nm).filter((n) => n.startsWith(`opencode-${plat}-${arch}`)).sort((a, b) => a.length - b.length);
    for (const n of names) {
      const bin = path.join(nm, n, "bin", IS_WIN ? "opencode.exe" : "opencode");
      if (isFile(bin)) return bin;
    }
  }
  return null;
}

function scanMacApps() {
  const out = [];
  for (const apps of ["/Applications", path.join(HOME, "Applications")]) {
    let entries = [];
    try { entries = fs.readdirSync(apps); } catch { continue; }
    for (const e of entries) {
      if (!/opencode/i.test(e) || !e.endsWith(".app")) continue;
      for (const sub of ["Contents/Resources", "Contents/MacOS"]) {
        for (const n of ["opencode-cli", "opencode"]) out.push(path.join(apps, e, sub, n));
      }
    }
  }
  return out;
}

function candidates() {
  const c = [];
  if (IS_WIN) {
    const la = process.env.LOCALAPPDATA || path.join(HOME, "AppData", "Local");
    let progs = [];
    try { progs = fs.readdirSync(path.join(la, "Programs")).filter((n) => /opencode/i.test(n)); } catch {}
    for (const p of progs) c.push(path.join(la, "Programs", p, "resources", "opencode-cli.exe"));
    c.push(path.join(HOME, ".opencode", "bin", "opencode.exe"));
  } else if (process.platform === "darwin") {
    c.push(...scanMacApps());
    c.push(path.join(HOME, ".opencode", "bin", "opencode"), "/opt/homebrew/bin/opencode", "/usr/local/bin/opencode");
  } else {
    c.push(
      path.join(HOME, ".opencode", "bin", "opencode"),
      path.join(HOME, ".local", "bin", "opencode"),
      "/opt/OpenCode/resources/opencode-cli",
      "/opt/opencode/resources/opencode-cli",
      "/usr/lib/opencode/resources/opencode-cli",
      "/usr/local/bin/opencode",
      "/usr/bin/opencode",
    );
  }
  for (const p of whichAll(["opencode-cli", "opencode"])) {
    if (IS_WIN && /\.(cmd|bat)$/i.test(p)) { const r = resolveNpmShim(p); if (r) c.push(r); continue; }
    c.push(p);
  }
  return [...new Set(c)];
}

function probe(bin) {
  const v = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 30000, windowsHide: true });
  if (v.error || v.status !== 0) return null;
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(v.stdout + v.stderr);
  if (!m) return null;
  const h = spawnSync(bin, ["run", "--help"], { encoding: "utf8", timeout: 30000, windowsHide: true });
  const help = (h.stdout || "") + (h.stderr || "");
  return {
    bin,
    version: m[0],
    major: Number(m[1]),
    standalone: help.includes("--standalone"),
    auto: help.includes("--auto"),
    agent: help.includes("--agent"),
    json: help.includes("--format"),
  };
}

function findCli() {
  // An explicit OPENCODE_BIN always wins and is never cached.
  if (process.env.OPENCODE_BIN) {
    const bin = process.env.OPENCODE_BIN;
    const p = isFile(bin) ? probe(bin) : null;
    if (p && p.json) return p;
    return { error: true, tried: [`OPENCODE_BIN=${bin} -> ${p ? "no --format json support" : "not working"}`] };
  }
  const cacheFile = path.join(HERE, ".cli-cache.json");
  try {
    const c = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    if (isFile(c.bin) && fs.statSync(c.bin).mtimeMs === c.mtime) return c;
  } catch {}
  const tried = [];
  // Prefer the newest version among the working candidates.
  let best = null;
  for (const bin of candidates()) {
    if (!isFile(bin)) continue;
    const p = probe(bin);
    tried.push(`${bin} -> ${p ? p.version : "not working"}`);
    if (!p || !p.json) continue;
    if (!best || cmpVer(p.version, best.version) > 0) best = p;
  }
  if (!best) return { error: true, tried };
  best.mtime = fs.statSync(best.bin).mtimeMs;
  try { fs.writeFileSync(cacheFile, JSON.stringify(best)); } catch {}
  return best;
}

function cmpVer(a, b) {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

// ---------------------------------------------------------------- read-only agent
function readOnlyConfig(cli) {
  if (cli.major >= 2) {
    return { agent: { "claude-ro": { mode: "primary", description: "Read-only search for Claude",
      permission: { "*": "deny", read: "allow", glob: "allow", grep: "allow", list: "allow" } } } };
  }
  // OpenCode 1.x: tools are switched off per agent, plus permission denies as a second guard.
  return { agent: { "claude-ro": { mode: "primary", description: "Read-only search for Claude",
    tools: { "*": false, read: true, glob: true, grep: true, list: true },
    permission: { edit: "deny", bash: "deny", webfetch: "deny" } } } };
}

// ---------------------------------------------------------------- run one model
function killTree(child) {
  if (!child.pid) return;
  if (IS_WIN) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
  else { try { process.kill(-child.pid, "SIGKILL"); } catch { try { child.kill("SIGKILL"); } catch {} } }
}

function runModel(cli, opts, model) {
  const args = ["run"];
  if (cli.standalone) args.push("--standalone");
  args.push("--model", model, "--format", "json");
  if (cli.major >= 2) args.push("--title", "claude-delegate");
  if (opts.write) { if (cli.auto) args.push("--auto"); }
  else args.push("--agent", "claude-ro");
  for (const f of opts.files) args.push("--file", f);
  args.push(opts.prompt);

  const env = { ...process.env };
  // OpenCode picks its project folder from these before the real cwd (seen with 1.x in GitHub
  // Actions). Pin them to the chosen folder so read-only/write never lands somewhere else.
  env.PWD = opts.dir;
  for (const k of ["GITHUB_WORKSPACE", "INIT_CWD", "OLDPWD"]) delete env[k];
  if (!opts.write) env.OPENCODE_CONFIG_CONTENT = JSON.stringify(readOnlyConfig(cli));

  return new Promise((resolve) => {
    const r = { texts: [], tools: [], error: "", quota: false, session: "", timeout: false };
    const child = spawn(cli.bin, args, { cwd: opts.dir, env, windowsHide: true, detached: !IS_WIN, stdio: ["ignore", "pipe", "pipe"] });
    let buf = "";
    const onLine = (line) => {
      line = line.trim();
      if (!line.startsWith("{")) return;
      let o; try { o = JSON.parse(line); } catch { return; }
      if (o.sessionID) r.session = o.sessionID;
      if (o.type === "text" && o.part?.text) r.texts.push(o.part.text);
      else if (o.type === "tool_use" && o.part?.tool) {
        r.tools.push(o.part.tool);
        if (process.env.OC_DEBUG) {
          const s = o.part.state || {};
          const res = String(s.error || s.output || "").replace(/\s+/g, " ").slice(0, 300);
          process.stderr.write(`[opencode:debug] ${o.part.tool} ${s.status || ""} ${JSON.stringify(s.input || {})} -> ${res}\n`);
        }
      }
      else if (o.type === "error") {
        const e = o.error || {};
        const msg = e.message || e.data?.message || JSON.stringify(o);
        r.error = String(msg);
        if (e.type === "provider.quota" || e.status === 402 || /insufficient balance/i.test(r.error)) r.quota = true;
      }
    };
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { onLine(buf.slice(0, i)); buf = buf.slice(i + 1); } });
    child.stderr.on("data", () => {});
    const timer = setTimeout(() => { r.timeout = true; r.error = `timeout (${opts.timeout}s)`; killTree(child); }, opts.timeout * 1000);
    child.on("error", (e) => { r.error = String(e.message || e); });
    child.on("close", () => { clearTimeout(timer); if (buf) onLine(buf); resolve(r); });
  });
}

// ---------------------------------------------------------------- main
function tempTaskDir() {
  const d = path.join(os.tmpdir(), "opencode-task-" + crypto.randomBytes(4).toString("hex"));
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function isInside(child, parent) {
  const c = fs.realpathSync(child), p = fs.realpathSync(parent);
  const rel = path.relative(p, c);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 22).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
    return;
  }

  const cli = findCli();
  if (opts.doctor) {
    if (cli.error) {
      console.log("OpenCode CLI: NOT FOUND");
      console.log("Checked:\n  " + (cli.tried.length ? cli.tried.join("\n  ") : "(no candidates on this system)"));
      console.log("Install OpenCode (https://opencode.ai) or set OPENCODE_BIN to the CLI path.");
      process.exit(1);
    }
    console.log(`OpenCode CLI: ${cli.bin}\nversion: ${cli.version}  standalone: ${cli.standalone}  auto: ${cli.auto}  agent: ${cli.agent}`);
    console.log(`platform: ${process.platform}/${process.arch}  node: ${process.version}  temp: ${os.tmpdir()}`);
    const blocked = isFile(QUOTA_FLAG) && (Date.now() - fs.statSync(QUOTA_FLAG).mtimeMs) / 36e5 < QUOTA_HOURS;
    console.log(`paid models: ${blocked ? "skipped (no balance seen in the last 24h)" : "allowed for code tasks"}`);
    return;
  }
  if (cli.error) fail("OpenCode CLI not found. Run: node oc.mjs --doctor", 2);
  if (!cli.agent && !opts.write) fail(`OpenCode ${cli.version} has no --agent flag, so read-only mode cannot be enforced. Update OpenCode.`, 2);

  // prompt
  let prompt = opts.prompt ?? "";
  if (opts.promptFile) prompt = fs.readFileSync(opts.promptFile, "utf8");
  if (!prompt && opts.rest.length) prompt = opts.rest.join(" ");
  if (!prompt.trim()) fail("a prompt is required (argument, --prompt or --prompt-file)");
  opts.prompt = prompt;
  opts.files = opts.files.map((f) => path.resolve(f));
  for (const f of opts.files) if (!isFile(f)) fail(`file not found: ${f}`);

  // folder
  if (opts.write) {
    if (opts.dir) {
      if (!exists(opts.dir) || !isInside(opts.dir, os.tmpdir())) fail("REFUSED: --write only runs in a temp folder. Leave out --dir.", 3);
      opts.dir = path.resolve(opts.dir);
    } else opts.dir = tempTaskDir();
  } else {
    opts.dir = opts.dir ? path.resolve(opts.dir) : tempTaskDir();
    if (!exists(opts.dir) || !fs.statSync(opts.dir).isDirectory()) fail(`folder not found: ${opts.dir}`);
  }

  // task + chain
  let task = opts.task;
  if (task && !CHAINS[task]) fail(`unknown --task ${task} (search|text|code|vision)`);
  if (!task) {
    if (opts.files.some((f) => /\.(png|jpe?g|gif|webp|bmp)$/i.test(f))) task = "vision";
    else if (opts.write) task = "code";
    else if (opts.dir && !path.basename(opts.dir).startsWith("opencode-task-")) task = "search";
    else task = "text";
  }
  let paidBlocked = !!opts.freeOnly ||
    (isFile(QUOTA_FLAG) && (Date.now() - fs.statSync(QUOTA_FLAG).mtimeMs) / 36e5 < QUOTA_HOURS);
  const models = opts.model ? [opts.model] : [...(paidBlocked ? [] : CHAINS[task].paid), ...CHAINS[task].free];

  const tried = [];
  let result = null, used = "";
  for (const m of models) {
    if (!opts.model && !isFree(m) && paidBlocked) continue;
    const r = await runModel(cli, opts, m);
    if (r.quota) {
      try { fs.writeFileSync(QUOTA_FLAG, new Date().toISOString()); } catch {}
      paidBlocked = true;
      tried.push(`${m} (no balance)`);
      continue;
    }
    result = r;
    if (r.texts.length && !r.error) { used = m; break; }
    tried.push(`${m} (${r.error ? r.error.slice(0, 120) : "empty answer"})`);
  }
  if (used && !isFree(used) && isFile(QUOTA_FLAG)) { try { fs.unlinkSync(QUOTA_FLAG); } catch {} }

  if (used) {
    console.log(result.texts.join("\n"));
    if (result.tools.length) console.log(`\n[opencode] tools used: ${[...new Set(result.tools)].join(", ")}`);
  } else {
    console.log("[opencode] FAILED: no model answered.");
  }
  if (tried.length) console.log(`[opencode] skipped/failed: ${tried.join("; ")}`);
  const paidNote = paidBlocked && !opts.model && CHAINS[task].paid.length ? " (paid skipped: no balance)" : "";
  const mode = opts.write ? "write (temp folder)" : "read-only";
  console.log(`[opencode] task: ${task} | model: ${used || "-"}${paidNote} | mode: ${mode} | dir: ${opts.dir} | session: ${result?.session || "-"}`);
  process.exit(used ? 0 : 1);
}

main().catch((e) => fail(`error: ${e?.stack || e}`, 1));
