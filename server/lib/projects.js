/**
 * @file projects.js
 * @description Project catalog: the projects a person can set up in their
 * workspace from the dashboard, picking one to have its repositories fetched
 * (cloned) without opening a terminal. The operator describes the catalog in the
 * same JSON file as account connections (`DASHBOARD_CONNECTIONS_FILE`), under a
 * `projects` key:
 *
 *   "projects": {
 *     "list": ["pmc-projects", "--json"],   // prints [{ id, name, description?, cloned, partial? }]
 *     "add": ["pmc-clone", "{id}"],         // fetches one project; {id} is substituted
 *     "requires": "azure-devops",           // optional: a connection that must be signed in first
 *     "timeoutSeconds": 1800                // optional: how long one fetch may run
 *   }
 *
 * Trust model (same as connections): every command is an argv array from the
 * operator's file, spawned without a shell. A request only names a project id,
 * which must match a strict pattern (it can never look like an option) and must
 * be one the `list` command returned before it is substituted into `add`. With
 * no file, or no `projects` key in it, the feature is off and nothing is spawned.
 *
 * Fetching a project is a job, one per project at a time: its output is kept
 * (ANSI stripped) so the page can show what it is doing, and it ends when the
 * command exits, is cancelled, or times out.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const fs = require("node:fs");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const connections = require("./connections");

/** A project id: starts with a letter or digit, so it can never be read as an option. */
const PROJECT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
/** A connection id, as connections.js accepts it. */
const CONNECTION_ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const ID_PLACEHOLDER = "{id}";
const MAX_ARGS = 64;
const MAX_ARG_LENGTH = 4096;
const MAX_PROJECTS = 200;
const MAX_LIST_BYTES = 256 * 1024;
const MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_RUNNING = 4;
const LIST_TIMEOUT_MS = 15_000;
const DEFAULT_ADD_TIMEOUT_S = 1800;
const MIN_ADD_TIMEOUT_S = 10;
const MAX_ADD_TIMEOUT_S = 7200;
const FINISHED_JOB_TTL_MS = 10 * 60_000;
const KILL_GRACE_MS = 3_000;

/** An error with an HTTP status and a stable code, for the route to report. */
class ProjectError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** Fetch jobs by project id. */
const jobs = new Map();
let cached = { path: null, mtimeMs: null, result: null };

// ── Configuration ─────────────────────────────────────────────────────────────

function asCommand(value, where) {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_ARGS ||
    !value.every((a) => typeof a === "string" && a.length <= MAX_ARG_LENGTH) ||
    !value[0]
  ) {
    throw new Error(`${where} must be a non-empty array of strings (a command and its arguments)`);
  }
  return value;
}

/** Validate the `projects` object of the operator's file. */
function parseProjects(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("projects must be an object");
  }
  const list = asCommand(raw.list, "projects.list");
  const add = asCommand(raw.add, "projects.add");
  if (!add.some((a) => a.includes(ID_PLACEHOLDER))) {
    throw new Error(`projects.add must contain "${ID_PLACEHOLDER}" where the project id goes`);
  }
  let requires = null;
  if (raw.requires !== undefined && raw.requires !== null) {
    if (typeof raw.requires !== "string" || !CONNECTION_ID_RE.test(raw.requires)) {
      throw new Error("projects.requires must be a connection id");
    }
    requires = raw.requires;
  }
  let timeoutSeconds = DEFAULT_ADD_TIMEOUT_S;
  if (raw.timeoutSeconds !== undefined) {
    if (
      !Number.isInteger(raw.timeoutSeconds) ||
      raw.timeoutSeconds < MIN_ADD_TIMEOUT_S ||
      raw.timeoutSeconds > MAX_ADD_TIMEOUT_S
    ) {
      throw new Error(
        `projects.timeoutSeconds must be a whole number from ${MIN_ADD_TIMEOUT_S} to ${MAX_ADD_TIMEOUT_S}`
      );
    }
    timeoutSeconds = raw.timeoutSeconds;
  }
  return { list, add, requires, timeoutMs: timeoutSeconds * 1000 };
}

/**
 * Read the `projects` key of the operator's file.
 * @returns {{ enabled: boolean, error: string|null, config: object|null }}
 *   `enabled` is false when no file is configured or the file has no `projects`
 *   key. A key that is present but invalid keeps the feature on with `error` set.
 */
