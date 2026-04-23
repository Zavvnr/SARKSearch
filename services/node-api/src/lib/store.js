import crypto from "node:crypto";
import { promisify } from "node:util";
import mongoose from "mongoose";
import { config } from "./config.js";

const scryptAsync = promisify(crypto.scrypt);
const AUTH_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

const recentSearchesByScope = new Map();
const usersByEmail = new Map();
const usersById = new Map();
const authSessionsByTokenHash = new Map();

let persistenceMode = "memory";
let SearchSession;
let User;
let AuthSession;
let nextMemoryUserId = 1;
let nextMemorySessionId = 1;

function makeStoreError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeDisplayName(name, email = "") {
  const normalizedName = String(name ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 60);

  if (normalizedName) {
    return normalizedName;
  }

  return email.split("@")[0] || "SARKSearch user";
}

function buildQueryKey(query) {
  return String(query ?? "").trim().toLowerCase();
}

function createToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token ?? "")).digest("hex");
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scryptAsync(String(password ?? ""), salt, 64);
  return `${salt}:${Buffer.from(derived).toString("hex")}`;
}

async function verifyPassword(password, storedHash) {
  const [salt, expectedHash] = String(storedHash ?? "").split(":");
  if (!salt || !expectedHash) {
    return false;
  }

  const derived = Buffer.from(await scryptAsync(String(password ?? ""), salt, 64));
  const expected = Buffer.from(expectedHash, "hex");

  if (derived.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(derived, expected);
}

function buildExpiryDate() {
  return new Date(Date.now() + AUTH_SESSION_TTL_MS);
}

function isExpired(session) {
  return new Date(session?.expiresAt ?? 0).getTime() <= Date.now();
}

function buildPublicUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: String(user._id ?? user.id ?? ""),
    email: normalizeEmail(user.email),
    name: normalizeDisplayName(user.name, user.email),
  };
}

function buildAuthContext(session, user = null) {
  const publicUser = buildPublicUser(user);

  return {
    sessionId: String(session?._id ?? session?.id ?? ""),
    kind: session?.kind === "user" ? "user" : "guest",
    userId: publicUser?.id ?? "",
    user: publicUser,
  };
}

function resolveScopeKey(authContext) {
  if (authContext?.kind === "user" && authContext.userId) {
    return `user:${authContext.userId}`;
  }

  if (authContext?.kind === "guest" && authContext.sessionId) {
    return `guest:${authContext.sessionId}`;
  }

  return "";
}

async function createUserAuthSession(user) {
  const token = createToken();
  const tokenHash = hashToken(token);
  const expiresAt = buildExpiryDate();

  if (persistenceMode === "mongo" && AuthSession) {
    const created = await AuthSession.create({
      tokenHash,
      kind: "user",
      userId: user._id,
      expiresAt,
    });

    return {
      token,
      authContext: buildAuthContext(created, user),
    };
  }

  const session = {
    id: `session-${nextMemorySessionId}`,
    tokenHash,
    kind: "user",
    userId: String(user.id),
    expiresAt,
  };

  nextMemorySessionId += 1;
  authSessionsByTokenHash.set(tokenHash, session);

  return {
    token,
    authContext: buildAuthContext(session, user),
  };
}

async function trimMongoSearchSessions(scopeKey) {
  const overflowDocs = await SearchSession.find({ scopeKey })
    .sort({ createdAt: -1 })
    .skip(config.recentSearchLimit)
    .select("_id")
    .lean();

  if (!overflowDocs.length) {
    return;
  }

  await SearchSession.deleteMany({
    _id: {
      $in: overflowDocs.map((item) => item._id),
    },
  });
}

async function findMongoUserById(userId) {
  if (!userId) {
    return null;
  }

  return User.findById(userId).lean();
}

function findMemoryUserById(userId) {
  return usersById.get(String(userId ?? "")) ?? null;
}

