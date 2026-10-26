import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = fileURLToPath(new URL("../", import.meta.url));
await access(new URL("../.next/BUILD_ID", import.meta.url)).catch(() => {
  throw new Error("Build the application with npm run build before running test:smoke.");
});

const secrets = ["DATABASE_URL", "DATABASE_AUTH_TOKEN", "AUTH_SECRET", "MODEL_API_KEY", "MODEL_NAME", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_ID", "APP_URL", "TRIP_REQUIRES_ACCESS"];
const scratch = await mkdtemp(join(tmpdir(), "coffee-atlas-smoke-"));
const running = new Set();
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => { void Promise.all([...running].map((server) => server.stop())).finally(() => process.exit(1)); });
}

/** Starts `next start` on a free loopback port with only the given service configuration. */
async function startServer(extra) {
  // Ask the OS for a free loopback port; never stop or reuse somebody else's server.
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const { port } = reservation.address();
  await new Promise((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()));
  const base = `http://127.0.0.1:${port}`;
  // Empty values (not deletions), so a developer's .env.local cannot configure the server under test.
  const environment = { ...process.env };
  for (const key of secrets) environment[key] = "";

  const child = spawn(process.execPath, [
    fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url)),
    "start", "--hostname", "127.0.0.1", "--port", String(port),
  ], {
    cwd: root,
    env: { ...environment, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", ENABLE_DEV_FIXTURES: "true", ...extra },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let launchError;
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => { output = `${output}${chunk}`.slice(-12000); });
  }
  child.on("error", (error) => { launchError = error; });

  async function request(path, init) {
    return fetch(`${base}${path}`, { ...init, redirect: "manual", signal: AbortSignal.timeout(10000) });
  }
  async function json(path, status, init) {
    const response = await request(path, init);
    assert.equal(response.status, status, `${init?.method ?? "GET"} ${path}`);
    assert.equal(response.headers.get("cache-control"), "no-store", path);
    return response.json();
  }
  const server = {
    request, json, output: () => output,
    async stop() {
      running.delete(server);
      if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
      timer.unref();
      try { await exited; } finally { clearTimeout(timer); }
    },
  };
  running.add(server);

  const deadline = Date.now() + 30000;
  let ready = false;
  while (Date.now() < deadline) {
    if (launchError) throw launchError;
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Server stopped before startup.\n${output}`);
    try { ready = (await request("/api/health")).status === 200; } catch { /* Server is still starting. */ }
    if (ready) break;
    await delay(200);
  }
  assert.ok(ready, `Server did not become ready.\n${output}`);
  return server;
}

function mutation(method, body, headers = {}) {
  return { method, headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) };
}

const preferences = {
  acidity: "low", sweetness: "any", roast: "medium", milk: "dairy",
  flavors: ["chocolate"], preparationMethods: ["espresso"], notes: "",
};

let current;
try {
  // Phase 1: no service configuration. The catalog works; accounts, payments and AI say they are unavailable.
  current = await startServer({});
  const { request, json } = current;

  const pages = [
    "/", "/explore", "/explore/ethiopia", "/explore/vietnam/vietnam-central-highlands",
    "/beans/bean-kenya-aa", "/drinks/drink-ca-phe-sua-da", "/recommendations", "/recommendations/classic", "/trip", "/login", "/signup",
    "/account", "/saved", "/upgrade", "/checkout/result?paid=true&session_id=pretend",
  ];
  const catalogPages = new Set(pages.filter((path) => /^\/(explore|beans|drinks)(\/|$)/.test(path)));
  for (const path of pages) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.ok(html.includes("Coffee Atlas"), `Shared application shell missing at ${path}`);
    assert.ok(!html.includes("NEXT_HTTP_ERROR_FALLBACK;500"), `Server rendering error at ${path}`);
    if (path === "/trip") {
      assert.ok(html.includes("Your next coffee trip, drawn on the globe."), "Trip form should use the real catalog");
      assert.ok(!html.includes("The coffee catalog isn’t connected yet."), "Trip catalog missing");
    }
    if (path === "/upgrade") assert.ok(!html.includes("unlimited recommendations and AI trip planning"), "Open trips must not be advertised as a paid benefit");
    if (catalogPages.has(path)) {
      assert.ok(!html.includes("The coffee catalog isn’t connected yet."), `Catalog missing at ${path}`);
      assert.ok(!html.includes("Development preview data"), `Map preview data leaked into production at ${path}`);
    }
  }
  assert.ok((await (await request("/explore/ethiopia")).text()).includes("Ethiopia"));
  assert.ok((await (await request("/beans/bean-kenya-aa")).text()).includes("Kenya AA"));
  // An unknown catalog ID renders the not-found page (streamed, so HTTP 200; see the map README).
  assert.ok((await (await request("/beans/example-bean")).text()).includes("NEXT_HTTP_ERROR_FALLBACK;404"));
  assert.equal((await request("/this-route-does-not-exist")).status, 404);

  const health = await json("/api/health", 200);
  assert.deepEqual(health.data, {
    status: "ok",
    services: { catalog: "ready", accounts: "not-configured", payments: "not-configured", ai: "not-configured" },
  });
  const catalog = await json("/api/catalog", 200);
  assert.ok(catalog.data.countries.length >= 50 && catalog.data.beans.length > 0 && catalog.data.sources.length > 0);
  assert.equal((await json("/api/catalog/beans/bean-kenya-aa", 200)).data.name, "Kenya AA");
  assert.equal((await json("/api/catalog/drinks/drink-ca-phe-sua-da", 200)).data.id, "drink-ca-phe-sua-da");
  assert.equal((await json("/api/catalog/beans/example-bean", 404)).error.code, "NOT_FOUND");
  const vietnam = await json("/api/catalog?countryId=vietnam&regionId=vietnam-central-highlands", 200);
  assert.ok(vietnam.data.beans.every((bean) => bean.origin.regionId === "vietnam-central-highlands"));
  assert.equal((await json("/api/catalog?countryId=vietnam&regionId=ethiopia-harar", 404)).error.code, "NOT_FOUND");

  for (const path of ["/api/preferences", "/api/saved", "/api/usage"]) {
    assert.equal((await json(path, 503)).error.code, "SERVICE_UNAVAILABLE", path);
  }
  const session = await json("/api/session?userId=admin", 503, { headers: { cookie: "userId=admin; paid=true" } });
  assert.deepEqual(session.state, { status: "unavailable", user: null });
  const accessState = await json("/api/access?paid=true&session_id=pretend", 503);
  assert.deepEqual(accessState.state, { capability: "personalized-discovery", status: "unavailable", allowed: false });

  const operations = [
    ["/api/preferences", mutation("PUT", preferences)],
    ["/api/saved", mutation("POST", { itemType: "bean", itemId: "bean-kenya-aa" })],
    ["/api/saved", mutation("DELETE", { itemType: "drink", itemId: "drink-ca-phe-sua-da" })],
    ["/api/recommendations", mutation("POST", { preferences, itemType: "both", geography: { scope: "global" } })],
    ["/api/trip", mutation("POST", { preferences, stopCount: 3 })],
    ["/api/checkout", mutation("POST", { capability: "personalized-discovery" })],
    ["/api/webhooks/stripe", mutation("POST", { type: "checkout.session.completed" }, { "stripe-signature": "t=1,v1=fake" })],
    ["/api/auth/signup", mutation("POST", { email: "smoke@example.com", password: "smoke-password", displayName: null })],
  ];
  for (const [path, init] of operations) {
    const result = await json(path, 503, init);
    assert.equal(result.error.code, "SERVICE_UNAVAILABLE", path);
  }
  for (const [path, init] of [
    ["/api/catalog?regionId=example-region", undefined],
    ["/api/saved", mutation("POST", { itemType: "bean", itemId: "bean-kenya-aa", userId: "admin" })],
    ["/api/checkout", mutation("POST", { capability: "personalized-discovery", paid: true })],
    ["/api/recommendations", mutation("POST", {})],
    ["/api/trip", mutation("POST", { stopCount: 9 })],
    ["/api/trip", mutation("POST", { savedItems: [{ itemType: "bean", itemId: "example-bean" }] })],
    ["/api/auth/signup", mutation("POST", { email: "not-an-email", password: "smoke-password", displayName: null })],
    ["/api/checkout/status?sessionId=pretend", undefined],
  ]) {
    assert.equal((await json(path, 400, init)).error.code, "INVALID_INPUT", path);
  }
  // Even an explicitly enabled development flag must never expose fixtures in production.
  const fixtures = await json("/api/dev/fixtures", 404);
  assert.equal(fixtures.ok, false);
  assert.equal(fixtures.error.code, "NOT_FOUND");
  await current.stop();

  // Phase 2: a fresh database file. Registration → session → preferences → save → quota → sign-out.
  current = await startServer({ DATABASE_URL: `file:${join(scratch, "smoke.db")}`, AUTH_SECRET: "smoke-test-secret-0123456789abcdef" });
  const accounts = current;
  const signup = await accounts.request("/api/auth/signup", mutation("POST", { email: "Smoke@Example.com", password: "smoke-password", displayName: "Smoke" }));
  assert.equal(signup.status, 200);
  const setCookie = signup.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /HttpOnly/);
  const cookie = setCookie.split(";")[0];
  const signedIn = { headers: { cookie } };
  const withCookie = (method, body) => mutation(method, body, { cookie });

  assert.equal((await accounts.json("/api/session", 200, signedIn)).data.user.email, "smoke@example.com");
  assert.equal((await accounts.json("/api/session", 200)).data.status, "signed-out");
  assert.equal((await accounts.json("/api/auth/signup", 400, mutation("POST", { email: "smoke@example.com", password: "another-password", displayName: null }))).error.code, "INVALID_INPUT");
  assert.equal((await accounts.json("/api/auth/login", 401, mutation("POST", { email: "smoke@example.com", password: "wrong-password" }))).error.code, "UNAUTHENTICATED");

  assert.deepEqual((await accounts.json("/api/preferences", 200, withCookie("PUT", preferences))).data, preferences);
  assert.deepEqual((await accounts.json("/api/preferences", 200, signedIn)).data, preferences);
  assert.equal((await accounts.json("/api/preferences", 401)).error.code, "UNAUTHENTICATED");
  await accounts.json("/api/saved", 200, withCookie("POST", { itemType: "bean", itemId: "bean-kenya-aa" }));
  assert.equal((await accounts.json("/api/saved", 404, withCookie("POST", { itemType: "bean", itemId: "bean-not-real" }))).error.code, "NOT_FOUND");
  assert.deepEqual((await accounts.json("/api/saved", 200, signedIn)).data.map((item) => item.itemId), ["bean-kenya-aa"]);
  assert.equal((await accounts.json("/api/saved", 403, mutation("POST", { itemType: "bean", itemId: "bean-kenya-aa" }, { cookie, origin: "https://evil.example" }))).error.code, "FORBIDDEN");

  assert.deepEqual((await accounts.json("/api/access", 200, signedIn)).data, { capability: "personalized-discovery", status: "denied", allowed: false });
  assert.equal((await accounts.json("/api/access?paid=true&session_id=cs_test_pretend", 200, signedIn)).data.allowed, false);
  assert.deepEqual((await accounts.json("/api/usage", 200, signedIn)).data, { paid: false, freeLimit: 3, freeUsed: 0, freeRemaining: 3 });
  assert.equal((await accounts.json("/api/checkout", 503, withCookie("POST", { capability: "personalized-discovery" }))).error.code, "SERVICE_UNAVAILABLE");
  // With no model key the quota check passes, the model is never called, and no free use is spent.
  const recommendation = await accounts.json("/api/recommendations", 503, withCookie("POST", { preferences, itemType: "both", geography: { scope: "global" } }));
  assert.equal(recommendation.error.code, "SERVICE_UNAVAILABLE");
  assert.equal((await accounts.json("/api/usage", 200, signedIn)).data.freeRemaining, 3);
  assert.equal((await accounts.json("/api/recommendations", 401, mutation("POST", { preferences, itemType: "both", geography: { scope: "global" } }))).error.code, "UNAUTHENTICATED");

  // Trip account context is available; only the absent model key prevents a plan.
  assert.equal((await accounts.json("/api/trip", 503, withCookie("POST", { stopCount: 2 }))).error.code, "SERVICE_UNAVAILABLE");
  assert.equal((await accounts.json("/api/usage", 200, signedIn)).data.freeRemaining, 3);
  const emptyTaste = { acidity: "any", sweetness: "any", roast: "any", milk: "any", flavors: [], preparationMethods: [], notes: "" };
  const emptyTrip = await accounts.json("/api/trip", 200, withCookie("POST", { preferences: emptyTaste, useSavedItems: false }));
  assert.equal(emptyTrip.data.status, "no-trip", "Cleared form values must override saved preferences");

  const login = await accounts.request("/api/auth/login", mutation("POST", { email: "smoke@example.com", password: "smoke-password" }));
  assert.equal(login.status, 200);
  const logout = await accounts.request("/api/auth/logout", withCookie("POST", {}));
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie") ?? "", /Max-Age=0/);
  assert.equal((await accounts.json("/api/session", 200, signedIn)).data.status, "signed-out");
  await current.stop();

  // Phase 3: enable paid trips against the same database, independently of developer env settings.
  current = await startServer({
    DATABASE_URL: `file:${join(scratch, "smoke.db")}`,
    AUTH_SECRET: "smoke-test-secret-0123456789abcdef",
    TRIP_REQUIRES_ACCESS: "true",
  });
  const gated = current;
  const paidLogin = await gated.request("/api/auth/login", mutation("POST", { email: "smoke@example.com", password: "smoke-password" }));
  assert.equal(paidLogin.status, 200);
  const paidCookie = (paidLogin.headers.get("set-cookie") ?? "").split(";")[0];
  const gatedTrip = await gated.json("/api/trip", 403, mutation("POST", { preferences, stopCount: 2 }, { cookie: paidCookie }));
  assert.equal(gatedTrip.error.code, "FORBIDDEN", "An unpaid account must be stopped before the model call");
  assert.equal((await gated.json("/api/usage", 200, { headers: { cookie: paidCookie } })).data.freeRemaining, 3);
  const plans = await (await gated.request("/upgrade")).text();
  assert.ok(plans.includes("unlimited recommendations and AI trip planning"), "Plans must describe the shared paid entitlement when enabled");
  await current.stop();

  console.log(`Production smoke passed: ${pages.length} pages with the real catalog, API boundaries, fixture isolation, account persistence, trip context, and paid-trip gating.`);
} catch (error) {
  if (current) console.error(current.output());
  throw error;
} finally {
  await current?.stop();
  await rm(scratch, { recursive: true, force: true });
}
