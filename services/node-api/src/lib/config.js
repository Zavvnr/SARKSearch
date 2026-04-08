import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 4000),
  fastApiBaseUrl: process.env.FASTAPI_BASE_URL ?? "http://127.0.0.1:8000",
  cacheTtlMs: Number(process.env.CACHE_TTL_MS ?? 300000),
  mongoDbUri: process.env.MONGODB_URI ?? "",
};
