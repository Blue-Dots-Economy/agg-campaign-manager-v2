import { describe, expect, test } from "bun:test";
import { appOrigin, assertAuthConfig, authProvider } from "../../src/server/auth/config.server";

describe("AUTH_PROVIDER", () => {
  test("defaults to none when unset or empty", () => {
    expect(authProvider({})).toBe("none");
    expect(authProvider({ AUTH_PROVIDER: "  " })).toBe("none");
  });

  test("accepts none and keycloak, in any case", () => {
    expect(authProvider({ AUTH_PROVIDER: "none" })).toBe("none");
    expect(authProvider({ AUTH_PROVIDER: "Keycloak" })).toBe("keycloak");
  });

  test("rejects anything else", () => {
    expect(() => authProvider({ AUTH_PROVIDER: "ldap" })).toThrow(/AUTH_PROVIDER/);
  });
});

describe("APP_BASE_URL", () => {
  test("gives the origin, without a path or trailing slash", () => {
    expect(appOrigin({ APP_BASE_URL: "http://localhost:8088/" })).toBe("http://localhost:8088");
    expect(appOrigin({ APP_BASE_URL: "https://cm.example.org/app" })).toBe("https://cm.example.org");
  });

  test("is required when used", () => {
    expect(() => appOrigin({})).toThrow(/APP_BASE_URL is not set/);
  });

  test("must be an http(s) URL", () => {
    expect(() => appOrigin({ APP_BASE_URL: "not a url" })).toThrow(/not a valid URL/);
    expect(() => appOrigin({ APP_BASE_URL: "ftp://cm.example.org" })).toThrow(/http\(s\)/);
  });
});

describe("startup check", () => {
  test("passes with no settings, so the image boots for the smoke test", () => {
    expect(() => assertAuthConfig({})).not.toThrow();
  });

  test("stops on a wrong AUTH_PROVIDER or a malformed APP_BASE_URL", () => {
    expect(() => assertAuthConfig({ AUTH_PROVIDER: "ldap" })).toThrow();
    expect(() => assertAuthConfig({ APP_BASE_URL: "nope" })).toThrow();
  });
});
