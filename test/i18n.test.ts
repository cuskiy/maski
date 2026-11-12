import { describe, expect, it } from "vitest";
import { catalogs, formatNumber, formatRelative, setLocale, t, translate } from "../src/i18n";
import { en } from "../src/i18n";

describe("i18n", () => {
  it("has every source key in every catalog", () => {
    for (const [locale, catalog] of Object.entries(catalogs)) {
      expect(Object.keys(catalog).toSorted(), locale).toEqual(Object.keys(en).toSorted());
    }
  });

  it("falls back to English and never returns a key", () => {
    expect(translate("zh-CN", "app.title")).not.toBe("app.title");
    expect(translate("zh-CN", "app.title", { app: "maski" })).toBe("maski");
  });

  it("switches the active locale", () => {
    setLocale("zh-CN");
    expect(t("auth.login")).toBe("登录");
    setLocale("en");
    expect(t("auth.login")).toBe("Sign in");
  });

  it("formats numbers and relative times with Intl", () => {
    expect(formatNumber("en", 1234)).toBe("1,234");
    expect(formatRelative("en", Date.now(), Date.now())).toBe("now");
  });
});
