/**
 * @file projects.test.js
 * @description Tests for the project catalog (`server/lib/projects.js`, routes
 * in `server/routes/projects.js`): the feature stays off without a `projects`
 * key, the operator's list command is validated, a fetch substitutes only a
 * catalog id into the add command (never an option-shaped value), it waits for
 * the required connection, runs one job per project, can be cancelled, is capped
 * at four at once, and refuses cross-origin browser requests. Commands are small
 * Node scripts in a temp directory.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const http = require("node:http");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "projects-test-"));
process.env.DASHBOARD_DB_PATH = path.join(TMP, "dashboard.db");
const CONFIG = path.join(TMP, "connections.json");
const STATE = path.join(TMP, "signed-in");
const MARKS = path.join(TMP, "cloned");
fs.mkdirSync(MARKS);

const { createApp } = require("../index");
const connections = require("../lib/connections");
const projects = require("../lib/projects");

const NODE = process.execPath;
const script = (name, source) => {
  const file = path.join(TMP, name);
  fs.writeFileSync(file, source);
  return file;
};

// The catalog: well-formed entries plus some the server must drop. A project is
// "cloned" once its marker file exists.
const LIST = script(
  "list.js",
  `const fs = require("fs"); const path = require("path");
const marks = ${JSON.stringify(MARKS)};
const ids = ["alpha", "beta", "fail", "hang1", "hang2", "hang3", "hang4", "hang5"];
const out = ids.map((id) => ({ id, name: id.toUpperCase(), description: "Project " + id, cloned: fs.existsSync(path.join(marks, id)), path: fs.existsSync(path.join(marks, id)) ? path.join(marks, id) : undefined }));
out.push({ id: "gamma" });                 // no name: falls back to the id
out.push({ id: "alpha", name: "dup" });   // duplicate: dropped
out.push({ id: "--upload-pack=x" });      // option-shaped: dropped
out.push({ name: "no id" });              // no id: dropped
console.log(JSON.stringify(out));`
);
const BROKEN_LIST = script(
  "broken-list.js",
  `console.error("catalog unavailable"); process.exit(3);`
);
const NOT_JSON = script("not-json.js", `console.log("hello");`);
// Fetches one project: argv[2] is the id the server substituted.
const ADD = script(
  "add.js",
  `const fs = require("fs"); const path = require("path");
const id = process.argv[2];
if (id.startsWith("hang")) { console.log("waiting " + id); setInterval(() => {}, 1000); }
else if (id === "fail") { console.error("permission denied for " + id); process.exit(2); }
else {
  console.log("cloning " + id);
  setTimeout(() => { fs.mkdirSync(path.join(${JSON.stringify(MARKS)}, id)); console.log("done " + id); }, 100);
}`
);
const STATUS = script(
  "status.js",
  `const fs = require("fs"); const f = ${JSON.stringify(STATE)};
if (fs.existsSync(f)) { console.log("alice"); } else { console.error("not signed in"); process.exit(1); }`
);
const LOGIN = script("login.js", `console.log("ok");`);

const CONNECTION = {
  id: "repo-account",
  name: "Repo account",
  status: [NODE, STATUS],
  login: [NODE, LOGIN],
};
const CATALOG = { list: [NODE, LIST], add: [NODE, ADD, "{id}"] };

function writeConfig(value) {
  fs.writeFileSync(CONFIG, typeof value === "string" ? value : JSON.stringify(value));
  connections.__reset();
  projects.__reset();
}

let server;
let BASE;

function fetchJson(p, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(p, BASE);
    const headers = { ...(opts.headers || {}) };
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: opts.method || "GET",
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

/** Poll a project's fetch job until `predicate(job)` holds. */
async function waitForJob(id, predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { body } = await fetchJson(`/api/projects/${id}/job`);
    if (body.job && predicate(body.job)) return body.job;
    if (Date.now() > deadline) {
      throw new Error(`job "${id}" did not reach the expected state: ${JSON.stringify(body)}`);
    }
    await new Promise((r) => setTimeout(r, 40));
  }
}

