/**
 * @file projects.js
 * @description REST routes for the project catalog (`server/lib/projects.js`):
 * list the projects a person can set up in their workspace, start fetching one
 * (cloning its repositories), follow the fetch and cancel it. The routes start
 * processes, so browser requests must come from a loopback origin or an
 * allowlisted host (`sameOriginGuard`), like Run Agent and account connections.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const { Router } = require("express");
const projects = require("../lib/projects");
const { sameOriginGuard } = require("../lib/security");

const router = Router();

router.use(sameOriginGuard);

function fail(res, err) {
  if (err instanceof projects.ProjectError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  return res.status(500).json({
    error: { code: "PROJECTS_FAILED", message: err.message || String(err) },
  });
}

/** Every project in the catalog, whether it is set up, and its fetch job. */
router.get("/", async (_req, res) => {
  try {
    res.json(await projects.listProjects());
  } catch (err) {
    fail(res, err);
  }
});

/** Start fetching a project (202), or return the fetch already running (200). */
router.post("/:id/add", async (req, res) => {
  try {
    const { job, started } = await projects.startAdd(req.params.id);
    res.status(started ? 202 : 200).json({ job });
  } catch (err) {
    fail(res, err);
  }
});

router.get("/:id/job", (req, res) => {
  try {
    const job = projects.getJob(req.params.id);
    if (!job) {
      return res
        .status(404)
        .json({ error: { code: "ENOJOB", message: "no fetch job for this project" } });
    }
    return res.json({ job });
  } catch (err) {
    return fail(res, err);
  }
});

router.delete("/:id/job", (req, res) => {
  try {
    res.json({ job: projects.cancelAdd(req.params.id) });
  } catch (err) {
    fail(res, err);
  }
});

module.exports = router;
