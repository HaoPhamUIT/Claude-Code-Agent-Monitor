/**
 * @file Tests for cloneAccessProblem: Azure DevOps and git permission errors in
 * a failed project fetch are recognised and the repositories named, the
 * workspace script's NO ACCESS line wins, and other failures (local disk
 * permissions, a bad branch, a timeout) are left alone.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, expect, it } from "vitest";
import { cloneAccessProblem } from "../cloneAccess";

describe("cloneAccessProblem", () => {
  it("names the repository from an Azure DevOps TF401019 error", () => {
    const output = [
      "pmc-clone: cloning pos-backend (develop) -> /home/me/workspace/pos/pos-backend",
      "Cloning into '/home/me/workspace/pos/pos-backend'...",
      "remote: TF401019: The Git repository with name or identifier pos-backend does not exist or you do not have permissions for the operation you are attempting.",
      "fatal: repository 'https://dev.azure.com/PHARMACITYJSC/Retail/_git/pos-backend/' not found",
      "pmc-clone: FAILED pos-backend",
      "pmc-clone: pos done, 1 ok, 1 failed",
    ].join("\n");
    expect(cloneAccessProblem(output)).toEqual({ repos: ["pos-backend"] });
  });

  it("prefers the workspace script's NO ACCESS lines", () => {
    const output = [
      "remote: TF401027: You need the Git 'GenericRead' permission to perform this action.",
      "fatal: unable to access 'https://dev.azure.com/org/p/_git/other/': The requested URL returned error: 403",
      "pmc-clone: FAILED pos-backend",
      "pmc-clone: NO ACCESS pos-backend — bạn cần request DevOps để xin quyền vào repo này",
      "pmc-clone: NO ACCESS pos-web — bạn cần request DevOps để xin quyền vào repo này",
    ].join("\n");
    expect(cloneAccessProblem(output)).toEqual({ repos: ["pos-backend", "pos-web"] });
  });

  it("recognises GitHub-style not-found and refused SSH keys", () => {
    expect(
      cloneAccessProblem("fatal: repository 'https://github.com/acme/secret-api.git/' not found")
    ).toEqual({ repos: ["secret-api"] });
    expect(cloneAccessProblem("git@host: Permission denied (publickey).")).toEqual({ repos: [] });
    expect(cloneAccessProblem("remote: TF400813: The user 'x' is not authorized")).toEqual({
      repos: [],
    });
  });

  it("decodes encoded repository names", () => {
    expect(
      cloneAccessProblem("fatal: repository 'https://dev.azure.com/o/p/_git/My%20Repo/' not found")
    ).toEqual({ repos: ["My Repo"] });
  });

  it("leaves other failures alone", () => {
    expect(
      cloneAccessProblem(
        "fatal: could not create work tree dir '/home/me/workspace/pos': Permission denied"
      )
    ).toBeNull();
    expect(
      cloneAccessProblem("fatal: Remote branch develop not found in upstream origin")
    ).toBeNull();
    expect(cloneAccessProblem("")).toBeNull();
  });
});
