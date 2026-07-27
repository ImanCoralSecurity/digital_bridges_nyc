import assert from "node:assert/strict";
import { after, test } from "node:test";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") {
      return nextResolve("next/server.js", context);
    }
    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      !/\.[a-z0-9]+$/i.test(specifier)
    ) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        // Let Node report the original unresolved import below.
      }
    }
    return nextResolve(specifier, context);
  },
});

const previousPassword = process.env.DBRIDGES_PASSWORD;
process.env.DBRIDGES_PASSWORD = "public-boundary-test-password";

const { NextRequest } = await import("next/server.js");
const { middleware } = await import("../middleware.ts");
const { AUTH_COOKIE, expectedToken } = await import("../lib/auth.ts");

after(() => {
  if (previousPassword === undefined) delete process.env.DBRIDGES_PASSWORD;
  else process.env.DBRIDGES_PASSWORD = previousPassword;
});

test("anonymous root defaults to the public site", async () => {
  const response = await middleware(new NextRequest("https://example.test/"));

  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "https://example.test/public");
});

test("public project pages bypass authentication but operator screens do not", async () => {
  const publicResponse = await middleware(
    new NextRequest("https://example.test/public/projects/project_example"),
  );
  assert.equal(publicResponse.status, 200);
  assert.equal(publicResponse.headers.get("x-middleware-next"), "1");

  const operatorResponse = await middleware(
    new NextRequest("https://example.test/projects/project_example"),
  );
  assert.equal(operatorResponse.status, 307);
  assert.equal(
    operatorResponse.headers.get("location"),
    "https://example.test/login?next=%2Fprojects%2Fproject_example",
  );
});

test("anonymous operator APIs return 401", async () => {
  const response = await middleware(
    new NextRequest("https://example.test/api/projects"),
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: "Unauthorized — password required.",
  });
});

test("a valid login token retains all existing operator access", async () => {
  const token = await expectedToken();
  for (const path of ["/", "/projects/project_example", "/api/projects", "/jobs", "/personas"]) {
    const response = await middleware(
      new NextRequest(`https://example.test${path}`, {
        headers: { cookie: `${AUTH_COOKIE}=${token}` },
      }),
    );
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("x-middleware-next"), "1", path);
  }
});
