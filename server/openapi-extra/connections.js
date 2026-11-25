/**
 * @file Supplementary OpenAPI 3.0 fragments for the account connections routes
 * mounted at `/api/connections` (see server/routes/connections.js +
 * server/lib/connections.js). Exports `{ tags, schemas, paths }` for merging
 * into the base spec by `createOpenApiSpec()` via server/openapi-extra.js.
 * Schemas are prefixed `Connection` to avoid collisions with the base component
 * schemas.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const tags = [
  {
    name: "Connections",
    description:
      "Account connections: sign-in flows the operator defines in the file named by `DASHBOARD_CONNECTIONS_FILE`, which the dashboard runs so a person can connect their own accounts. Off (empty list, nothing spawned) when no file is configured.",
  },
];

const idParam = {
  name: "id",
  in: "path",
  required: true,
  description: "Connection id from the operator's file.",
  schema: { type: "string", pattern: "^[a-z0-9][a-z0-9-]{0,39}$" },
  example: "azure-devops",
};

const errorResponse = (description) => ({
  description,
  content: {
    "application/json": { schema: { $ref: "#/components/schemas/ConnectionErrorResponse" } },
  },
});

const jobResponse = (description) => ({
  description,
  content: {
    "application/json": { schema: { $ref: "#/components/schemas/ConnectionJobResponse" } },
  },
});

const badOrigin = errorResponse(
  "`EBADORIGIN` — a browser request from an origin that is neither loopback nor in `DASHBOARD_ALLOWED_HOSTS`."
);
const unknownConnection = errorResponse(
  "`ENOCONNECTION` — no connection has this id (always the case while the feature is off)."
);

const schemas = {
  ConnectionErrorResponse: {
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
              "ENOCONNECTION",
              "ENOJOB",
              "ENOTRUNNING",
              "ENOINPUT",
              "EBADINPUT",
              "ETOOMANYINPUTS",
              "ENOLOGOUT",
              "ESPAWN",
              "CONNECTIONS_FAILED",
            ],
          },
          message: { type: "string" },
        },
      },
    },
  },
  ConnectionStatus: {
    type: "object",
    required: ["connected", "account", "detail"],
    description: "Result of the connection's status command.",
    properties: {
      connected: {
        type: "boolean",
        nullable: true,
        description:
          "True when the status command exited 0, false otherwise, null when the connection defines no status command.",
      },
      account: {
        type: "string",
        description: "First line the status command printed when connected; empty otherwise.",
      },
      detail: {
        type: "string",
        description: "First line of the status command's error output when not connected.",
      },
    },
  },
  ConnectionJob: {
    type: "object",
    required: [
      "id",
      "connectionId",
      "state",
      "startedAt",
      "endedAt",
      "exitCode",
      "output",
      "urls",
      "code",
      "acceptsInput",
      "signedIn",
      "progress",
      "inputLabel",
      "inputPlaceholder",
    ],
    description: "One run of a connection's sign-in command.",
    properties: {
      id: { type: "string", format: "uuid" },
      connectionId: { type: "string" },
      state: {
        type: "string",
        enum: ["running", "succeeded", "failed", "cancelled", "timeout"],
        description:
          "`succeeded` when the command exited 0, `failed` on any other exit, `cancelled` after DELETE, `timeout` when it outlived `login.timeoutSeconds`.",
      },
      startedAt: { type: "string", format: "date-time" },
      endedAt: { type: "string", format: "date-time", nullable: true },
      exitCode: { type: "integer", nullable: true },
      output: {
        type: "string",
        description:
          "The command's stdout and stderr so far (last 64 KiB), with terminal escape sequences removed.",
      },
      urls: {
        type: "array",
        items: { type: "string", format: "uri" },
        description:
          "http(s) links found in the output, in order of appearance (at most 10). A terminal hyperlink's target replaces its wrapped visible text.",
      },
      code: {
        type: "string",
        nullable: true,
        description:
          "Device code matched by the connection's `login.codePattern` (default: the word after `code`).",
      },
      acceptsInput: {
        type: "boolean",
        description: "True while the command is running and the connection declares `login.input`.",
      },
      signedIn: {
        type: "boolean",
        description:
          "True once the output matches the connection's `login.signedInPattern`: the sign-in is done and the command may still be finishing (cloning repositories, say). Always false without a pattern.",
      },
      progress: {
        type: "string",
        description:
          "The last non-empty output line (at most 300 characters); empty when there is none.",
      },
      inputLabel: { type: "string", description: "Operator's label for the paste field." },
      inputPlaceholder: {
        type: "string",
        description: "Operator's placeholder for the paste field.",
      },
    },
  },
  ConnectionJobResponse: {
    type: "object",
    required: ["job"],
    properties: { job: { $ref: "#/components/schemas/ConnectionJob" } },
  },
  ConnectionItem: {
    type: "object",
    required: ["id", "name", "description", "canLogout", "required", "status", "job"],
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      description: { type: "string" },
      canLogout: {
        type: "boolean",
        description: "True when the connection defines a sign-out command.",
      },
      required: {
        type: "boolean",
        description:
          "True when the dashboard asks for this connection before anything else: `required: true` in the operator's file, or `required.when` exited 0. With `status=0` only unconditional requirements count.",
      },
      status: {
        allOf: [{ $ref: "#/components/schemas/ConnectionStatus" }],
        nullable: true,
        description: "Null when the list was requested with `status=0`.",
      },
      job: {
        allOf: [{ $ref: "#/components/schemas/ConnectionJob" }],
        nullable: true,
        description:
          "The running job, or the last one for 10 minutes after it ended; null otherwise.",
      },
    },
  },
  ConnectionsResponse: {
    type: "object",
    required: ["enabled", "error", "items"],
    properties: {
      enabled: {
        type: "boolean",
        description: "False when `DASHBOARD_CONNECTIONS_FILE` is unset: the feature is off.",
      },
      error: {
        type: "string",
        nullable: true,
        description: "Why the configured file could not be read or validated; null when it loaded.",
      },
      items: { type: "array", items: { $ref: "#/components/schemas/ConnectionItem" } },
    },
  },
  ConnectionStatusResponse: {
    type: "object",
    required: ["id", "required", "status"],
    properties: {
      id: { type: "string", description: "The connection id." },
      required: {
        type: "boolean",
        description:
          "True when the dashboard asks for this connection before anything else: `required: true` in the operator's file, or `required.when` exited 0.",
      },
      status: { $ref: "#/components/schemas/ConnectionStatus" },
    },
  },
  ConnectionLogoutResponse: {
    type: "object",
    required: ["ok", "detail", "status"],
    properties: {
      ok: { type: "boolean", description: "True when the sign-out command exited 0." },
      detail: { type: "string", description: "First line of the command's output when it failed." },
      status: {
        allOf: [{ $ref: "#/components/schemas/ConnectionStatus" }],
        nullable: true,
        description: "The connection's status after the command ran.",
      },
    },
  },
};

const paths = {
  "/api/connections": {
    get: {
      tags: ["Connections"],
      summary: "List account connections",
      description:
        "Every connection in the operator's file with its sign-in status and current job. Runs each connection's status command (15 s limit each) unless `status=0`. The commands themselves are never returned.",
      operationId: "connectionsList",
      parameters: [
        {
          name: "status",
          in: "query",
          required: false,
          description: "Pass `0` to skip the status commands; every `status` is then null.",
          schema: { type: "string", enum: ["0"] },
        },
      ],
      responses: {
        200: {
          description: "The connections; `enabled: false` with no items when the feature is off.",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ConnectionsResponse" },
              example: {
                enabled: true,
                error: null,
                items: [
                  {
                    id: "azure-devops",
                    name: "Azure DevOps",
                    description: "Git, pull requests and work items with your own account.",
                    canLogout: true,
                    required: true,
                    status: { connected: true, account: "alice@example.com", detail: "" },
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
  "/api/connections/{id}/status": {
    get: {
      tags: ["Connections"],
      summary: "Read one connection's status",
      description:
        "Runs one connection's `required.when` and status commands side by side (15 s limit each). The dashboard lists connections with `status=0`, then reads each status this way, so a slow status command holds back only its own card. Reads of the same connection that overlap share one run; nothing is kept once it ends.",
      operationId: "connectionsStatus",
      parameters: [idParam],
      responses: {
        200: {
          description: "The connection's `required` flag and sign-in status.",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ConnectionStatusResponse" },
              example: {
                id: "azure-devops",
                required: true,
                status: { connected: true, account: "alice@example.com", detail: "" },
              },
            },
          },
        },
        403: badOrigin,
        404: unknownConnection,
      },
    },
  },
  "/api/connections/{id}/login": {
    post: {
      tags: ["Connections"],
      summary: "Start a sign-in",
      description:
        "Spawns the connection's sign-in command (argv from the operator's file, no shell) and returns its job. One job per connection: while one is running, the call returns that job with 200 instead of starting another.",
      operationId: "connectionsLogin",
      parameters: [idParam],
      responses: {
        200: jobResponse("A sign-in was already running; this is its job."),
        202: jobResponse("The sign-in command was started."),
        403: badOrigin,
        404: unknownConnection,
        500: errorResponse("`ESPAWN` — the command could not be started."),
      },
    },
  },
  "/api/connections/{id}/job": {
    get: {
      tags: ["Connections"],
      summary: "Read a sign-in's progress",
      description:
        "The running job, or the last one for 10 minutes after it ended. Poll this while `state` is `running`.",
      operationId: "connectionsGetJob",
      parameters: [idParam],
      responses: {
        200: jobResponse("The job."),
        403: badOrigin,
        404: errorResponse("`ENOCONNECTION`, or `ENOJOB` when the connection has no job."),
      },
    },
    delete: {
      tags: ["Connections"],
      summary: "Cancel a sign-in",
      description:
        "Sends SIGTERM to the sign-in command and what it started (SIGKILL after 3 s). The job ends in state `cancelled`.",
      operationId: "connectionsCancelJob",
      parameters: [idParam],
      responses: {
        200: jobResponse("The job; it may still read `running` until the command exits."),
        403: badOrigin,
        404: errorResponse("`ENOCONNECTION`, or `ENOJOB` when the connection has no job."),
      },
    },
  },
  "/api/connections/{id}/job/input": {
    post: {
      tags: ["Connections"],
      summary: "Hand the sign-in one pasted line",
      description:
        "Writes one line to the running sign-in command's stdin: the redirect address a person copied from their browser. Only for connections that declare `login.input`; at most 5 lines per job.",
      operationId: "connectionsSendInput",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["text"],
              properties: {
                text: {
                  type: "string",
                  minLength: 1,
                  maxLength: 8192,
                  description:
                    "One line; surrounding whitespace is trimmed and control characters are refused.",
                },
              },
            },
            example: { text: "http://localhost:53682/callback?code=abc&state=xyz" },
          },
        },
      },
      responses: {
        200: jobResponse("The line was written."),
        400: errorResponse(
          "`EBADINPUT` — not one clean line; or `ENOINPUT` — this connection's sign-in takes no input."
        ),
        403: badOrigin,
        404: unknownConnection,
        409: errorResponse(
          "`ENOTRUNNING` — no sign-in is in progress; or `ETOOMANYINPUTS` — the per-job limit was reached."
        ),
      },
    },
  },
  "/api/connections/{id}/logout": {
    post: {
      tags: ["Connections"],
      summary: "Sign out",
      description:
        "Cancels a running sign-in, runs the connection's sign-out command (30 s limit), then reports the connection's status.",
      operationId: "connectionsLogout",
      parameters: [idParam],
      responses: {
        200: {
          description: "The sign-out command ran; `ok` says whether it exited 0.",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ConnectionLogoutResponse" },
            },
          },
        },
        400: errorResponse("`ENOLOGOUT` — the connection defines no sign-out command."),
        403: badOrigin,
        404: unknownConnection,
      },
    },
  },
};

module.exports = { tags, schemas, paths };