describe("/api/projects", () => {
  before(async () => {
    server = http.createServer(createApp());
    await new Promise((r) => server.listen(0, r));
    BASE = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    projects.__reset();
    connections.__reset();
    delete process.env.DASHBOARD_CONNECTIONS_FILE;
    await new Promise((r) => server.close(r));
    try {
      fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      /* best-effort temp cleanup */
    }
  });

  beforeEach(() => {
    fs.rmSync(STATE, { force: true });
    for (const f of fs.readdirSync(MARKS)) {
      fs.rmSync(path.join(MARKS, f), { recursive: true, force: true });
    }
    process.env.DASHBOARD_CONNECTIONS_FILE = CONFIG;
    writeConfig({ connections: [CONNECTION], projects: CATALOG });
  });

  it("is off when no file is configured, and starts nothing", async () => {
    delete process.env.DASHBOARD_CONNECTIONS_FILE;
    projects.__reset();
    const list = await fetchJson("/api/projects");
    assert.equal(list.status, 200);
    assert.deepEqual(list.body, { enabled: false, error: null, requires: null, items: [] });
    const add = await fetchJson("/api/projects/alpha/add", { method: "POST" });
    assert.equal(add.status, 404);
    assert.equal(add.body.error.code, "ENOPROJECTS");
  });

  it("is off when the file has no projects key", async () => {
    writeConfig({ connections: [CONNECTION] });
    const { body } = await fetchJson("/api/projects");
    assert.equal(body.enabled, false);
    assert.deepEqual(body.items, []);
  });

  it("reports an invalid projects key instead of running anything", async () => {
    writeConfig({ connections: [], projects: { list: [NODE, LIST], add: [NODE, ADD] } });
    const { body } = await fetchJson("/api/projects");
    assert.equal(body.enabled, true);
    assert.match(body.error, /must contain "\{id\}"/);
    assert.deepEqual(body.items, []);
  });

  it("lists the catalog, dropping malformed and option-shaped entries", async () => {
    const { status, body } = await fetchJson("/api/projects");
    assert.equal(status, 200);
    assert.equal(body.error, null);
    assert.equal(body.requires, null);
    const ids = body.items.map((i) => i.id);
    assert.deepEqual(ids, [
      "alpha",
      "beta",
      "fail",
      "hang1",
      "hang2",
      "hang3",
      "hang4",
      "hang5",
      "gamma",
    ]);
    const alpha = body.items[0];
    assert.deepEqual(alpha, {
      id: "alpha",
      name: "ALPHA",
      description: "Project alpha",
      cloned: false,
      partial: false,
      path: null,
      job: null,
    });
    assert.equal(body.items.find((i) => i.id === "gamma").name, "gamma");
  });

  it("reports a failing or non-JSON list command", async () => {
    writeConfig({ connections: [], projects: { ...CATALOG, list: [NODE, BROKEN_LIST] } });
    let res = await fetchJson("/api/projects");
    assert.match(res.body.error, /list command failed: catalog unavailable/);
    writeConfig({ connections: [], projects: { ...CATALOG, list: [NODE, NOT_JSON] } });
    res = await fetchJson("/api/projects");
    assert.match(res.body.error, /invalid JSON/);
  });

  it("fetches a project with its id substituted, then lists it as cloned", async () => {
    const start = await fetchJson("/api/projects/alpha/add", { method: "POST" });
    assert.equal(start.status, 202);
    assert.equal(start.body.job.projectId, "alpha");
    assert.equal(start.body.job.state, "running");
    const done = await waitForJob("alpha", (j) => j.state !== "running");
    assert.equal(done.state, "succeeded");
    assert.equal(done.exitCode, 0);
    assert.match(done.output, /cloning alpha/);
    assert.equal(done.progress, "done alpha");
    const { body } = await fetchJson("/api/projects");
    const alpha = body.items.find((i) => i.id === "alpha");
    assert.equal(alpha.cloned, true);
    assert.equal(alpha.path, path.join(MARKS, "alpha"));
    assert.equal(alpha.job.state, "succeeded");
  });

  it("reports a failed fetch with its output", async () => {
    await fetchJson("/api/projects/fail/add", { method: "POST" });
    const done = await waitForJob("fail", (j) => j.state !== "running");
    assert.equal(done.state, "failed");
    assert.equal(done.exitCode, 2);
    assert.equal(done.progress, "permission denied for fail");
  });

  it("refuses ids that are malformed or not in the catalog", async () => {
    const bad = await fetchJson("/api/projects/-x/add", { method: "POST" });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, "EBADID");
    const unknown = await fetchJson("/api/projects/delta/add", { method: "POST" });
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.error.code, "ENOPROJECT");
    const noJob = await fetchJson("/api/projects/beta/job");
    assert.equal(noJob.status, 404);
    assert.equal(noJob.body.error.code, "ENOJOB");
  });

  it("waits for the required connection before fetching", async () => {
    writeConfig({ connections: [CONNECTION], projects: { ...CATALOG, requires: "repo-account" } });
    let list = await fetchJson("/api/projects");
    assert.deepEqual(list.body.requires, {
      id: "repo-account",
      name: "Repo account",
      connected: false,
    });
    const refused = await fetchJson("/api/projects/alpha/add", { method: "POST" });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error.code, "EREQUIRES");
    assert.match(refused.body.error.message, /Repo account/);

    fs.writeFileSync(STATE, "alice");
    list = await fetchJson("/api/projects");
    assert.equal(list.body.requires.connected, true);
    const started = await fetchJson("/api/projects/alpha/add", { method: "POST" });
    assert.equal(started.status, 202);
    await waitForJob("alpha", (j) => j.state !== "running");
  });

  it("runs one fetch per project and can cancel it", async () => {
    const first = await fetchJson("/api/projects/hang1/add", { method: "POST" });
    assert.equal(first.status, 202);
    const again = await fetchJson("/api/projects/hang1/add", { method: "POST" });
    assert.equal(again.status, 200);
    assert.equal(again.body.job.id, first.body.job.id);
    await waitForJob("hang1", (j) => j.output.includes("waiting hang1"));
    const cancelled = await fetchJson("/api/projects/hang1/job", { method: "DELETE" });
    assert.equal(cancelled.status, 200);
    const done = await waitForJob("hang1", (j) => j.state !== "running");
    assert.equal(done.state, "cancelled");
  });

  it("caps concurrent fetches at four", async () => {
    for (const id of ["hang1", "hang2", "hang3", "hang4"]) {
      const r = await fetchJson(`/api/projects/${id}/add`, { method: "POST" });
      assert.equal(r.status, 202, id);
    }
    const fifth = await fetchJson("/api/projects/hang5/add", { method: "POST" });
    assert.equal(fifth.status, 429);
    assert.equal(fifth.body.error.code, "ETOOMANY");
    projects.__reset();
  });

  it("refuses cross-origin browser requests", async () => {
    const res = await fetchJson("/api/projects/alpha/add", {
      method: "POST",
      headers: { Origin: "https://evil.example" },
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, "EBADORIGIN");
  });

  it("keeps only well-formed catalog entries", () => {
    const items = projects.normalizeItems([
      { id: "ok", name: "  Ok  ", cloned: true, partial: true },
      { id: "half", partial: true },
      { id: "../etc" },
      null,
    ]);
    assert.deepEqual(items, [
      { id: "ok", name: "Ok", description: "", cloned: true, partial: false, path: null },
      { id: "half", name: "half", description: "", cloned: false, partial: true, path: null },
    ]);
    assert.throws(() => projects.normalizeItems({}), /JSON array/);
  });

  it("passes on a project folder only when it is an existing absolute directory", () => {
    const file = path.join(TMP, "not-a-dir.txt");
    fs.writeFileSync(file, "x");
    const items = projects.normalizeItems([
      { id: "dir", cloned: true, path: TMP },
      { id: "missing", cloned: true, path: path.join(TMP, "nope") },
      { id: "relative", cloned: true, path: "workspace/x" },
      { id: "file", cloned: true, path: file },
      { id: "nul", cloned: true, path: `${TMP}\0x` },
      { id: "number", cloned: true, path: 42 },
    ]);
    assert.deepEqual(
      items.map((i) => [i.id, i.path]),
      [
        ["dir", path.resolve(TMP)],
        ["missing", null],
        ["relative", null],
        ["file", null],
        ["nul", null],
        ["number", null],
      ]
    );
  });
});
