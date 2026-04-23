import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CONFIG_ENV_KEYS = [
  "HOST",
  "PORT",
  "ENGINE_URL",
  "FASTAPI_BASE_URL",
  "CACHE_TTL_MS",
  "REQUEST_TIMEOUT_MS",
  "CORS_ORIGIN",
  "MONGODB_URI",
  "DEFAULT_SEARCH_LIMIT",
  "MAX_SEARCH_LIMIT",
  "RECENT_SEARCH_LIMIT",
  "SARKSEARCH_NODE_ENV_PATH",
];

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const serviceRoot = path.resolve(currentDir, "..");
const testTempRoot = path.join(serviceRoot, ".tmp-tests");

function resetEnv(originalEnv) {
  process.env = { ...originalEnv };
}

function clearConfigEnv() {
  const keysToClear = new Set(CONFIG_ENV_KEYS.map((key) => key.toLowerCase()));
  for (const key of Object.keys(process.env)) {
    if (keysToClear.has(key.toLowerCase())) {
      delete process.env[key];
    }
  }
}

function makeEnvFile(name, lines) {
  fs.mkdirSync(testTempRoot, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(testTempRoot, `${name}-`));
  const envPath = path.join(tempDir, "fixture.env");
  fs.writeFileSync(envPath, `${lines.join("\n")}\n`, "utf-8");
  return { tempDir, envPath };
}

function readEnvExampleValues(envPath) {
  const values = {};
  for (const rawLine of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }
    const [key, ...valueParts] = line.split("=");
    values[key.trim()] = valueParts.join("=").trim();
  }
  return values;
}

async function importConfig(caseName) {
  const moduleUrl = pathToFileURL(path.join(serviceRoot, "src/lib/config.js"));
  moduleUrl.search = `?case=${caseName}-${Date.now()}`;
  return import(moduleUrl.href);
}

async function importStore(caseName) {
  const moduleUrl = pathToFileURL(path.join(serviceRoot, "src/lib/store.js"));
  moduleUrl.search = `?case=${caseName}-${Date.now()}`;
  return import(moduleUrl.href);
}

async function importUpstreamHelpers(caseName) {
  const moduleUrl = pathToFileURL(path.join(serviceRoot, "src/lib/upstream.js"));
  moduleUrl.search = `?case=${caseName}-${Date.now()}`;
  return import(moduleUrl.href);
}

async function runTest(name, testFn) {
  const originalEnv = { ...process.env };
  clearConfigEnv();
  try {
    await testFn();
    console.log(`ok - ${name}`);
  } finally {
    resetEnv(originalEnv);
  }
}

await runTest("node api config reads a dotenv file and uses those values", async () => {
  const { envPath } = makeEnvFile("node-config", [
    "HOST=0.0.0.0",
    "PORT=4100",
    "FASTAPI_BASE_URL=http://127.0.0.1:8100/",
    "CACHE_TTL_MS=12345",
    "REQUEST_TIMEOUT_MS=6789",
    "CORS_ORIGIN=http://example.test,http://localhost:5173",
    "MONGODB_URI=mongodb://example.test/sarksearch",
    "DEFAULT_SEARCH_LIMIT=6",
    "MAX_SEARCH_LIMIT=9",
    "RECENT_SEARCH_LIMIT=4",
  ]);

  process.env.SARKSEARCH_NODE_ENV_PATH = envPath;
  const { config } = await importConfig("dotenv-values");

  assert.equal(config.host, "0.0.0.0");
  assert.equal(config.port, 4100);
  assert.equal(config.fastApiBaseUrl, "http://127.0.0.1:8100");
  assert.equal(config.cacheTtlMs, 12345);
  assert.equal(config.requestTimeoutMs, 6789);
  assert.deepEqual(config.corsOrigins, ["http://example.test", "http://localhost:5173"]);
  assert.equal(config.mongoDbUri, "mongodb://example.test/sarksearch");
  assert.equal(config.defaultSearchLimit, 6);
  assert.equal(config.maxSearchLimit, 9);
  assert.equal(config.recentSearchLimit, 4);
});

await runTest("node api config prefers ENGINE_URL over FASTAPI_BASE_URL", async () => {
  const { envPath } = makeEnvFile("node-config-engine", [
    "ENGINE_URL=http://127.0.0.1:9001/",
    "FASTAPI_BASE_URL=http://127.0.0.1:9002/",
  ]);

  process.env.SARKSEARCH_NODE_ENV_PATH = envPath;
  const { config } = await importConfig("engine-url");

  assert.equal(config.fastApiBaseUrl, "http://127.0.0.1:9001");
});

await runTest("node api config normalizes protocol-less service references", async () => {
  const { envPath } = makeEnvFile("node-config-render-host", [
    "FASTAPI_BASE_URL=sarksearch-engine.render-internal.com:10000",
  ]);

  process.env.SARKSEARCH_NODE_ENV_PATH = envPath;
  const { config } = await importConfig("render-host");

  assert.equal(config.fastApiBaseUrl, "http://sarksearch-engine.render-internal.com:10000");
});

