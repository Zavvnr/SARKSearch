import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  API_BASE_URL,
  MAX_RESULT_LIMIT,
  NETWORK_RESULT_LIMIT,
  fetchApplicationNetwork,
  fetchRecentSearches,
  searchTools,
} from "./api";

const RESULT_BATCH_SIZE = 5;
const NETWORK_CENTER = { x: 590, y: 420 };
const NETWORK_RING_CAPACITIES = [8, 16, 26];
const NETWORK_RING_RADII = [145, 260, 370];
const GUIDE_FORMAT_LIMIT = 3;
const DEFAULT_GUIDE_FORMAT_IDS = ["pdf", "word", "docs"];
const STARTUP_SEARCH_PROMPT =
  "What are the most used apps? Make this like a tutorial for using the sites.";
let hasStartedInitialSearch = false;

const guidedPrompts = [
  "How can I show my skills and achievements to potential employers?",
  "How should I obtain education in America?",
  "I want to learn Python from scratch",
  "Where should I go to find programming competition?",
  "Find tools for my first research paper",
  "How can I find a therapist and start therapy?",
  "What should I use to organize school and deadlines?",
];

const brandHighlights = [
  "Simple recommendations",
  "Direct site and app links",
  "Starter docs for first steps",
];

const guideFormatOptions = [
  {
    id: "pdf",
    name: "PDF",
    detail: "Printable guide",
    actionLabel: "Open PDF",
    urlKeys: ["pdfGuideUrl"],
  },
  {
    id: "word",
    name: "Word",
    detail: "Editable .doc",
    actionLabel: "Open Word",
    urlKeys: ["wordGuideUrl", "documentUrl", "guideUrl"],
  },
  {
    id: "docs",
    name: "Docs",
    detail: "Google-ready doc",
    actionLabel: "Open Docs",
    urlKeys: ["docsGuideUrl", "guideUrl", "documentUrl"],
  },
  {
    id: "html",
    name: "HTML",
    detail: "Browser page",
    actionLabel: "Open HTML",
    urlKeys: ["htmlGuideUrl"],
  },
];

const themeOptions = [
  {
    id: "fern",
    name: "Fern",
    detail: "Soft green and calm",
    swatch: ["#edf6ee", "#cfe4d2", "#3c8a63"],
  },
  {
    id: "linen",
    name: "Linen",
    detail: "Warm sand and sage",
    swatch: ["#f6f0e6", "#e9dcc7", "#8a6a44"],
  },
  {
    id: "harbor",
    name: "Harbor",
    detail: "Mist blue and teal",
    swatch: ["#edf5f8", "#cfe3ec", "#2e7080"],
  },
  {
    id: "midnight",
    name: "Midnight",
    detail: "Dark blue focus",
    swatch: ["#0c1226", "#1b2d59", "#7aa4ff"],
  },
  {
    id: "iris",
    name: "Iris",
    detail: "Dark violet glow",
    swatch: ["#140f22", "#2f2153", "#ad7cff"],
  },
  {
    id: "grove",
    name: "Grove",
    detail: "Dark green depth",
    swatch: ["#0d1713", "#1e3b31", "#68cf9f"],
  },
];

function getInitialTheme() {
  if (typeof window === "undefined") {
    return themeOptions[0].id;
  }

  const savedTheme = window.localStorage.getItem("sarksearch-theme");
  if (themeOptions.some((option) => option.id === savedTheme)) {
    return savedTheme;
  }

  return themeOptions[0].id;
}

const credits = [
  {
    name: "OpenAI",
    href: "https://openai.com/",
    detail: "LLM Brain recommendations",
  },
  {
    name: "MongoDB",
    href: "https://www.mongodb.com/",
    detail: "optional search persistence",
  },
  {
    name: "React",
    href: "https://react.dev/",
    detail: "frontend interface",
  },
  {
    name: "FastAPI",
    href: "https://fastapi.tiangolo.com/",
    detail: "recommendation engine",
  },
  {
    name: "Express",
    href: "https://expressjs.com/",
    detail: "gateway layer",
  },
  {
    name: "Vercel",
    href: "https://vercel.com/",
    detail: "deployment platform",
  },
];

