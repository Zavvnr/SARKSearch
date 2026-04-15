export async function readUpstreamPayload(response) {
  const rawText = await response.text();
  if (!rawText) {
    return {};
  }

  try {
    return JSON.parse(rawText);
  } catch (_error) {
    return { raw: rawText };
  }
}

export function getUpstreamErrorMessage(payload, fallback) {
  const detail = payload?.detail;

  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  if (typeof detail?.message === "string" && detail.message.trim()) {
    return detail.message;
  }

  if (typeof payload?.error === "string" && payload.error.trim()) {
    return payload.error;
  }

  if (typeof payload?.raw === "string" && payload.raw.trim()) {
    return payload.raw.slice(0, 500);
  }

  return fallback;
}

export function mapUpstreamStatus(status) {
  return status === 503 ? 503 : 502;
}
