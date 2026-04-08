import mongoose from "mongoose";
import { config } from "./config.js";

const recentSearches = [];
let persistenceMode = "memory";
let SearchSession;

export async function initializePersistence() {
  if (!config.mongoDbUri) {
    return persistenceMode;
  }

  try {
    await mongoose.connect(config.mongoDbUri, {
      serverSelectionTimeoutMS: 2500,
    });

    const schema = new mongoose.Schema(
      {
        query: { type: String, required: true },
        summary: { type: String, required: true },
        tools: { type: [String], default: [] },
      },
      { timestamps: true },
    );

    SearchSession = mongoose.models.SearchSession ?? mongoose.model("SearchSession", schema);
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

export async function saveSearchSession(payload) {
  const record = {
    query: payload.query,
    summary: payload.summary,
    tools: payload.results.map((item) => item.name),
  };

  if (persistenceMode === "mongo" && SearchSession) {
    await SearchSession.create(record);
    return;
  }

  recentSearches.unshift(record);
  recentSearches.splice(6);
}

export async function listRecentSearches() {
  if (persistenceMode === "mongo" && SearchSession) {
    const docs = await SearchSession.find().sort({ createdAt: -1 }).limit(6).lean();
    return docs.map((item) => item.query);
  }

  return recentSearches.map((item) => item.query);
}
