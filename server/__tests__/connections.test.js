/**
 * @file connections.test.js
 * @description Tests for account connections (/api/connections and
 * server/lib/connections.js). The operator's file points at small Node scripts
 * that stand in for real sign-in commands: a device-code login, a login that
 * waits for a pasted redirect URL, one that never ends, and status/sign-out
 * commands. Covers the off-by-default behaviour, config validation, link and
 * code extraction, the job lifecycle, input validation, required connections,
 * per-connection status reads (overlapping reads share one run), the
 * signed-in marker and the origin guard.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const http = require("node:http");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "connections-test-"));
process.env.DASHBOARD_DB_PATH = path.join(TMP, "dashboard.db");
const CONFIG = path.join(TMP, "connections.json");
const STATE = path.join(TMP, "signed-in");

const { createApp } = require("../index");
const connections = require("../lib/connections");

const NODE = process.execPath;
const script = (name, source) => {
  const file = path.join(TMP, name);
  fs.writeFileSync(file, source);
  return file;
};

// Prints a device-code prompt, then "signs in" shortly after.
const DEVICE = script(
  "device.js",
  `console.error("To sign in, use a web browser to open the page https://login.example.com/device and enter the code ABCD1234 to authenticate.");
setTimeout(() => { require("fs").writeFileSync(${JSON.stringify(STATE)}, "alice@example.com"); console.log("Signed in."); }, 150);`
);
// Prints an authorize link as a terminal hyperlink whose visible text is wrapped,
// then waits for the redirect URL on stdin.
const PASTE = script(
  "paste.js",
  `const url = "https://auth.example.com/authorize?client_id=abc&state=xyz&redirect_uri=http%3A%2F%2Flocalhost%3A5555%2Fcallback";
process.stdout.write("Visit this URL to authorize:\\n  \\u001b]8;;" + url + "\\u0007" + url.slice(0, 40) + "\\n" + url.slice(40) + "\\u001b]8;;\\u0007\\n\\u001b[1mOr paste the redirect URL here:\\u001b[0m ");
let buf = "";
process.stdin.on("data", (d) => {
  buf += d;
  if (!buf.includes("\\n")) return;
  const line = buf.trim();
  if (line.includes("state=xyz")) { require("fs").writeFileSync(${JSON.stringify(STATE)}, "bob"); console.log("\\nAuthenticated."); process.exit(0); }
  console.log("\\nOAuth state mismatch"); process.exit(1);
});`
);
const HANG = script("hang.js", `console.log("waiting"); setInterval(() => {}, 1000);`);
const STATUS = script(
  "status.js",
  `const fs = require("fs"); const f = ${JSON.stringify(STATE)};
if (fs.existsSync(f)) { console.log(fs.readFileSync(f, "utf8")); } else { console.error("not signed in"); process.exit(1); }`
);
const LOGOUT = script(
  "logout.js",
  `require("fs").rmSync(${JSON.stringify(STATE)}, { force: true });`
);

function writeConfig(value) {
  fs.writeFileSync(CONFIG, typeof value === "string" ? value : JSON.stringify(value));
  connections.__reset();
}

const VALID = {
  connections: [
    {
      id: "device",
      name: "Device login",
      description: "Signs in with a code.",
      status: [NODE, STATUS],
      login: [NODE, DEVICE],
      logout: [NODE, LOGOUT],
    },
    {
      id: "paste",
      name: "Paste login",
      status: [NODE, STATUS],
      login: {
        command: [NODE, PASTE],
        input: { label: "Paste the address", placeholder: "http://localhost:…" },
      },
    },
    { id: "hang", name: "Never ends", login: { command: [NODE, HANG], timeoutSeconds: 10 } },
    { id: "missing", name: "Missing command", login: ["/nonexistent/sign-in-command"] },
  ],
};

let server;
let BASE;

function fetchJson(p, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(p, BASE);
    const headers = { ...(opts.headers || {}) };
    let body;
    if (opts.body !== undefined) {
      body = Buffer.from(JSON.stringify(opts.body));
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = body.length;
    }
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
    if (body) req.write(body);
    req.end();
  });
}

/** Poll the job until `predicate(job)` holds. */
async function waitForJob(id, predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { body } = await fetchJson(`/api/connections/${id}/job`);
    if (body.job && predicate(body.job)) return body.job;
    if (Date.now() > deadline) {
      throw new Error(`job "${id}" did not reach the expected state: ${JSON.stringify(body)}`);
    }
    await new Promise((r) => setTimeout(r, 40));
  }
}

