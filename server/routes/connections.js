/**
 * @file connections.js
 * @description HTTP routes for account connections, mounted at
 * `/api/connections`: list the connections the operator defined (with whether
 * each is signed in, all at once or one connection at a time), start or cancel a sign-in, read its progress, hand it one
 * pasted line, and sign out. The commands themselves live in the operator's
 * file (`DASHBOARD_CONNECTIONS_FILE`); see server/lib/connections.js.
 *
 * These routes start processes, so they sit behind the same loopback-Origin
 * guard as Run Agent, on top of the dashboard's token guard.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const { Router } = require("express");
const connections = require("../lib/connections");
const { sameOriginGuard } = require("../lib/security");

const router = Router();

router.use(sameOriginGuard);

/** Map a ConnectionError to its status; anything else is a 500. */
function fail(res, err) {
  if (err instanceof connections.ConnectionError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  return res.status(500).json({
    error: { code: "CONNECTIONS_FAILED", message: err.message || String(err) },
  });
}

/**
 * Every connection with its sign-in status and current job.
 * `?status=0` skips the status commands (a cheap "is the feature on" probe).
 */
router.get("/", async (req, res) => {
  try {
    res.json(await connections.listConnections({ withStatus: req.query.status !== "0" }));
  } catch (err) {
    fail(res, err);
  }
});

/**
 * One connection's `required` and sign-in status. The page lists connections
 * with `?status=0`, then asks for each status separately so a slow one does not
 * hold back the others.
 */
router.get("/:id/status", async (req, res) => {
  try {
    res.json(await connections.connectionStatus(req.params.id));
  } catch (err) {
    fail(res, err);
  }
});

/** Start the sign-in command; 200 with the running job when one is in progress. */
router.post("/:id/login", (req, res) => {
  try {
    const { job, started } = connections.startLogin(req.params.id);
    res.status(started ? 202 : 200).json({ job });
  } catch (err) {
    fail(res, err);
  }
});

router.get("/:id/job", (req, res) => {
  try {
    const job = connections.getJob(req.params.id);
    if (!job) {
      return res
        .status(404)
        .json({ error: { code: "ENOJOB", message: "no sign-in job for this connection" } });
    }
    return res.json({ job });
  } catch (err) {
    return fail(res, err);
  }
});

/** Body: `{ "text": "<one line>" }`, written to the sign-in command's stdin. */
router.post("/:id/job/input", (req, res) => {
  try {
    res.json({ job: connections.sendInput(req.params.id, req.body && req.body.text) });
  } catch (err) {
    fail(res, err);
  }
});

router.delete("/:id/job", (req, res) => {
  try {
    res.json({ job: connections.cancelLogin(req.params.id) });
  } catch (err) {
    fail(res, err);
  }
});

/** Run the sign-out command, then report the connection's status. */
router.post("/:id/logout", async (req, res) => {
  try {
    const result = await connections.logout(req.params.id);
    const { items } = await connections.listConnections();
    const item = items.find((i) => i.id === req.params.id);
    res.json({ ...result, status: item ? item.status : null });
  } catch (err) {
    fail(res, err);
  }
});

module.exports = router;
