import { describe, expect, it } from "vitest";
import { readSsoTargets } from "../src/matrix/sso";

describe("sso targets", () => {
  it("ignores flows that are not sso", () => {
    expect(readSsoTargets([{ type: "m.login.password" }, { type: "m.login.token" }])).toEqual([]);
  });

  it("falls back to a single provider-less target", () => {
    expect(readSsoTargets([{ type: "m.login.sso" }])).toEqual([
      { loginType: "sso", idpId: null, name: "" },
    ]);
    expect(readSsoTargets([{ type: "m.login.cas" }])).toEqual([
      { loginType: "cas", idpId: null, name: "" },
    ]);
  });

  it("lists each identity provider", () => {
    expect(
      readSsoTargets([
        {
          type: "m.login.sso",
          identity_providers: [
            { id: "github", name: "GitHub" },
            { id: "gitlab", name: "" },
          ],
        },
      ]),
    ).toEqual([
      { loginType: "sso", idpId: "github", name: "GitHub" },
      { loginType: "sso", idpId: "gitlab", name: "gitlab" },
    ]);
  });
});