await runTest("node api env example matches active config contract", async () => {
  const envPath = path.join(serviceRoot, ".env.example");
  const values = readEnvExampleValues(envPath);
  process.env.SARKSEARCH_NODE_ENV_PATH = envPath;
  const { EXAMPLE_ENV_KEYS, config } = await importConfig("env-example");

  assert.deepEqual(Object.keys(values).sort(), [...EXAMPLE_ENV_KEYS].sort());
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 4000);
  assert.equal(config.fastApiBaseUrl, "http://127.0.0.1:8000");
  assert.equal(config.cacheTtlMs, 300000);
  assert.equal(config.requestTimeoutMs, 100000);
  assert.deepEqual(config.corsOrigins, ["http://127.0.0.1:5173", "http://localhost:5173"]);
  assert.equal(config.mongoDbUri, "");
  assert.equal(config.defaultSearchLimit, 5);
  assert.equal(config.maxSearchLimit, 20);
  assert.equal(config.recentSearchLimit, 10);
});

await runTest("node api config gives the recommendation engine enough response time by default", async () => {
  fs.mkdirSync(testTempRoot, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(testTempRoot, "node-config-empty-"));
  process.env.SARKSEARCH_NODE_ENV_PATH = path.join(tempDir, "missing.env");
  const { config } = await importConfig("timeout-default");

  assert.equal(config.requestTimeoutMs, 100000);
});

await runTest("node api gateway preserves FastAPI detail errors", async () => {
  const {
    getUpstreamErrorMessage,
    mapUpstreamStatus,
    readUpstreamPayload,
  } = await importUpstreamHelpers("json-error");

  const payload = await readUpstreamPayload({
    async text() {
      return JSON.stringify({
        detail: {
          message: "The LLM Brain did not return usable recommendations.",
          model: "gpt-4o-mini",
        },
      });
    },
  });

  assert.equal(
    getUpstreamErrorMessage(payload, "fallback"),
    "The LLM Brain did not return usable recommendations.",
  );
  assert.equal(mapUpstreamStatus(503), 503);
});

await runTest("node api gateway keeps non-json upstream failures readable", async () => {
  const {
    getUpstreamErrorMessage,
    mapUpstreamStatus,
    readUpstreamPayload,
  } = await importUpstreamHelpers("plain-error");

  const payload = await readUpstreamPayload({
    async text() {
      return "Internal Server Error";
    },
  });

  assert.deepEqual(payload, { raw: "Internal Server Error" });
  assert.equal(getUpstreamErrorMessage(payload, "fallback"), "Internal Server Error");
  assert.equal(mapUpstreamStatus(500), 502);
});

await runTest("node api auth sessions separate guest and user recent searches and keep only the latest 10 unique queries", async () => {
  fs.mkdirSync(testTempRoot, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(testTempRoot, "node-store-empty-"));
  process.env.SARKSEARCH_NODE_ENV_PATH = path.join(tempDir, "missing.env");
  const testEmail = `learner-${crypto.randomUUID()}@example.test`;
  const testPassword = `pw-${crypto.randomUUID()}`;
  const testName = "Example Learner";

  const {
    createGuestSession,
    initializePersistence,
    invalidateAuthSession,
    listRecentSearches,
    loginUser,
    registerUser,
    resolveAuthSession,
    saveSearchSession,
  } = await importStore("auth-history");
  await initializePersistence();

  const createdUser = await registerUser({
    email: testEmail,
    password: testPassword,
    name: testName,
  });

  assert.equal(createdUser.authContext.kind, "user");
  assert.equal(createdUser.authContext.user.email, testEmail);
  assert.equal(createdUser.authContext.user.name, testName);
  assert.ok(createdUser.token);

  await assert.rejects(
    () => registerUser({
      email: testEmail,
      password: testPassword,
      name: "Duplicate Learner",
    }),
    /already exists/i,
  );

  const loggedInUser = await loginUser({
    email: testEmail,
    password: testPassword,
  });
  const userAuthContext = await resolveAuthSession(loggedInUser.token);
  assert.equal(userAuthContext.kind, "user");
  assert.equal(userAuthContext.user.email, testEmail);

  const firstGuestSession = await createGuestSession();
  const firstGuestContext = await resolveAuthSession(firstGuestSession.token);
  assert.equal(firstGuestContext.kind, "guest");

  for (let index = 1; index <= 12; index += 1) {
    await saveSearchSession(
      {
        query: `Query ${index}`,
        summary: `Summary ${index}`,
        results: [],
        agentTrace: [],
        orchestration: {},
        meta: {},
      },
      { authContext: userAuthContext },
    );
  }

  await saveSearchSession(
    {
      query: "Query 5",
      summary: "Summary 5 latest",
      results: [],
      agentTrace: [],
      orchestration: {},
      meta: {},
    },
    { authContext: userAuthContext },
  );

  await saveSearchSession(
    {
      query: "Guest query",
      summary: "Guest summary",
      results: [],
      agentTrace: [],
      orchestration: {},
      meta: {},
    },
    { authContext: firstGuestContext },
  );

  assert.deepEqual(await listRecentSearches({ authContext: userAuthContext }), [
    "Query 5",
    "Query 12",
    "Query 11",
    "Query 10",
    "Query 9",
    "Query 8",
    "Query 7",
    "Query 6",
    "Query 4",
    "Query 3",
  ]);
  assert.deepEqual(await listRecentSearches({ authContext: firstGuestContext }), ["Guest query"]);

  const secondGuestSession = await createGuestSession();
  const secondGuestContext = await resolveAuthSession(secondGuestSession.token);
  assert.deepEqual(await listRecentSearches({ authContext: secondGuestContext }), []);

  await invalidateAuthSession(loggedInUser.token);
  assert.equal(await resolveAuthSession(loggedInUser.token), null);
  assert.deepEqual(await listRecentSearches(), []);
});
