/**
 * @file cloneAccess.ts
 * @description Recognises, in a failed project fetch's output, that the
 * signed-in account may not read one of the project's repositories (Azure
 * DevOps TF401019 / TF401027 / TF400813, git's "repository not found" or HTTP
 * 403, a refused SSH key, or the `pmc-clone: NO ACCESS <repo>` line the
 * workspace script prints), and names those repositories, so the project
 * picker can tell the person to ask DevOps for access instead of showing only
 * a raw log.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const NO_ACCESS =
  /TF401019|TF401027|TF400813|do(?:es)? not have permissions?|not authori[sz]ed|repository '[^']*' not found|returned error: 403|Permission denied \(publickey\)|pmc-clone: NO ACCESS /i;

const SCRIPT_LINE = /pmc-clone: NO ACCESS ([^\s—]+)/g;
const AZURE_REPO = /\/_git\/([^/'"\s]+)/g;
const QUOTED_REPO = /repository '[^']*\/([^/']+?)(?:\.git)?\/?' not found/g;

export interface CloneAccessProblem {
  repos: string[];
}

export function cloneAccessProblem(output: string): CloneAccessProblem | null {
  const lines = output.split("\n").filter((line) => NO_ACCESS.test(line));
  if (lines.length === 0) return null;
  const repos: string[] = [];
  const add = (name: string | undefined) => {
    let repo = name ?? "";
    try {
      repo = decodeURIComponent(repo);
    } catch {
      repo = name ?? "";
    }
    if (repo && !repos.includes(repo)) repos.push(repo);
  };
  for (const line of lines) for (const m of line.matchAll(SCRIPT_LINE)) add(m[1]);
  if (repos.length === 0) {
    for (const line of lines) {
      for (const m of line.matchAll(AZURE_REPO)) add(m[1]);
      if (!/\/_git\//.test(line)) for (const m of line.matchAll(QUOTED_REPO)) add(m[1]);
    }
  }
  return { repos };
}
