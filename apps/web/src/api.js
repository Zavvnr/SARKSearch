const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error ?? "Something went wrong while loading recommendations.");
  }

  return payload;
}

export async function searchTools(query, limit = 8) {
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

export { API_BASE_URL };
