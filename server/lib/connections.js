/**
 * @file connections.js
 * @description Account connections: sign-in flows that the operator defines in a
 * JSON file (`DASHBOARD_CONNECTIONS_FILE`) and that the dashboard runs for the
 * person using it, so they can connect their own accounts (an MCP server's
 * OAuth, a CLI's device-code login) without opening a terminal.
 *
 * Trust model: every command comes from the operator's file as an argv array
 * and is spawned without a shell. A request only names a connection id and, for
 * a flow that asks for it, supplies one line of text (a pasted redirect URL),
 * which is written to the login command's stdin. With no file configured the
 * feature is off and nothing is ever spawned.
 *
 * A login is a job: the command's output is kept (ANSI stripped), sign-in links
 * and a device code are extracted from it, and the job ends when the command
 * exits, is cancelled, or times out. One job per connection at a time. A login
 * may keep working after the sign-in itself (cloning repositories, say); the
 * operator's `signedInPattern` tells the page when to stop showing the sign-in
 * steps and show the command's latest line instead.
 *
 * A connection can be `required` (always, or when an operator command exits 0).
 * The dashboard then asks for it before anything else, until it is connected
 * and its sign-in job has finished.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const fs = require("node:fs");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MAX_CONNECTIONS = 20;
const MAX_ARGS = 64;
const MAX_ARG_LENGTH = 4096;
const MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_INPUT_LENGTH = 8192;
const MAX_INPUTS_PER_JOB = 5;
const MAX_URLS = 10;
const STATUS_TIMEOUT_MS = 15_000;
const LOGOUT_TIMEOUT_MS = 30_000;
const DEFAULT_LOGIN_TIMEOUT_S = 600;
const FINISHED_JOB_TTL_MS = 10 * 60_000;
const KILL_GRACE_MS = 3_000;
const DEFAULT_CODE_PATTERN = "\\bcode[:\\s]+([A-Z0-9]{4,12}(?:-[A-Z0-9]{4,12})?)\\b";

// OSC 8 hyperlinks carry the link target; other escape sequences are noise.
const OSC8_RE = /\u001b\]8;[^;\u0007\u001b]*;([^\u0007\u001b]*)(?:\u0007|\u001b\\)/g;
const OSC_RE = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;
const CSI_RE = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const OTHER_ESC_RE = /\u001b[@-Z\\-_]/g;
const URL_RE = /https?:\/\/[^\s"'<>`\u0007\u001b]+/g;
// Anything a single pasted line must not carry: C0 controls and DEL.
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

/** connection id -> job (running, or finished and not yet expired). */
const jobs = new Map();
let cached = { path: null, mtimeMs: null, result: null };

class ConnectionError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function configPath() {
  return (process.env.DASHBOARD_CONNECTIONS_FILE || "").trim();
}

function asCommand(value, where) {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > MAX_ARGS ||
    !value.every((a) => typeof a === "string" && a.length <= MAX_ARG_LENGTH) ||
    !value[0].trim()
  ) {
    throw new Error(`${where} must be a non-empty array of strings (a command and its arguments)`);
  }
  return value.slice();
}

function asText(value, where, max) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > max) {
    throw new Error(`${where} must be a string of at most ${max} characters`);
  }
  return value;
}