function loadProjectsConfig() {
  const file = (process.env.DASHBOARD_CONNECTIONS_FILE || "").trim();
  if (!file) return { enabled: false, error: null, config: null };
  let mtimeMs = null;
  try {
    mtimeMs = fs.statSync(file).mtimeMs;
  } catch {
    /* an unreadable file has no catalog; connections reports why */
  }
  if (cached.result && cached.path === file && cached.mtimeMs === mtimeMs && mtimeMs !== null) {
    return cached.result;
  }
  let result;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!parsed || parsed.projects === undefined) {
      result = { enabled: false, error: null, config: null };
    } else {
      result = { enabled: true, error: null, config: parseProjects(parsed.projects) };
    }
  } catch (err) {
    // A missing or broken file: connections already reports it; the catalog stays off.
    result =
      err.code === "ENOENT" || err instanceof SyntaxError
        ? { enabled: false, error: null, config: null }
        : {
            enabled: true,
            error: `could not load the project catalog: ${err.message}`,
            config: null,
          };
  }
  cached = { path: file, mtimeMs, result };
  return result;
}

/** The loaded catalog configuration, or an error the route can report. */
function requireConfig() {
  const loaded = loadProjectsConfig();
  if (!loaded.enabled) {
    throw new ProjectError("ENOPROJECTS", "no project catalog is configured", 404);
  }
  if (loaded.error) throw new ProjectError("EPROJECTSCONFIG", loaded.error, 500);
  return loaded.config;
}

// ── Catalog ───────────────────────────────────────────────────────────────────

function firstLine(text) {
  const line = connections
    .stripEscapes(text || "")
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  return line ? line.slice(0, 300) : "";
}

function lastLine(text) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.length ? lines[lines.length - 1].slice(0, 300) : "";
}

/** Keep the well-formed entries of the `list` command's JSON. */
function normalizeItems(value) {
  if (!Array.isArray(value)) throw new Error("expected a JSON array of projects");
  const seen = new Set();
  const items = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const id = typeof raw.id === "string" ? raw.id : "";
    if (!PROJECT_ID_RE.test(id) || seen.has(id)) continue;
    seen.add(id);
    const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : id;
    const description = typeof raw.description === "string" ? raw.description.trim() : "";
    items.push({
      id,
      name: name.slice(0, 120),
      description: description.slice(0, 300),
      cloned: raw.cloned === true,
      partial: raw.cloned !== true && raw.partial === true,
    });
    if (items.length >= MAX_PROJECTS) break;
  }
  return items;
}

/**
 * Run the operator's `list` command.
 * @returns {Promise<{ items: object[], error: string|null }>}
 */
async function readCatalog(config) {
  const r = await connections.runOnce(config.list, LIST_TIMEOUT_MS, MAX_LIST_BYTES);
  if (r.code !== 0) {
    return {
      items: [],
      error: `the project list command failed: ${firstLine(r.stderr) || firstLine(r.stdout) || `exit ${r.code}`}`,
    };
  }
  try {
    return { items: normalizeItems(JSON.parse(r.stdout)), error: null };
  } catch (err) {
    return { items: [], error: `the project list command printed invalid JSON: ${err.message}` };
  }
}

/**
 * The connection a fetch needs first, and whether it is signed in.
 * @returns {Promise<{ id: string, name: string, connected: boolean }|null>}
 */
async function requirement(config) {
  if (!config.requires) return null;
  const connection = connections.loadConfig().connections.find((c) => c.id === config.requires);
  if (!connection) return { id: config.requires, name: config.requires, connected: false };
  const status = await connections.checkStatus(connection);
  return { id: connection.id, name: connection.name, connected: status.connected === true };
}

// ── Jobs ──────────────────────────────────────────────────────────────────────

