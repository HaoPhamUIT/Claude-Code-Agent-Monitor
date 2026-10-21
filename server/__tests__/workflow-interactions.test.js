/**
 * @file workflow-interactions.test.js
 * @description Checks that buildInteractions recovers file hand-offs (write →
 * later mention) and forwarded results (result text inside a later prompt),
 * and ignores shared working-dir paths that every agent sees.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildInteractions } = require("../lib/workflow-interactions");

const DIR = "/work/demo";

function transcript(prompt, at, tools = []) {
  const lines = [
    { type: "user", timestamp: new Date(at).toISOString(), message: { content: prompt } },
  ];
  tools.forEach(([name, input], i) =>
    lines.push({
      type: "assistant",
      timestamp: new Date(at + 1000 * (i + 1)).toISOString(),
      message: { content: [{ type: "tool_use", name, input }] },
    })
  );
  return lines.map((l) => JSON.stringify(l)).join("\n");
}

test("buildInteractions links file writers to readers and forwarded results", () => {
  const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-int-"));
  const runDir = path.join(sessionDir, "subagents", "workflows", "wf_t");
  fs.mkdirSync(runDir, { recursive: true });
  const finding = "load() crashes on a corrupt todo.json with a raw traceback";
  fs.writeFileSync(
    path.join(runDir, "agent-a.jsonl"),
    transcript(`Work in ${DIR}. Write the spec.`, 0, [
      ["Bash", { command: `cat > ${DIR}/spec.md <<EOF\nx\nEOF` }],
    ])
  );
  fs.writeFileSync(
    path.join(runDir, "agent-b.jsonl"),
    transcript(`Work in ${DIR}. Read ${DIR}/spec.md and review.`, 10_000)
  );
  fs.writeFileSync(
    path.join(runDir, "agent-c.jsonl"),
    transcript(`Work in ${DIR}. Fix: ${JSON.stringify([{ issue: finding }])}`, 20_000)
  );
  fs.writeFileSync(
    path.join(runDir, "journal.jsonl"),
    [
      {
        type: "result",
        agentId: "a",
        result: `Wrote ${DIR}/spec.md, the spec for the todo CLI app`,
      },
      { type: "result", agentId: "b", result: { findings: [{ issue: finding }] } },
    ]
      .map((o) => JSON.stringify(o))
      .join("\n")
  );

  const agent = (agentId, label, phaseTitle, startedAt) => ({
    type: "workflow_agent",
    agentId,
    label,
    phaseTitle,
    startedAt,
    durationMs: 5000,
    state: "done",
  });
  const g = buildInteractions(
    {
      run_id: "wf_t",
      progress: [
        agent("a", "BA", "Spec", 0),
        agent("b", "Review", "Review", 10_000),
        agent("c", "Fix", "Fix", 20_000),
      ],
    },
    sessionDir
  );

  const edges = g.edges.map((e) => `${e.from}>${e.to}:${e.kind}:${e.files.join(",")}`).sort();
  assert.deepStrictEqual(edges, ["a>b:file:spec.md", "b>c:result:"]);
  assert.deepStrictEqual(
    g.columns.map((c) => c.title),
    ["Spec", "Review", "Fix"]
  );
  fs.rmSync(sessionDir, { recursive: true, force: true });
});
