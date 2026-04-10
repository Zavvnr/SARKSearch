function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeBaseUrl(value) {
  return String(value ?? "http://localhost:4000").replace(/\/+$/, "");
}

const API_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);
const DEFAULT_RESULT_LIMIT = parsePositiveInteger(import.meta.env.VITE_DEFAULT_RESULT_LIMIT, 8);

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error ?? "Something went wrong while loading recommendations.");
  }

  return payload;
}

export async function searchTools(query, limit = DEFAULT_RESULT_LIMIT) {
  const response = await fetch(`${API_BASE_URL}/api/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, limit }),
  });

  return parseResponse(response);
}

export async function fetchRecentSearches() {
  const response = await fetch(`${API_BASE_URL}/api/sessions/recent`);
  return parseResponse(response);
}

export { API_BASE_URL, DEFAULT_RESULT_LIMIT };
