import { describe, expect, test } from "bun:test";
import { appOrigin, assertAuthConfig, keycloakConfig } from "../../src/server/auth/config.server";

const ENV = {
  APP_BASE_URL: "http://localhost:8088",
  KEYCLOAK_BASE_URL: "http://keycloak:8080/",
  KEYCLOAK_REALM: "bluedots",
  KEYCLOAK_CLIENT_ID: "campaign-manager",
  KEYCLOAK_CLIENT_SECRET: "s3cret",
};

describe("Keycloak settings", () => {
  test("build the public issuer, and default the internal address to the public one", () => {
    const c = keycloakConfig(ENV);
    expect(c.issuer).toBe("http://keycloak:8080/realms/bluedots");
    expect(c.internalBaseUrl).toBe("http://keycloak:8080");
  });

  test("keep a separate internal address when given", () => {
    const c = keycloakConfig({ ...ENV, KEYCLOAK_INTERNAL_BASE_URL: "http://sd-keycloak:8080" });
    expect(c.internalBaseUrl).toBe("http://sd-keycloak:8080");
    expect(c.issuer).toBe("http://keycloak:8080/realms/bluedots");
  });

  test("name every missing setting", () => {
    expect(() => keycloakConfig({ KEYCLOAK_REALM: "bluedots" })).toThrow(
      /KEYCLOAK_BASE_URL, KEYCLOAK_CLIENT_ID, KEYCLOAK_CLIENT_SECRET/,
    );
  });

  test("refuse a non-http address", () => {
    expect(() => keycloakConfig({ ...ENV, KEYCLOAK_BASE_URL: "ftp://keycloak" })).toThrow(/http\(s\)/);
  });
});

describe("APP_BASE_URL", () => {
  test("gives the origin, without a path or trailing slash", () => {
    expect(appOrigin({ APP_BASE_URL: "http://localhost:8088/" })).toBe("http://localhost:8088");
    expect(appOrigin({ APP_BASE_URL: "https://cm.example.org/app" })).toBe("https://cm.example.org");
  });

  test("is required and must be an http(s) URL", () => {
    expect(() => appOrigin({})).toThrow(/APP_BASE_URL is not set/);
    expect(() => appOrigin({ APP_BASE_URL: "not a url" })).toThrow(/not a valid URL/);
  });
});

describe("startup check", () => {
  test("passes with every setting", () => {
    expect(() => assertAuthConfig(ENV)).not.toThrow();
  });

  test("stops when a setting is missing", () => {
    expect(() => assertAuthConfig({ ...ENV, KEYCLOAK_CLIENT_SECRET: "" })).toThrow(/KEYCLOAK_CLIENT_SECRET/);
    expect(() => assertAuthConfig({ ...ENV, APP_BASE_URL: "" })).toThrow(/APP_BASE_URL/);
  });
});