export async function initializePersistence() {
  if (!config.mongoDbUri) {
    return persistenceMode;
  }

  try {
    await mongoose.connect(config.mongoDbUri, {
      serverSelectionTimeoutMS: 2500,
    });

    const userSchema = new mongoose.Schema(
      {
        email: { type: String, required: true, unique: true, index: true },
        name: { type: String, default: "" },
        passwordHash: { type: String, required: true },
      },
      { timestamps: true },
    );

    const authSessionSchema = new mongoose.Schema(
      {
        tokenHash: { type: String, required: true, unique: true, index: true },
        kind: { type: String, enum: ["guest", "user"], required: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
        expiresAt: { type: Date, required: true, index: true, expires: 0 },
      },
      { timestamps: true },
    );

    const searchSessionSchema = new mongoose.Schema(
      {
        scopeKey: { type: String, required: true, index: true },
        queryKey: { type: String, required: true },
        query: { type: String, required: true },
        summary: { type: String, required: true },
        tools: { type: [String], default: [] },
        results: { type: [mongoose.Schema.Types.Mixed], default: [] },
        agentTrace: { type: [mongoose.Schema.Types.Mixed], default: [] },
        orchestration: { type: mongoose.Schema.Types.Mixed, default: {} },
        meta: { type: mongoose.Schema.Types.Mixed, default: {} },
      },
      { timestamps: true },
    );

    User = mongoose.models.User ?? mongoose.model("User", userSchema);
    AuthSession = mongoose.models.AuthSession ?? mongoose.model("AuthSession", authSessionSchema);
    SearchSession = mongoose.models.SearchSession ?? mongoose.model("SearchSession", searchSessionSchema);
    persistenceMode = "mongo";
  } catch (_error) {
    console.warn("MongoDB unavailable. Falling back to in-memory persistence.");
    persistenceMode = "memory";
  }

  return persistenceMode;
}

export function getPersistenceMode() {
  return persistenceMode;
}

export async function createGuestSession() {
  const token = createToken();
  const tokenHash = hashToken(token);
  const expiresAt = buildExpiryDate();

  if (persistenceMode === "mongo" && AuthSession) {
    const created = await AuthSession.create({
      tokenHash,
      kind: "guest",
      expiresAt,
    });

    return {
      token,
      authContext: buildAuthContext(created),
    };
  }

  const session = {
    id: `session-${nextMemorySessionId}`,
    tokenHash,
    kind: "guest",
    userId: "",
    expiresAt,
  };

  nextMemorySessionId += 1;
  authSessionsByTokenHash.set(tokenHash, session);

  return {
    token,
    authContext: buildAuthContext(session),
  };
}

export async function registerUser({ email, password, name }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedName = normalizeDisplayName(name, normalizedEmail);

  if (persistenceMode === "mongo" && User) {
    const existingUser = await User.findOne({ email: normalizedEmail }).select("_id").lean();
    if (existingUser) {
      throw makeStoreError("An account with that email already exists.", 409);
    }

    const createdUser = await User.create({
      email: normalizedEmail,
      name: normalizedName,
      passwordHash: await hashPassword(password),
    });

    return createUserAuthSession(createdUser);
  }

  if (usersByEmail.has(normalizedEmail)) {
    throw makeStoreError("An account with that email already exists.", 409);
  }

  const user = {
    id: `user-${nextMemoryUserId}`,
    email: normalizedEmail,
    name: normalizedName,
    passwordHash: await hashPassword(password),
  };

  nextMemoryUserId += 1;
  usersByEmail.set(normalizedEmail, user);
  usersById.set(user.id, user);

  return createUserAuthSession(user);
}

export async function loginUser({ email, password }) {
  const normalizedEmail = normalizeEmail(email);

  if (persistenceMode === "mongo" && User) {
    const user = await User.findOne({ email: normalizedEmail });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw makeStoreError("Email or password is incorrect.", 401);
    }

    return createUserAuthSession(user);
  }

  const user = usersByEmail.get(normalizedEmail);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw makeStoreError("Email or password is incorrect.", 401);
  }

  return createUserAuthSession(user);
}

export async function resolveAuthSession(token) {
  const normalizedToken = String(token ?? "").trim();
  if (!normalizedToken) {
    return null;
  }

  const tokenHash = hashToken(normalizedToken);

  if (persistenceMode === "mongo" && AuthSession) {
    const session = await AuthSession.findOne({ tokenHash }).lean();
    if (!session) {
      return null;
    }

    if (isExpired(session)) {
      await AuthSession.deleteOne({ _id: session._id });
      return null;
    }

    if (session.kind === "user") {
      const user = await findMongoUserById(session.userId);
      if (!user) {
        await AuthSession.deleteOne({ _id: session._id });
        return null;
      }

      return buildAuthContext(session, user);
    }

    return buildAuthContext(session);
  }

  const session = authSessionsByTokenHash.get(tokenHash);
  if (!session) {
    return null;
  }

  if (isExpired(session)) {
    authSessionsByTokenHash.delete(tokenHash);
    return null;
  }

  if (session.kind === "user") {
    const user = findMemoryUserById(session.userId);
    if (!user) {
      authSessionsByTokenHash.delete(tokenHash);
      return null;
    }

    return buildAuthContext(session, user);
  }

  return buildAuthContext(session);
}

export async function invalidateAuthSession(token) {
  const normalizedToken = String(token ?? "").trim();
  if (!normalizedToken) {
    return false;
  }

  const tokenHash = hashToken(normalizedToken);

  if (persistenceMode === "mongo" && AuthSession) {
    const result = await AuthSession.deleteOne({ tokenHash });
    return result.deletedCount > 0;
  }

  return authSessionsByTokenHash.delete(tokenHash);
}

export async function saveSearchSession(payload, options = {}) {
  const scopeKey = resolveScopeKey(options.authContext);
  if (!scopeKey) {
    return;
  }

  const record = {
    scopeKey,
    queryKey: buildQueryKey(payload.query),
    query: payload.query,
    summary: payload.summary,
    tools: payload.results.map((item) => item.name),
    results: payload.results,
    agentTrace: payload.agentTrace,
    orchestration: payload.orchestration,
    meta: payload.meta ?? {},
  };

  if (persistenceMode === "mongo" && SearchSession) {
    await SearchSession.deleteMany({
      scopeKey,
      queryKey: record.queryKey,
    });
    await SearchSession.create(record);
    await trimMongoSearchSessions(scopeKey);
    return;
  }

  const currentRecords = recentSearchesByScope.get(scopeKey) ?? [];
  const nextRecords = [record, ...currentRecords.filter((item) => item.queryKey !== record.queryKey)]
    .slice(0, config.recentSearchLimit);

  recentSearchesByScope.set(scopeKey, nextRecords);
}

export async function listRecentSearches(options = {}) {
  const scopeKey = resolveScopeKey(options.authContext);
  if (!scopeKey) {
    return [];
  }

  if (persistenceMode === "mongo" && SearchSession) {
    const docs = await SearchSession.find({ scopeKey })
      .sort({ createdAt: -1 })
      .limit(config.recentSearchLimit)
      .lean();

    return docs.map((item) => item.query);
  }

  return (recentSearchesByScope.get(scopeKey) ?? []).map((item) => item.query);
}