describe("/api/connections", () => {
  before(async () => {
    server = http.createServer(createApp());
    await new Promise((r) => server.listen(0, r));
    BASE = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
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
    process.env.DASHBOARD_CONNECTIONS_FILE = CONFIG;
    writeConfig(VALID);
  });

  it("is off when no file is configured, and starts nothing", async () => {
    delete process.env.DASHBOARD_CONNECTIONS_FILE;
    connections.__reset();
    const list = await fetchJson("/api/connections");
    assert.equal(list.status, 200);
    assert.deepEqual(list.body, { enabled: false, error: null, items: [] });
    const login = await fetchJson("/api/connections/device/login", { method: "POST" });
    assert.equal(login.status, 404);
    assert.equal(login.body.error.code, "ENOCONNECTION");
  });

  it("reports an unreadable or invalid file instead of failing", async () => {
    writeConfig("{ not json");
    let { body } = await fetchJson("/api/connections");
    assert.equal(body.enabled, true);
    assert.match(body.error, /could not load/);
    assert.deepEqual(body.items, []);

    writeConfig({ connections: [{ id: "Bad Id", name: "x", login: ["true"] }] });
    ({ body } = await fetchJson("/api/connections"));
    assert.match(body.error, /connections\[0\]\.id/);

    writeConfig({ connections: [{ id: "a", name: "x", login: "sh -c whoami" }] });
    ({ body } = await fetchJson("/api/connections"));
    assert.match(body.error, /login is required/);

    writeConfig({
      connections: [
        { id: "a", name: "x", login: ["true"] },
        { id: "a", name: "y", login: ["true"] },
      ],
    });
    ({ body } = await fetchJson("/api/connections"));
    assert.match(body.error, /used twice/);

    fs.rmSync(CONFIG);
    connections.__reset();
    ({ body } = await fetchJson("/api/connections"));
    assert.match(body.error, /file not found/);
  });

  it("lists connections with their status, and skips status commands on ?status=0", async () => {
    const { body } = await fetchJson("/api/connections");
    assert.equal(body.enabled, true);
    assert.equal(body.error, null);
    assert.deepEqual(
      body.items.map((i) => [i.id, i.canLogout, i.status.connected]),
      [
        ["device", true, false],
        ["paste", false, false],
        ["hang", false, null],
        ["missing", false, null],
      ]
    );
    assert.equal(body.items[0].status.detail, "not signed in");
    assert.equal(body.items[0].description, "Signs in with a code.");
    // The commands themselves never leave the server.
    assert.ok(!JSON.stringify(body).includes(DEVICE));

    const quick = await fetchJson("/api/connections?status=0");
    assert.ok(quick.body.items.every((i) => i.status === null));
  });

  it("reads one connection's status, and overlapping reads share one run of its command", async () => {
    const counter = path.join(TMP, "status-runs");
    fs.rmSync(counter, { force: true });
    // A slow status command that counts how often it runs.
    const slow = script(
      "slow-status.js",
      `require("fs").appendFileSync(${JSON.stringify(counter)}, "x");
setTimeout(() => { console.log("carol"); }, 300);`
    );
    writeConfig({
      connections: [
        { id: "slow", name: "Slow", status: [NODE, slow], login: [NODE, DEVICE] },
        {
          id: "gated",
          name: "Gated",
          required: { when: [NODE, "-e", "process.exit(0)"] },
          status: [NODE, STATUS],
          login: [NODE, DEVICE],
        },
      ],
    });
    const runs = () => (fs.existsSync(counter) ? fs.readFileSync(counter, "utf8").length : 0);

    const [a, b, list] = await Promise.all([
      fetchJson("/api/connections/slow/status"),
      fetchJson("/api/connections/slow/status"),
      fetchJson("/api/connections"),
    ]);
    assert.equal(a.status, 200);
    assert.deepEqual(a.body, {
      id: "slow",
      required: false,
      status: { connected: true, account: "carol", detail: "" },
    });
    assert.deepEqual(b.body, a.body);
    assert.deepEqual(list.body.items[0].status, a.body.status);
    assert.equal(runs(), 1);

    // Nothing is kept once the run ends: the next read runs the command again.
    await fetchJson("/api/connections/slow/status");
    assert.equal(runs(), 2);

    // `required.when` is decided by the same read.
    const gated = await fetchJson("/api/connections/gated/status");
    assert.deepEqual(gated.body, {
      id: "gated",
      required: true,
      status: { connected: false, account: "", detail: "not signed in" },
    });

    const missing = await fetchJson("/api/connections/nope/status");
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, "ENOCONNECTION");
  });

  it("runs a device-code sign-in: link and code are extracted, then the status flips", async () => {
    const started = await fetchJson("/api/connections/device/login", { method: "POST" });
    assert.equal(started.status, 202);
    assert.equal(started.body.job.state, "running");

    const prompted = await waitForJob("device", (j) => j.code !== null);
    assert.equal(prompted.code, "ABCD1234");
    assert.deepEqual(prompted.urls, ["https://login.example.com/device"]);
    assert.equal(prompted.acceptsInput, false);

    const done = await waitForJob("device", (j) => j.state !== "running");
    assert.equal(done.state, "succeeded");
    assert.equal(done.exitCode, 0);
    assert.match(done.output, /Signed in\./);

    const { body } = await fetchJson("/api/connections");
    assert.deepEqual(body.items[0].status, {
      connected: true,
      account: "alice@example.com",
      detail: "",
    });
    assert.equal(body.items[0].job.state, "succeeded");
  });

  it("runs a paste-back sign-in: the hyperlink target is the link, and the pasted line reaches the command", async () => {
    await fetchJson("/api/connections/paste/login", { method: "POST" });
    const prompted = await waitForJob("paste", (j) => j.output.includes("paste the redirect URL"));
    assert.deepEqual(prompted.urls, [
      "https://auth.example.com/authorize?client_id=abc&state=xyz&redirect_uri=http%3A%2F%2Flocalhost%3A5555%2Fcallback",
    ]);
    assert.equal(prompted.acceptsInput, true);
    assert.equal(prompted.inputLabel, "Paste the address");
    assert.ok(!prompted.output.includes("\u001b"), "escape sequences are stripped");

    const sent = await fetchJson("/api/connections/paste/job/input", {
      method: "POST",
      body: { text: "  http://localhost:5555/callback?code=c0de&state=xyz  " },
    });
    assert.equal(sent.status, 200);
    const done = await waitForJob("paste", (j) => j.state !== "running");
    assert.equal(done.state, "succeeded");
    assert.equal(done.acceptsInput, false);
    assert.equal(fs.readFileSync(STATE, "utf8"), "bob");
  });

  it("reports a failed sign-in with its output", async () => {
    await fetchJson("/api/connections/paste/login", { method: "POST" });
    await waitForJob("paste", (j) => j.output.includes("paste the redirect URL"));
    await fetchJson("/api/connections/paste/job/input", {
      method: "POST",
      body: { text: "http://localhost:5555/callback?code=x&state=WRONG" },
    });
    const done = await waitForJob("paste", (j) => j.state !== "running");
    assert.equal(done.state, "failed");
    assert.equal(done.exitCode, 1);
    assert.match(done.output, /OAuth state mismatch/);
  });

  it("refuses input that is not one clean line, or that nothing is waiting for", async () => {
    const idle = await fetchJson("/api/connections/paste/job/input", {
      method: "POST",
      body: { text: "x" },
    });
    assert.equal(idle.status, 409);
    assert.equal(idle.body.error.code, "ENOTRUNNING");

    await fetchJson("/api/connections/paste/login", { method: "POST" });
    for (const text of ["", "   ", "two\nlines", "bell\u0007", "x".repeat(8193), 42, null]) {
      const r = await fetchJson("/api/connections/paste/job/input", {
        method: "POST",
        body: { text },
      });
      assert.equal(r.status, 400, JSON.stringify(text).slice(0, 40));
      assert.equal(r.body.error.code, "EBADINPUT");
    }

    await fetchJson("/api/connections/hang/login", { method: "POST" });
    const noInput = await fetchJson("/api/connections/hang/job/input", {
      method: "POST",
      body: { text: "x" },
    });
    assert.equal(noInput.status, 400);
    assert.equal(noInput.body.error.code, "ENOINPUT");
  });

  it("keeps one job per connection, and cancelling stops the command", async () => {
    const first = await fetchJson("/api/connections/hang/login", { method: "POST" });
    assert.equal(first.status, 202);
    const second = await fetchJson("/api/connections/hang/login", { method: "POST" });
    assert.equal(second.status, 200);
    assert.equal(second.body.job.id, first.body.job.id);

    const cancelled = await fetchJson("/api/connections/hang/job", { method: "DELETE" });
    assert.equal(cancelled.status, 200);
    const done = await waitForJob("hang", (j) => j.state !== "running");
    assert.equal(done.state, "cancelled");

    const again = await fetchJson("/api/connections/hang/login", { method: "POST" });
    assert.equal(again.status, 202);
    assert.notEqual(again.body.job.id, first.body.job.id);
  });

  it("fails cleanly when the sign-in command does not exist", async () => {
    const started = await fetchJson("/api/connections/missing/login", { method: "POST" });
    assert.equal(started.status, 202);
    const done = await waitForJob("missing", (j) => j.state !== "running");
    assert.equal(done.state, "failed");
    assert.match(done.output, /command not found/);
  });

  it("signs out with the operator's command, and says so when there is none", async () => {
    fs.writeFileSync(STATE, "alice@example.com");
    const out = await fetchJson("/api/connections/device/logout", { method: "POST" });
    assert.equal(out.status, 200);
    assert.equal(out.body.ok, true);
    assert.equal(out.body.status.connected, false);
    assert.equal(fs.existsSync(STATE), false);

    const none = await fetchJson("/api/connections/paste/logout", { method: "POST" });
    assert.equal(none.status, 400);
    assert.equal(none.body.error.code, "ENOLOGOUT");
  });

  it("answers 404 for an unknown connection or a missing job", async () => {
    for (const [method, p] of [
      ["POST", "/api/connections/nope/login"],
      ["GET", "/api/connections/nope/job"],
      ["DELETE", "/api/connections/nope/job"],
      ["POST", "/api/connections/nope/logout"],
    ]) {
      const r = await fetchJson(p, { method });
      assert.equal(r.status, 404, `${method} ${p}`);
      assert.equal(r.body.error.code, "ENOCONNECTION");
    }
    const noJob = await fetchJson("/api/connections/device/job");
    assert.equal(noJob.status, 404);
    assert.equal(noJob.body.error.code, "ENOJOB");
  });

  it("says which connections are required, deciding conditional ones at request time", async () => {
    writeConfig({
      connections: [
        { id: "always", name: "Always", required: true, login: [NODE, DEVICE] },
        {
          id: "yes",
          name: "When yes",
          required: { when: [NODE, "-e", "process.exit(0)"] },
          login: [NODE, DEVICE],
        },
        {
          id: "no",
          name: "When no",
          required: { when: [NODE, "-e", "process.exit(3)"] },
          login: [NODE, DEVICE],
        },
        { id: "plain", name: "Optional", login: [NODE, DEVICE] },
      ],
    });
    const { body } = await fetchJson("/api/connections");
    assert.equal(body.error, null);
    assert.deepEqual(
      body.items.map((i) => [i.id, i.required]),
      [
        ["always", true],
        ["yes", true],
        ["no", false],
        ["plain", false],
      ]
    );
    // The cheap probe runs no command, so only unconditional requirements show.
    const quick = await fetchJson("/api/connections?status=0");
    assert.deepEqual(
      quick.body.items.map((i) => i.required),
      [true, false, false, false]
    );

    writeConfig({ connections: [{ id: "a", name: "x", required: "yes", login: ["true"] }] });
    assert.match((await fetchJson("/api/connections")).body.error, /required must be/);
    writeConfig({
      connections: [{ id: "a", name: "x", required: { when: "sh" }, login: ["true"] }],
    });
    assert.match((await fetchJson("/api/connections")).body.error, /required\.when/);
    writeConfig({
      connections: [{ id: "a", name: "x", login: { command: ["true"], signedInPattern: "(" } }],
    });
    assert.match((await fetchJson("/api/connections")).body.error, /signedInPattern/);
  });

  it("marks a job signed in once the operator's pattern appears, and reports its latest line", async () => {
    const AFTER = script(
      "after-sign-in.js",
      `console.log("Enter the code WXYZ9876 at https://login.example.com/device");
setTimeout(() => console.log("  ✔ signed in: carol"), 100);
setTimeout(() => console.log("cloning repo-a"), 200);
setTimeout(() => process.exit(0), 600);`
    );
    writeConfig({
      connections: [
        {
          id: "work",
          name: "Work",
          login: { command: [NODE, AFTER], signedInPattern: "✔ signed in" },
        },
        { id: "plain", name: "Plain", login: [NODE, DEVICE] },
      ],
    });
    await fetchJson("/api/connections/work/login", { method: "POST" });
    const prompted = await waitForJob("work", (j) => j.code !== null);
    assert.equal(prompted.signedIn, false);
    const cloning = await waitForJob("work", (j) => j.progress === "cloning repo-a");
    assert.equal(cloning.state, "running");
    assert.equal(cloning.signedIn, true);

    // Without a pattern a job never claims to be signed in.
    await fetchJson("/api/connections/plain/login", { method: "POST" });
    const plain = await waitForJob("plain", (j) => j.state !== "running");
    assert.equal(plain.signedIn, false);
    assert.equal(plain.progress, "Signed in.");
  });

  it("rejects cross-origin browser requests, like Run Agent", async () => {
    const r = await fetchJson("/api/connections/device/login", {
      method: "POST",
      headers: { Origin: "http://evil.example.com" },
    });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, "EBADORIGIN");
    const { body } = await fetchJson("/api/connections/device/job");
    assert.equal(body.error.code, "ENOJOB", "nothing was started");
  });
});

describe("connections output parsing", () => {
  it("drops wrapped pieces of a hyperlink and trailing punctuation", () => {
    const target = "https://a.example.com/authorize?x=1&y=2";
    const raw = `Open \u001b]8;;${target}\u001b\\https://a.example.com/auth\norize?x=1&y=2\u001b]8;;\u001b\\ or see https://docs.example.com/help.`;
    assert.deepEqual(connections.extractUrls(raw), [target, "https://docs.example.com/help"]);
  });

  it("strips colours, cursor moves and carriage returns", () => {
    assert.equal(
      connections.stripEscapes("\u001b[1G\u001b[0JWaiting\u001b[31m…\u001b[0m\r\ndone\r"),
      "Waiting…\ndone\n"
    );
  });
});