function parseConnection(raw, index) {
  const where = `connections[${index}]`;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${where} must be an object`);
  }
  if (typeof raw.id !== "string" || !ID_RE.test(raw.id)) {
    throw new Error(`${where}.id must match ${ID_RE}`);
  }
  const name = asText(raw.name, `${where}.name`, 80).trim();
  if (!name) throw new Error(`${where}.name is required`);

  const loginRaw = Array.isArray(raw.login) ? { command: raw.login } : raw.login;
  if (!loginRaw || typeof loginRaw !== "object") {
    throw new Error(`${where}.login is required: a command, or { "command": [...] }`);
  }
  const timeout =
    loginRaw.timeoutSeconds === undefined ? DEFAULT_LOGIN_TIMEOUT_S : loginRaw.timeoutSeconds;
  if (!Number.isInteger(timeout) || timeout < 10 || timeout > 3600) {
    throw new Error(`${where}.login.timeoutSeconds must be an integer from 10 to 3600`);
  }
  const codePattern =
    loginRaw.codePattern === undefined ? DEFAULT_CODE_PATTERN : loginRaw.codePattern;
  let codeRegex;
  try {
    if (typeof codePattern !== "string" || codePattern.length > 300) throw new Error("bad");
    codeRegex = new RegExp(codePattern);
  } catch {
    throw new Error(
      `${where}.login.codePattern must be a regular expression with one capture group`
    );
  }
  let signedInRegex = null;
  if (loginRaw.signedInPattern !== undefined) {
    try {
      if (typeof loginRaw.signedInPattern !== "string" || loginRaw.signedInPattern.length > 300) {
        throw new Error("bad");
      }
      signedInRegex = new RegExp(loginRaw.signedInPattern, "m");
    } catch {
      throw new Error(`${where}.login.signedInPattern must be a regular expression`);
    }
  }
  let required = { always: false, when: null };
  if (raw.required === true) {
    required = { always: true, when: null };
  } else if (raw.required && typeof raw.required === "object" && !Array.isArray(raw.required)) {
    required = { always: false, when: asCommand(raw.required.when, `${where}.required.when`) };
  } else if (raw.required !== undefined && raw.required !== false) {
    throw new Error(`${where}.required must be true, false or { "when": [command] }`);
  }
  let input = null;
  if (loginRaw.input) {
    const spec = loginRaw.input === true ? {} : loginRaw.input;
    if (typeof spec !== "object" || Array.isArray(spec)) {
      throw new Error(`${where}.login.input must be true or { "label", "placeholder" }`);
    }
    input = {
      label: asText(spec.label, `${where}.login.input.label`, 300),
      placeholder: asText(spec.placeholder, `${where}.login.input.placeholder`, 300),
    };
  }
  return {
    id: raw.id,
    name,
    description: asText(raw.description, `${where}.description`, 500),
    status: raw.status === undefined ? null : asCommand(raw.status, `${where}.status`),
    logout: raw.logout === undefined ? null : asCommand(raw.logout, `${where}.logout`),
    required,
    login: {
      command: asCommand(loginRaw.command, `${where}.login.command`),
      timeoutMs: timeout * 1000,
      codeRegex,
      signedInRegex,
      input,
    },
  };
}

/**
 * Read the operator's file.
 * @returns {{ enabled: boolean, error: string|null, connections: object[] }}
 *   `enabled` is false only when no file is configured. A file that cannot be
 *   read or parsed keeps the feature on with `error` set, so the operator sees why.
 */
function loadConfig() {
  const file = configPath();
  if (!file) return { enabled: false, error: null, connections: [] };
  let mtimeMs = null;
  try {
    mtimeMs = fs.statSync(file).mtimeMs;
  } catch {
    /* reported by the read below */
  }
  if (cached.result && cached.path === file && cached.mtimeMs === mtimeMs && mtimeMs !== null) {
    return cached.result;
  }
  let result;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const list = parsed && parsed.connections;
    if (!Array.isArray(list)) throw new Error('expected { "connections": [...] }');
    if (list.length > MAX_CONNECTIONS) throw new Error(`at most ${MAX_CONNECTIONS} connections`);
    const connections = list.map(parseConnection);
    const seen = new Set();
    for (const c of connections) {
      if (seen.has(c.id)) throw new Error(`connection id "${c.id}" is used twice`);
      seen.add(c.id);
    }
    result = { enabled: true, error: null, connections };
  } catch (err) {
    result = {
      enabled: true,
      error: `could not load ${file}: ${err.code === "ENOENT" ? "file not found" : err.message}`,
      connections: [],
    };
  }
  cached = { path: file, mtimeMs, result };
  return result;
}

function findConnection(id) {
  const config = loadConfig();
  const connection = config.connections.find((c) => c.id === id);
  if (!connection) throw new ConnectionError("ENOCONNECTION", `no connection named "${id}"`, 404);
  return connection;
}

// ── Output handling ───────────────────────────────────────────────────────────

function stripEscapes(text) {
  return text
    .replace(OSC_RE, "")
    .replace(CSI_RE, "")
    .replace(OTHER_ESC_RE, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function trimUrl(url) {
  return url.replace(/[.,;:!?)\]}>]+$/, "");
}

/**
 * Sign-in links in raw command output, in order of appearance. A hyperlink's
 * target wins over the visible text, which a CLI may have wrapped to the
 * terminal width (a wrapped piece is a prefix of the target and is dropped).
 */
function extractUrls(raw) {
  const targets = [];
  for (const m of raw.matchAll(OSC8_RE)) {
    if (/^https?:\/\//.test(m[1])) targets.push(m[1]);
  }
  const plain = (stripEscapes(raw).match(URL_RE) || []).map(trimUrl);
  const out = [];
  for (const url of [...targets, ...plain]) {
    if (!url || out.includes(url)) continue;
    if (targets.some((t) => t !== url && t.startsWith(url))) continue;
    out.push(url);
    if (out.length >= MAX_URLS) break;
  }
  return out;
}

function firstLine(text) {
  const line = stripEscapes(String(text || ""))
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  return line ? line.slice(0, 300) : "";
}

// ── One-shot commands (status, logout) ────────────────────────────────────────

/**
 * Run a command to completion without a shell.
 * @param {string[]} command argv array from the operator's file.
 * @param {number} timeoutMs Kill the command (SIGKILL) after this long.
 * @param {number} [maxBytes=8192] Keep at most this much of stdout and of stderr.
 * @returns {Promise<{ code: number|null, stdout: string, stderr: string }>}
 */
function runOnce(command, timeoutMs, maxBytes = 8192) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command[0], command.slice(1), {
        cwd: os.homedir(),
        env: { ...process.env, NO_COLOR: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      return resolve({ code: null, stdout: "", stderr: err.message });
    }
    let stdout = "";
    let stderr = "";
    let done = false;
    const finish = (code, extra) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr: extra || stderr });
    };
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* already gone */
      }
      finish(null, "timed out");
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      if (stdout.length < maxBytes) stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d) => {
      if (stderr.length < maxBytes) stderr += d.toString("utf8");
    });
    child.on("error", (err) =>
      finish(null, err.code === "ENOENT" ? `command not found: ${command[0]}` : err.message)
    );
    child.on("close", (code) => finish(code));
  });
}

/**
 * @returns {Promise<{ connected: boolean|null, account: string, detail: string }>}
 *   `connected` is null when the connection has no status command.
 */
/**
 * Whether the dashboard should ask for this connection before anything else.
 * A `when` command decides at request time: exit 0 means required.
 */
async function isRequired(connection) {
  if (connection.required.always) return true;
  if (!connection.required.when) return false;
  const r = await runOnce(connection.required.when, STATUS_TIMEOUT_MS);
  return r.code === 0;
}

async function checkStatus(connection) {
  if (!connection.status) return { connected: null, account: "", detail: "" };
  const r = await runOnce(connection.status, STATUS_TIMEOUT_MS);
  if (r.code === 0) return { connected: true, account: firstLine(r.stdout), detail: "" };
  return { connected: false, account: "", detail: firstLine(r.stderr) || firstLine(r.stdout) };
}

// ── Login jobs ────────────────────────────────────────────────────────────────

/** The last non-empty output line, for showing what a login is doing now. */
function lastLine(text) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.length ? lines[lines.length - 1].slice(0, 300) : "";
}

function publicJob(job) {
  if (!job) return null;
  const text = stripEscapes(job.raw);
  const code = job.connection.login.codeRegex.exec(text);
  const { signedInRegex } = job.connection.login;
  return {
    id: job.id,
    connectionId: job.connection.id,
    state: job.state,
    startedAt: job.startedAt,
    endedAt: job.endedAt,
    exitCode: job.exitCode,
    output: text,
    urls: extractUrls(job.raw),
    code: code && code[1] ? code[1] : null,
    acceptsInput: Boolean(job.connection.login.input) && job.state === "running",
    signedIn: Boolean(signedInRegex && signedInRegex.test(text)),
    progress: lastLine(text),
    inputLabel: job.connection.login.input ? job.connection.login.input.label : "",
    inputPlaceholder: job.connection.login.input ? job.connection.login.input.placeholder : "",
  };
}

function currentJob(id) {
  const job = jobs.get(id);
  if (!job) return null;
  if (job.state !== "running" && Date.now() - Date.parse(job.endedAt) > FINISHED_JOB_TTL_MS) {
    jobs.delete(id);
    return null;
  }
  return job;
}

function killTree(job, signal) {
  const pid = job.child && job.child.pid;
  try {
    // The login command is its own process group, so helpers it started go too.
    if (pid && process.platform !== "win32") process.kill(-pid, signal);
    else job.child.kill(signal);
  } catch {
    try {
      job.child.kill(signal);
    } catch {
      /* already gone */
    }
  }
}

function stopJob(job, state) {
  if (job.state !== "running") return;
  job.stopState = state;
  killTree(job, "SIGTERM");
  job.killTimer = setTimeout(() => killTree(job, "SIGKILL"), KILL_GRACE_MS);
  if (typeof job.killTimer.unref === "function") job.killTimer.unref();
}

/**
 * Start the connection's login command, or return the job already running.
 * @returns {{ job: object, started: boolean }}
 */
function startLogin(id) {
  const connection = findConnection(id);
  const existing = currentJob(id);
  if (existing && existing.state === "running") return { job: publicJob(existing), started: false };

  const { command, timeoutMs } = connection.login;
  const job = {
    id: crypto.randomUUID(),
    connection,
    state: "running",
    startedAt: new Date().toISOString(),
    endedAt: null,
    exitCode: null,
    raw: "",
    inputs: 0,
    stopState: null,
    child: null,
    timer: null,
    killTimer: null,
  };
  const append = (chunk) => {
    job.raw += chunk.toString("utf8");
    if (job.raw.length > MAX_OUTPUT_BYTES) job.raw = job.raw.slice(-MAX_OUTPUT_BYTES);
  };
  const finish = (state, exitCode) => {
    if (job.state !== "running") return;
    clearTimeout(job.timer);
    clearTimeout(job.killTimer);
    job.state = job.stopState || state;
    job.exitCode = exitCode;
    job.endedAt = new Date().toISOString();
  };
  try {
    job.child = spawn(command[0], command.slice(1), {
      cwd: os.homedir(),
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
  } catch (err) {
    throw new ConnectionError("ESPAWN", `could not start the sign-in command: ${err.message}`, 500);
  }
  job.child.stdout.on("data", append);
  job.child.stderr.on("data", append);
  job.child.stdin.on("error", () => {
    /* the command closed its stdin; a later input is refused */
  });
  job.child.on("error", (err) => {
    append(err.code === "ENOENT" ? `command not found: ${command[0]}\n` : `${err.message}\n`);
    finish("failed", null);
  });
  job.child.on("close", (code) => finish(code === 0 ? "succeeded" : "failed", code));
  job.timer = setTimeout(() => stopJob(job, "timeout"), timeoutMs);
  if (typeof job.timer.unref === "function") job.timer.unref();
  jobs.set(id, job);
  return { job: publicJob(job), started: true };
}

function getJob(id) {
  findConnection(id);
  return publicJob(currentJob(id));
}

/** Write one line (a pasted redirect URL) to the running login command. */
function sendInput(id, text) {
  const connection = findConnection(id);
  const job = currentJob(id);
  if (!job || job.state !== "running") {
    throw new ConnectionError("ENOTRUNNING", "no sign-in is in progress for this connection", 409);
  }
  if (!connection.login.input) {
    throw new ConnectionError("ENOINPUT", "this connection's sign-in takes no input", 400);
  }
  const value = typeof text === "string" ? text.trim() : "";
  if (!value || value.length > MAX_INPUT_LENGTH || CONTROL_RE.test(value)) {
    throw new ConnectionError(
      "EBADINPUT",
      `text must be one line of 1 to ${MAX_INPUT_LENGTH} characters with no control characters`,
      400
    );
  }
  if (job.inputs >= MAX_INPUTS_PER_JOB) {
    throw new ConnectionError(
      "ETOOMANYINPUTS",
      "too many attempts; cancel and start the sign-in again",
      409
    );
  }
  job.inputs += 1;
  try {
    job.child.stdin.write(`${value}\n`);
  } catch {
    throw new ConnectionError("ENOTRUNNING", "the sign-in command is no longer reading input", 409);
  }
  return publicJob(job);
}

function cancelLogin(id) {
  findConnection(id);
  const job = currentJob(id);
  if (!job) throw new ConnectionError("ENOJOB", "no sign-in job for this connection", 404);
  stopJob(job, "cancelled");
  return publicJob(job);
}

async function logout(id) {
  const connection = findConnection(id);
  if (!connection.logout) {
    throw new ConnectionError("ENOLOGOUT", "this connection defines no sign-out command", 400);
  }
  const running = currentJob(id);
  if (running) stopJob(running, "cancelled");
  const r = await runOnce(connection.logout, LOGOUT_TIMEOUT_MS);
  return {
    ok: r.code === 0,
    detail: r.code === 0 ? "" : firstLine(r.stderr) || firstLine(r.stdout),
  };
}

/**
 * @param {{ withStatus?: boolean }} [options] `withStatus: false` skips the
 *   status commands (used to decide whether to show the page at all); `required`
 *   is then true only for connections that are always required.
 */
async function listConnections({ withStatus = true } = {}) {
  const config = loadConfig();
  const items = await Promise.all(
    config.connections.map(async (c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      canLogout: Boolean(c.logout),
      required: withStatus ? await isRequired(c) : c.required.always,
      status: withStatus ? await checkStatus(c) : null,
      job: publicJob(currentJob(c.id)),
    }))
  );
  return { enabled: config.enabled, error: config.error, items };
}

/** Stop every running job and forget cached config. Tests only. */
function __reset() {
  for (const job of jobs.values()) {
    clearTimeout(job.timer);
    clearTimeout(job.killTimer);
    if (job.state === "running") killTree(job, "SIGKILL");
  }
  jobs.clear();
  cached = { path: null, mtimeMs: null, result: null };
}

module.exports = {
  ConnectionError,
  loadConfig,
  listConnections,
  checkStatus,
  startLogin,
  getJob,
  sendInput,
  cancelLogin,
  logout,
  // shared with the project catalog (server/lib/projects.js), which reads the same file
  runOnce,
  // exported for tests
  extractUrls,
  stripEscapes,
  __reset,
};
