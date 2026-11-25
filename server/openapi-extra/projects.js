/**
 * @file projects.js
 * @description OpenAPI fragment for the project catalog routes
 * (`server/routes/projects.js`): list the projects an operator offers, start
 * fetching one into the workspace, follow and cancel that fetch. Merged into the
 * served spec by `server/openapi-extra.js`.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const tags = [
  {
    name: "Projects",
    description:
      "Project catalog: the projects a person can set up in their workspace from the dashboard. The operator defines a `projects` key in the file named by `DASHBOARD_CONNECTIONS_FILE` (a `list` command that prints the catalog as JSON and an `add` command with an `{id}` placeholder). Off (empty list, nothing spawned) when that key is absent.",
  },
];

const idParam = {
  name: "id",
  in: "path",
  required: true,
  description:
    "Project id from the catalog. Starts with a letter or digit, so it can never be read as an option.",
  schema: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$" },
  example: "ipa",
};

const errorResponse = (description) => ({
  description,
  content: {
    "application/json": { schema: { $ref: "#/components/schemas/ProjectErrorResponse" } },
  },
});

const jobResponse = (description) => ({
  description,
  content: {
    "application/json": { schema: { $ref: "#/components/schemas/ProjectJobResponse" } },
  },
});

const badOrigin = errorResponse(
  "`EBADORIGIN` — a browser request from an origin that is neither loopback nor in `DASHBOARD_ALLOWED_HOSTS`."
);
const badId = errorResponse("`EBADID` — the id does not match the project id pattern.");

const schemas = {
  ProjectErrorResponse: {
    type: "object",
    required: ["error"],
    properties: {
      error: {
        type: "object",
        required: ["code", "message"],
        properties: {
          code: {
            type: "string",
            description: "Stable machine-readable code.",
            enum: [
              "EBADORIGIN",
              "EBADID",
              "ENOPROJECTS",
              "EPROJECTSCONFIG",
              "ENOPROJECT",
              "ELIST",
              "EREQUIRES",
              "ETOOMANY",
              "ENOJOB",
              "ESPAWN",
              "PROJECTS_FAILED",
            ],
          },
          message: { type: "string" },
        },
      },
    },
  },
  ProjectJobState: {
    type: "string",
    enum: ["running", "succeeded", "failed", "cancelled", "timeout"],
  },
  ProjectJob: {
    type: "object",
    required: [
      "id",
      "projectId",
      "state",
      "startedAt",
      "endedAt",
      "exitCode",
      "output",
      "progress",
    ],
    properties: {
      id: { type: "string", format: "uuid" },
      projectId: { type: "string" },
      state: { $ref: "#/components/schemas/ProjectJobState" },
      startedAt: { type: "string", format: "date-time" },
      endedAt: { type: "string", format: "date-time", nullable: true },
      exitCode: { type: "integer", nullable: true },
      output: {
        type: "string",
        description: "The fetch command's output so far (ANSI stripped, last 64 KiB).",
      },
      progress: {
        type: "string",
        description: "The latest non-empty output line: what the fetch is doing now.",
      },
    },
  },
  ProjectJobResponse: {
    type: "object",
    required: ["job"],
    properties: { job: { $ref: "#/components/schemas/ProjectJob" } },
  },
  ProjectItem: {
    type: "object",
    required: ["id", "name", "description", "cloned", "partial", "job"],
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      description: { type: "string" },
      cloned: {
        type: "boolean",
        description: "Every repository of the project is in the workspace.",
      },
      partial: {
        type: "boolean",
        description: "Some, but not all, of its repositories are in the workspace.",
      },
      path: {
        type: "string",
        nullable: true,
        description:
          "The project's folder, where an agent working on it runs. Passed on from the catalog's `list` command only when it is an absolute path to an existing directory; null otherwise.",
        example: "/home/alice/workspace/ipa",
      },
      job: { allOf: [{ $ref: "#/components/schemas/ProjectJob" }], nullable: true },
    },
  },
  ProjectsResponse: {
    type: "object",
    required: ["enabled", "error", "requires", "items"],
    properties: {
      enabled: { type: "boolean", description: "False when no catalog is configured." },
      error: {
        type: "string",
        nullable: true,
        description: "Why the catalog could not be read (bad config, list command failed).",
      },
      requires: {
        type: "object",
        nullable: true,
        description: "The account connection a fetch needs first, and whether it is signed in.",
        required: ["id", "name", "connected"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          connected: { type: "boolean" },
        },
      },
      items: { type: "array", items: { $ref: "#/components/schemas/ProjectItem" } },
    },
  },
};

const paths = {
  "/api/projects": {
    get: {
      tags: ["Projects"],
      summary: "List the project catalog",
      description:
        "Runs the operator's `list` command (15 s limit) and returns each project with whether its repositories are in the workspace and its fetch job. Also reports the connection a fetch needs (`requires`) and whether it is signed in. The commands themselves are never returned.",
      operationId: "projectsList",
      responses: {
        200: {
          description: "The catalog; `enabled: false` with no items when the feature is off.",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ProjectsResponse" },
              example: {
                enabled: true,
                error: null,
                requires: { id: "azure-devops", name: "Azure DevOps", connected: true },
                items: [
                  {
                    id: "ipa",
                    name: "IPA",
                    description: "Trading platform",
                    cloned: true,
                    partial: false,
                    path: "/home/alice/workspace/ipa",
                    job: null,
                  },
                ],
              },
            },
          },
        },
        403: badOrigin,
      },
    },
  },
  "/api/projects/{id}/add": {
    post: {
      tags: ["Projects"],
      summary: "Fetch a project into the workspace",
      description:
        "Checks that the id is in the catalog and that the required connection (if any) is signed in, then spawns the operator's `add` command with `{id}` replaced (argv, no shell) and returns its job. One job per project: while one is running the call returns it with 200. At most 4 fetches run at once.",
      operationId: "projectsAdd",
      parameters: [idParam],
      responses: {
        200: jobResponse("A fetch of this project was already running; this is its job."),
        202: jobResponse("The fetch command was started."),
        400: badId,
        403: badOrigin,
        404: errorResponse(
          "`ENOPROJECTS` when the feature is off, or `ENOPROJECT` when the id is not in the catalog."
        ),
        409: errorResponse("`EREQUIRES` — the connection the fetch needs is not signed in."),
        429: errorResponse("`ETOOMANY` — 4 fetches are already running."),
        500: errorResponse(
          "`ESPAWN` — the command could not be started; `EPROJECTSCONFIG` — the catalog config is invalid."
        ),
        502: errorResponse("`ELIST` — the list command failed, so the id could not be checked."),
      },
    },
  },
  "/api/projects/{id}/job": {
    get: {
      tags: ["Projects"],
      summary: "Read a fetch's progress",
      description:
        "The running fetch, or the last one for 10 minutes after it ended. Poll this while `state` is `running`.",
      operationId: "projectsGetJob",
      parameters: [idParam],
      responses: {
        200: jobResponse("The job."),
        400: badId,
        403: badOrigin,
        404: errorResponse("`ENOPROJECTS`, or `ENOJOB` when the project has no fetch job."),
      },
    },
    delete: {
      tags: ["Projects"],
      summary: "Cancel a fetch",
      description:
        "Stops the fetch command and every process it started (SIGTERM, then SIGKILL after 3 s). Already-fetched repositories stay in the workspace.",
      operationId: "projectsCancelJob",
      parameters: [idParam],
      responses: {
        200: jobResponse("The job, now `cancelled` (or its final state if it had already ended)."),
        400: badId,
        403: badOrigin,
        404: errorResponse("`ENOPROJECTS`, or `ENOJOB` when the project has no fetch job."),
      },
    },
  },
};

module.exports = { tags, schemas, paths };