function isUrlLike(value) {
  return /^https?:\/\//i.test(String(value ?? "").trim());
}

function toApiHref(value) {
  const path = String(value ?? "").trim();
  if (!path) {
    return "";
  }

  if (isUrlLike(path)) {
    return path;
  }

  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function getUrlHostname(value) {
  try {
    return new URL(String(value ?? "").trim()).hostname.replace(/^www\./i, "");
  } catch (_error) {
    return "";
  }
}

function getLogoUrl(tool) {
  const rawIcon = String(tool?.icon ?? "").trim();
  if (isUrlLike(rawIcon)) {
    return rawIcon;
  }

  const hostname = getUrlHostname(tool?.url);
  return hostname ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64` : "";
}

function getToolInitials(name) {
  const words = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return (words.map((word) => word[0]).join("").slice(0, 2) || "TL").toUpperCase();
}

function normalizeIdentityValue(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

function getResultIdentityKeys(tool) {
  return [
    tool?.slug ? `slug:${normalizeIdentityValue(tool.slug)}` : "",
    tool?.url ? `url:${normalizeIdentityValue(tool.url)}` : "",
    tool?.name ? `name:${normalizeIdentityValue(tool.name)}` : "",
  ].filter(Boolean);
}

function mergeUniqueResults(existingResults, incomingResults) {
  const seenKeys = new Set();
  const mergedResults = [];

  for (const tool of [...existingResults, ...incomingResults]) {
    const identityKeys = getResultIdentityKeys(tool);
    if (!identityKeys.length || identityKeys.some((key) => seenKeys.has(key))) {
      continue;
    }

    mergedResults.push(tool);
    identityKeys.forEach((key) => seenKeys.add(key));
  }

  return mergedResults;
}

function isSameResult(first, second) {
  if (!first || !second) {
    return false;
  }

  const secondKeys = new Set(getResultIdentityKeys(second));
  return getResultIdentityKeys(first).some((key) => secondKeys.has(key));
}

function toSearchExclusion(tool) {
  return {
    slug: tool.slug ?? "",
    name: tool.name ?? "",
    url: tool.url ?? "",
  };
}

function replaceGuideExtension(path, extension) {
  return String(path ?? "").replace(/\.doc(?=$|\?)/i, `.${extension}`);
}

function getGuidePath(tool, formatOption) {
  for (const key of formatOption.urlKeys) {
    if (tool?.[key]) {
      return tool[key];
    }
  }

  const documentPath = tool?.documentUrl || tool?.guideUrl || "";
  if (formatOption.id === "pdf") {
    return replaceGuideExtension(documentPath, "pdf");
  }
  if (formatOption.id === "html") {
    return replaceGuideExtension(documentPath, "html");
  }

  return documentPath;
}

function GuideActions({ tool, selectedFormats, className = "" }) {
  return (
    <div className={`result-actions${className ? ` ${className}` : ""}`}>
      <a href={tool.url} target="_blank" rel="noreferrer">
        Visit tool
      </a>
      {selectedFormats.map((formatOption) => {
        const guidePath = getGuidePath(tool, formatOption);
        const href = toApiHref(guidePath);
        if (!href) {
          return null;
        }

        return (
          <a key={formatOption.id} href={href} target="_blank" rel="noreferrer">
            {formatOption.actionLabel}
          </a>
        );
      })}
    </div>
  );
}

function GuideFormatPicker({ selectedFormatIds, onToggleFormat }) {
  const isAtLimit = selectedFormatIds.length >= GUIDE_FORMAT_LIMIT;

  return (
    <fieldset className="guide-format-picker">
      <legend>Guidance formats</legend>
      <div className="guide-format-options" aria-label={`Choose up to ${GUIDE_FORMAT_LIMIT} guidance formats`}>
        {guideFormatOptions.map((option) => {
          const isSelected = selectedFormatIds.includes(option.id);
          const isDisabled = !isSelected && isAtLimit;

          return (
            <button
              key={option.id}
              type="button"
              className={`guide-format-option${isSelected ? " is-selected" : ""}`}
              onClick={() => onToggleFormat(option.id)}
              aria-pressed={isSelected}
              disabled={isDisabled}
              title={isDisabled ? "Deselect one format first." : option.detail}
            >
              <span>{option.name}</span>
              <small>{option.detail}</small>
            </button>
          );
        })}
      </div>
      <p>
        {selectedFormatIds.length} of {GUIDE_FORMAT_LIMIT} selected. Result guide buttons will match your choices.
      </p>
    </fieldset>
  );
}

function buildNetworkLayout(results) {
  const nodes = [];
  let index = 0;

  for (let ringIndex = 0; ringIndex < NETWORK_RING_CAPACITIES.length && index < results.length; ringIndex += 1) {
    const capacity = NETWORK_RING_CAPACITIES[ringIndex];
    const radius = NETWORK_RING_RADII[ringIndex];
    const ringCount = Math.min(capacity, results.length - index);
    const angleOffset = ringIndex * 0.17;

    for (let slot = 0; slot < ringCount; slot += 1) {
      const angle = -Math.PI / 2 + angleOffset + (Math.PI * 2 * slot) / ringCount;
      const spacingNudge = slot % 2 === 0 ? 6 : -6;
      const x = NETWORK_CENTER.x + Math.cos(angle) * (radius + spacingNudge);
      const y = NETWORK_CENTER.y + Math.sin(angle) * (radius - spacingNudge);
      nodes.push({
        tool: results[index],
        x: Math.round(x),
        y: Math.round(y),
      });
      index += 1;
    }
  }

  return nodes;
}

function ToolMark({ tool }) {
  const [imageFailed, setImageFailed] = useState(false);
  const rawIcon = String(tool.icon ?? "").trim();
  const logoUrl = getLogoUrl(tool);
  const canUseImage = Boolean(logoUrl) && !imageFailed;
  const fallbackIcon = rawIcon && !isUrlLike(rawIcon) && rawIcon.length <= 4
    ? rawIcon
    : getToolInitials(tool.name);

  useEffect(() => {
    setImageFailed(false);
  }, [logoUrl]);

  return (
    <div className="tool-mark" aria-hidden="true">
      {canUseImage ? (
        <img src={logoUrl} alt="" onError={() => setImageFailed(true)} />
      ) : (
        <span>{fallbackIcon}</span>
      )}
    </div>
  );
}

function ApplicationNetwork({ query, tools, selectedTool, selectedGuideFormats, onSelectTool }) {
  const nodes = useMemo(() => buildNetworkLayout(tools), [tools]);

  return (
    <section className="network-panel" aria-label="Application network">
      <div className="network-panel-heading">
        <div>
          <p className="panel-kicker">Application network</p>
          <h3>{tools.length} close matches around your prompt</h3>
        </div>
        <span>{NETWORK_RESULT_LIMIT} result target</span>
      </div>

      <div className="network-scroll" tabIndex={0} aria-label="Scrollable application network graph">
        <div className="network-stage">
          <svg className="network-edges" viewBox="0 0 1180 840" aria-hidden="true">
            {nodes.map(({ tool, x, y }) => (
              <line
                key={`${tool.slug}-edge`}
                className="network-edge"
                x1={NETWORK_CENTER.x}
                y1={NETWORK_CENTER.y}
                x2={x}
                y2={y}
              />
            ))}
          </svg>

          <div className="network-center-node" title={query} tabIndex={0} aria-label={`Prompt: ${query}`}>
            <span>Prompt</span>
            <strong>{query}</strong>
          </div>

          {nodes.map(({ tool, x, y }, index) => (
            <button
              key={`${tool.slug}-${index}`}
              type="button"
              className={`network-node${isSameResult(tool, selectedTool) ? " is-selected" : ""}`}
              style={{
                "--node-x": `${x}px`,
                "--node-y": `${y}px`,
              }}
              onClick={() => onSelectTool(tool)}
              title={tool.name}
            >
              <ToolMark tool={tool} />
              <span className="network-node-label">{tool.name}</span>
            </button>
          ))}
        </div>
      </div>

      {selectedTool ? (
        <article className="network-detail" aria-label={`Selected application: ${selectedTool.name}`}>
          <div className="network-detail-main">
            <div className="result-headline">
              <ToolMark tool={selectedTool} />
              <div>
                <h3>{selectedTool.name}</h3>
                <p className="result-meta">
                  {selectedTool.category} / {selectedTool.popularity}
                </p>
              </div>
            </div>
            <p className="result-description">{selectedTool.description}</p>
            <p className="result-reason">{selectedTool.relevanceReason}</p>
            <p className="result-tip">Start here: {selectedTool.starterTip}</p>
          </div>
          <GuideActions
            tool={selectedTool}
            selectedFormats={selectedGuideFormats}
            className="network-detail-actions"
          />
        </article>
      ) : null}
    </section>
  );
}

function BrandMark() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className="brand-mark-svg">
      <circle cx="32" cy="32" r="20" className="brand-mark-ring" />
      <ellipse cx="32" cy="32" rx="8.5" ry="20" className="brand-mark-line" />
      <ellipse cx="32" cy="32" rx="20" ry="8.5" className="brand-mark-line brand-mark-line-soft" />
      <path d="M13.5 32h37" className="brand-mark-line" />
      <circle cx="48" cy="18" r="4.7" className="brand-mark-dot" />
    </svg>
  );
}

function App() {
  const [query, setQuery] = useState("");
  const [resultsState, setResultsState] = useState(null);
  const [recentQueries, setRecentQueries] = useState([]);
  const [isPending, setIsPending] = useState(false);
  const [isSearchingMore, setIsSearchingMore] = useState(false);
  const [error, setError] = useState("");
  const [resultsNotice, setResultsNotice] = useState("");
  const [networkState, setNetworkState] = useState(null);
  const [isNetworkVisible, setIsNetworkVisible] = useState(false);
  const [isNetworkLoading, setIsNetworkLoading] = useState(false);
  const [networkError, setNetworkError] = useState("");
  const [selectedNetworkTool, setSelectedNetworkTool] = useState(null);
  const [hasMoreResults, setHasMoreResults] = useState(true);
  const [theme, setTheme] = useState(getInitialTheme);
  const [selectedGuideFormatIds, setSelectedGuideFormatIds] = useState(DEFAULT_GUIDE_FORMAT_IDS);
  const userTouchedQueryRef = useRef(false);

  const deferredQuery = useDeferredValue(query);

  const normalizedDeferredQuery = deferredQuery.trim().toLowerCase();
  const visiblePrompts = !normalizedDeferredQuery
    ? guidedPrompts
    : guidedPrompts.filter((prompt) => prompt.toLowerCase().includes(normalizedDeferredQuery)).slice(0, 5);

  useEffect(() => {
    let isActive = true;

    fetchRecentSearches()
      .then((payload) => {
        if (isActive) {
          setRecentQueries(payload.sessions ?? []);
        }
      })
      .catch(() => {
        if (isActive) {
          setRecentQueries([]);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("sarksearch-theme", theme);
  }, [theme]);

  async function runSearch(nextQuery, options = {}) {
    const normalized = nextQuery.trim();
    const isAutomatic = options.isAutomatic === true;

    if (!normalized) {
      setError("Describe what you want to do so SARKSearch can map it to tools.");
      return;
    }

    if (!isAutomatic) {
      userTouchedQueryRef.current = true;
    }

    setError("");
    setResultsNotice("");
    setNetworkState(null);
    setIsNetworkVisible(false);
    setNetworkError("");
    setSelectedNetworkTool(null);
    setHasMoreResults(true);
    setIsPending(true);
    setIsSearchingMore(false);

    try {
      const payload = await searchTools(normalized, {
        limit: RESULT_BATCH_SIZE,
        skipSessionSave: options.skipSessionSave,
      });
      const initialResults = mergeUniqueResults([], payload.results ?? []).slice(0, MAX_RESULT_LIMIT);

      startTransition(() => {
        setResultsState({
          ...payload,
          results: initialResults,
        });
        setRecentQueries((current) => {
          const withNewest = [payload.query, ...current];
          return Array.from(new Set(withNewest)).slice(0, 6);
        });
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsPending(false);
    }
  }

  useEffect(() => {
    if (hasStartedInitialSearch) {
      return;
    }

    hasStartedInitialSearch = true;
    let isActive = true;

    const warmSearch = async () => {
      try {
        await searchTools(STARTUP_SEARCH_PROMPT, {
          limit: RESULT_BATCH_SIZE,
          skipCache: true,
          skipSessionSave: true,
        });
      } catch (_error) {
        // Intentionally ignore the first warm-up failure and let the visible retry run next.
      }

      if (!isActive || userTouchedQueryRef.current) {
        return;
      }

      setQuery(STARTUP_SEARCH_PROMPT);
      await runSearch(STARTUP_SEARCH_PROMPT, { isAutomatic: true });
    };

    void warmSearch();

    return () => {
      isActive = false;
    };
  }, []);

  async function runSearchMore() {
    const currentResults = resultsState?.results ?? [];
    const normalized = String(resultsState?.query ?? query).trim();

    if (!resultsState || !normalized || currentResults.length >= MAX_RESULT_LIMIT) {
      return;
    }

    const nextLimit = Math.min(RESULT_BATCH_SIZE, MAX_RESULT_LIMIT - currentResults.length);
    setError("");
    setResultsNotice("");
    setIsSearchingMore(true);

    try {
      const payload = await searchTools(normalized, {
        limit: nextLimit,
        excludeResults: currentResults.map(toSearchExclusion),
      });
      const mergedResults = mergeUniqueResults(currentResults, payload.results ?? []).slice(0, MAX_RESULT_LIMIT);
      const addedCount = Math.max(mergedResults.length - currentResults.length, 0);

      startTransition(() => {
        setResultsState((current) => {
          if (!current || current.query !== resultsState.query) {
            return current;
          }

          return {
            ...current,
            results: mergedResults,
            agentTrace: payload.agentTrace,
            orchestration: payload.orchestration,
            meta: payload.meta,
          };
        });
      });

      setResultsNotice(
        addedCount
          ? `Added ${addedCount} new ${addedCount === 1 ? "result" : "results"}.`
          : "No more unique results were available for this search.",
      );
      setHasMoreResults(addedCount > 0 && mergedResults.length < MAX_RESULT_LIMIT);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSearchingMore(false);
    }
  }

  async function runApplicationNetwork() {
    const normalized = String(resultsState?.query ?? query).trim();

    if (!normalized) {
      return;
    }

    if (isNetworkVisible) {
      setIsNetworkVisible(false);
      return;
    }

    setIsNetworkVisible(true);

    if (networkState?.query === normalized && networkState.results?.length) {
      return;
    }

    setNetworkError("");
    setIsNetworkLoading(true);
    setSelectedNetworkTool(null);

    try {
      const payload = await fetchApplicationNetwork(normalized, { limit: NETWORK_RESULT_LIMIT });
      const networkResults = mergeUniqueResults([], payload.results ?? []).slice(0, NETWORK_RESULT_LIMIT);

      startTransition(() => {
        setNetworkState({
          ...payload,
          results: networkResults,
        });
        setSelectedNetworkTool(networkResults[0] ?? null);
      });
    } catch (requestError) {
      setNetworkError(requestError.message);
    } finally {
      setIsNetworkLoading(false);
    }
  }

  const visibleResults = resultsState?.results ?? [];
  const resultCount = visibleResults.length;
  const canSearchMore = Boolean(resultsState) && hasMoreResults && resultCount < MAX_RESULT_LIMIT;
  const nextResultCount = Math.min(resultCount + RESULT_BATCH_SIZE, MAX_RESULT_LIMIT);
  const topResultNames = (resultsState?.results ?? []).slice(0, 3).map((tool) => tool.name);
  const networkResults =
    networkState && resultsState && networkState.query === resultsState.query ? networkState.results ?? [] : [];
  const selectedGuideFormats = useMemo(
    () => guideFormatOptions.filter((option) => selectedGuideFormatIds.includes(option.id)),
    [selectedGuideFormatIds],
  );

  function toggleGuideFormat(formatId) {
    setSelectedGuideFormatIds((current) => {
      if (current.includes(formatId)) {
        return current.length === 1 ? current : current.filter((id) => id !== formatId);
      }

      if (current.length >= GUIDE_FORMAT_LIMIT) {
        return current;
      }

      return [...current, formatId];
    });
  }

  return (
    <div className="page-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <main className="page">
        <section className="hero">
          <div className="hero-copy">
            <div className="hero-topbar">
              <div className="brand-lockup">
                <div className="brand-mark-shell">
                  <BrandMark />
                </div>
                <div className="brand-copy">
                  <span className="brand-name">SARKSearch</span>
                  <span className="brand-tag">starter-friendly discovery</span>
                </div>
              </div>

              <div className="theme-dock" role="group" aria-label="Choose a theme">
                {themeOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`theme-icon${theme === option.id ? " is-active" : ""}`}
                    onClick={() => setTheme(option.id)}
                    aria-label={`${option.name} theme`}
                    title={`${option.name}: ${option.detail}`}
                    style={{
                      "--theme-swatch-a": option.swatch[0],
                      "--theme-swatch-b": option.swatch[1],
                      "--theme-swatch-c": option.swatch[2],
                    }}
                  >
                    <span className="theme-icon-dot" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>

            <p className="eyebrow">Synchronized Applications Recommender Knowledgebases Search</p>
            <h1 className="hero-title">Don&apos;t know what site or app you need? Ask SARKSearch.</h1>
            <p className="hero-text">
              Describe your goal in plain English and get a short list of beginner-friendly tools you can
              try right away.
            </p>

            <form
              className="search-panel"
              onSubmit={(event) => {
                event.preventDefault();
                runSearch(query);
              }}
            >
              <label className="search-label" htmlFor="query">
                What do you want help with?
              </label>
                <textarea
                  id="query"
                  value={query}
                  rows={3}
                  placeholder="I want to get a job, but I do not know where to start."
                  onChange={(event) => {
                    userTouchedQueryRef.current = true;
                    setQuery(event.target.value);
                  }}
                />
              <GuideFormatPicker
                selectedFormatIds={selectedGuideFormatIds}
                onToggleFormat={toggleGuideFormat}
              />
              <div className="search-actions">
                <button type="submit" disabled={isPending || isSearchingMore}>
                  {isPending ? "Searching..." : "Search SARKSearch"}
                </button>
                <span className="subtle-copy">Search first, then open the tools and guides that feel most useful.</span>
              </div>
            </form>

            {error ? <p className="error-text">{error}</p> : null}

            {!resultsState ? (
              <div className="support-grid">
                <section className="support-panel">
                  <p className="panel-kicker">Popular Starting Points</p>
                  <div className="guided-prompts">
                    {visiblePrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        className="prompt-pill"
                        onClick={() => {
                          setQuery(prompt);
                          runSearch(prompt);
                        }}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="support-panel">
                  <p className="panel-kicker">What you get</p>
                  <div className="highlight-row" aria-label="Product highlights">
                    {brandHighlights.map((item) => (
                      <span key={item} className="highlight-pill">
                        {item}
                      </span>
                    ))}
                  </div>
                  <p className="support-copy">
                    Results are meant to be easy to act on, not overwhelming. Start with one tool, then expand if
                    you need more options.
                  </p>
                </section>
              </div>
            ) : null}
          </div>
        </section>

        <section className="workspace">
          <div className="results-column">
            <div className="section-heading">
              <div>
                <p className="panel-kicker">{resultsState ? "Popular Starting Points" : "Recommendations"}</p>
                <h2>{resultsState ? "Tools you can try first" : "Suggested sites and apps for your goal"}</h2>
              </div>
            </div>

            {!resultsState ? (
              <div className="empty-state">
                <p>Search for a goal above to get a short list of tools you can try next.</p>
              </div>
            ) : (
              <>
                <div className="summary-strip">
                  <p>{resultsState.summary}</p>
                </div>

                <div className="network-action-row">
                  <button
                    type="button"
                    className="network-toggle"
                    onClick={runApplicationNetwork}
                    disabled={isNetworkLoading || isPending}
                  >
                    {isNetworkLoading
                      ? "Building network..."
                      : isNetworkVisible
                        ? "Hide Application Networks"
                        : "See Application Networks"}
                  </button>
                  <span>Map up to 50 nearby applications around this prompt.</span>
                </div>

                {networkError ? <p className="error-text">{networkError}</p> : null}

                {isNetworkVisible && !isNetworkLoading && networkResults.length ? (
                  <ApplicationNetwork
                    query={resultsState.query}
                    tools={networkResults}
                    selectedTool={selectedNetworkTool}
                    selectedGuideFormats={selectedGuideFormats}
                    onSelectTool={setSelectedNetworkTool}
                  />
                ) : null}

                {isNetworkVisible && !isNetworkLoading && !networkResults.length && !networkError ? (
                  <p className="empty-copy">No application network was available for this search yet.</p>
                ) : null}

                <div className="results-list">
                  {visibleResults.map((tool, index) => (
                    <article key={tool.slug} className="result-row">
                      <div className="result-rank">{String(index + 1).padStart(2, "0")}</div>
                      <div className="result-main">
                        <div className="result-headline">
                          <ToolMark tool={tool} />
                          <div>
                            <h3>{tool.name}</h3>
                            <p className="result-meta">
                              {tool.category} / {tool.popularity}
                            </p>
                          </div>
                        </div>
                        <p className="result-description">{tool.description}</p>
                        <p className="result-reason">{tool.relevanceReason}</p>
                        <p className="result-tip">Start here: {tool.starterTip}</p>
                      </div>
                      <GuideActions tool={tool} selectedFormats={selectedGuideFormats} />
                    </article>
                  ))}
                </div>

                {canSearchMore ? (
                  <button
                    type="button"
                    className="show-more"
                    onClick={runSearchMore}
                    disabled={isSearchingMore || isPending}
                  >
                    {isSearchingMore ? "Searching more..." : `Search more: ${nextResultCount} results`}
                  </button>
                ) : null}

                {resultCount >= MAX_RESULT_LIMIT ? (
                  <p className="empty-copy">You reached the 20-result maximum for this search.</p>
                ) : null}

                {resultsNotice ? <p className="empty-copy">{resultsNotice}</p> : null}

                <section className="post-search-proof" aria-label="Search result confirmation">
                  <div className="proof-panel proof-panel-primary">
                    <p className="panel-kicker">Popular Starting Points</p>
                    <h3>{topResultNames.length ? topResultNames.join(", ") : "Your first tools are ready"}</h3>
                    <p>
                      SARKSearch found practical places to begin. Open one tool first, then use the starter doc
                      when you want a guided first step.
                    </p>
                  </div>
                  <div className="proof-panel">
                    <p className="panel-kicker">What you get</p>
                    <div className="proof-list">
                      {brandHighlights.map((item) => (
                        <span key={item}>{item}</span>
                      ))}
                    </div>
                  </div>
                </section>
              </>
            )}
          </div>

          <section className="recent-panel">
            <div className="section-heading">
              <div>
                <p className="panel-kicker">Recent searches</p>
                <h2>Jump back into something you already explored</h2>
              </div>
            </div>

            {recentQueries.length ? (
              <div className="recent-list">
                {recentQueries.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="recent-item"
                    onClick={() => {
                      setQuery(item);
                      runSearch(item);
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            ) : (
              <p className="empty-copy">Your recent searches will show up here after the first search.</p>
            )}
          </section>
        </section>

        <footer className="site-footer" aria-label="Credits">
          <p className="panel-kicker">Credits</p>
          <div className="credits-list">
            {credits.map((credit) => (
              <a key={credit.name} href={credit.href} target="_blank" rel="noreferrer" className="credit-item">
                <strong>{credit.name}</strong>
                <span>{credit.detail}</span>
              </a>
            ))}
          </div>
        </footer>
      </main>
    </div>
  );
}

export default App;