function publicJob(job) {
  if (!job) return null;
  const text = connections.stripEscapes(job.raw);
  return {
    id: job.id,
    projectId: job.projectId,
    state: job.state,
    startedAt: job.startedAt,
    endedAt: job.endedAt,
    exitCode: job.exitCode,
    output: text,
    progress: lastLine(text),
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
    // The fetch command is its own process group, so the git processes it started go too.
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

function runningCount() {
  let n = 0;
  for (const job of jobs.values()) if (job.state === "running") n += 1;
  return n;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Every project in the catalog with whether it is set up and its fetch job.
 * @returns {Promise<{ enabled: boolean, error: string|null,
 *   requires: { id: string, name: string, connected: boolean }|null, items: object[] }>}
 */
async function listProjects() {
  const loaded = loadProjectsConfig();
  if (!loaded.enabled) return { enabled: false, error: null, requires: null, items: [] };
  if (loaded.error) return { enabled: true, error: loaded.error, requires: null, items: [] };
  const [catalog, requires] = await Promise.all([
    readCatalog(loaded.config),
    requirement(loaded.config),
  ]);
  return {
    enabled: true,
    error: catalog.error,
    requires,
    items: catalog.items.map((item) => ({ ...item, job: publicJob(currentJob(item.id)) })),
  };
}

/**
 * Start fetching a project, or return the fetch already running for it.
 * @returns {Promise<{ job: object, started: boolean }>}
 */
async function startAdd(id) {
  if (typeof id !== "string" || !PROJECT_ID_RE.test(id)) {
    throw new ProjectError("EBADID", "not a valid project id", 400);
  }
  const config = requireConfig();
  const existing = currentJob(id);
  if (existing && existing.state === "running") return { job: publicJob(existing), started: false };
  if (runningCount() >= MAX_RUNNING) {
    throw new ProjectError(
      "ETOOMANY",
      `at most ${MAX_RUNNING} projects can be fetched at once; wait for one to finish`,
      429
    );
  }

  const [catalog, requires] = await Promise.all([readCatalog(config), requirement(config)]);
  if (catalog.error) throw new ProjectError("ELIST", catalog.error, 502);
  if (!catalog.items.some((item) => item.id === id)) {
    throw new ProjectError("ENOPROJECT", `no project named "${id}" in the catalog`, 404);
  }
  if (requires && !requires.connected) {
    throw new ProjectError(
      "EREQUIRES",
      `connect ${requires.name} first; fetching a project needs it`,
      409
    );
  }
  // A second request may have started this project while the catalog was read.
  const raced = currentJob(id);
  if (raced && raced.state === "running") return { job: publicJob(raced), started: false };

  const command = config.add.map((arg) => arg.split(ID_PLACEHOLDER).join(id));
  const job = {
    id: crypto.randomUUID(),
    projectId: id,
    state: "running",
    startedAt: new Date().toISOString(),
    endedAt: null,
    exitCode: null,
    raw: "",
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
      env: { ...process.env, NO_COLOR: "1", GIT_TERMINAL_PROMPT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
  } catch (err) {
    throw new ProjectError("ESPAWN", `could not start the fetch command: ${err.message}`, 500);
  }
  job.child.stdout.on("data", append);
  job.child.stderr.on("data", append);
  job.child.on("error", (err) => {
    append(err.code === "ENOENT" ? `command not found: ${command[0]}\n` : `${err.message}\n`);
    finish("failed", null);
  });
  job.child.on("close", (code) => finish(code === 0 ? "succeeded" : "failed", code));
  job.timer = setTimeout(() => stopJob(job, "timeout"), config.timeoutMs);
  if (typeof job.timer.unref === "function") job.timer.unref();
  jobs.set(id, job);
  return { job: publicJob(job), started: true };
}

/** The fetch job of a project, or null when there is none (or it expired). */
function getJob(id) {
  if (typeof id !== "string" || !PROJECT_ID_RE.test(id)) {
    throw new ProjectError("EBADID", "not a valid project id", 400);
  }
  requireConfig();
  return publicJob(currentJob(id));
}

/** Stop a running fetch. */
function cancelAdd(id) {
  if (typeof id !== "string" || !PROJECT_ID_RE.test(id)) {
    throw new ProjectError("EBADID", "not a valid project id", 400);
  }
  requireConfig();
  const job = currentJob(id);
  if (!job) throw new ProjectError("ENOJOB", "no fetch job for this project", 404);
  stopJob(job, "cancelled");
  return publicJob(job);
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
  ProjectError,
  PROJECT_ID_RE,
  loadProjectsConfig,
  listProjects,
  startAdd,
  getJob,
  cancelAdd,
  // exported for tests
  normalizeItems,
  __reset,
};
