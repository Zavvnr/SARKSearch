import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { API_BASE_URL, fetchRecentSearches, searchTools } from "./api";

const guidedPrompts = [
  "I need to build a resume but I have no design skills",
  "How should I obtain education in America?",
  "I want to learn Python from scratch",
  "Where should I go to find programming competition?",
  "Find tools for my first research paper",
  "What should I use to organize school and deadlines?",
];

const brandHighlights = [
  "Simple recommendations",
  "Direct site and app links",
  "Starter PDFs for first steps",
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

function getToolInitials(name) {
  const words = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return (words.map((word) => word[0]).join("").slice(0, 2) || "TL").toUpperCase();
}

function ToolMark({ tool }) {
  const [imageFailed, setImageFailed] = useState(false);
  const rawIcon = String(tool.icon ?? "").trim();
  const canUseImage = isUrlLike(rawIcon) && !imageFailed;
  const fallbackIcon = rawIcon && !isUrlLike(rawIcon) && rawIcon.length <= 4
    ? rawIcon
    : getToolInitials(tool.name);

  return (
    <div className="tool-mark" aria-hidden="true">
      {canUseImage ? (
        <img src={rawIcon} alt="" onError={() => setImageFailed(true)} />
      ) : (
        <span>{fallbackIcon}</span>
      )}
    </div>
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
  const [showAll, setShowAll] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState(getInitialTheme);

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

  async function runSearch(nextQuery) {
    const normalized = nextQuery.trim();

    if (!normalized) {
      setError("Describe what you want to do so SARKSearch can map it to tools.");
      return;
    }

    setError("");
    setIsPending(true);
    setShowAll(false);

    try {
      const payload = await searchTools(normalized);

      startTransition(() => {
        setResultsState(payload);
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

  const visibleResults = resultsState?.results?.slice(0, showAll ? undefined : 5) ?? [];
  const topResultNames = (resultsState?.results ?? []).slice(0, 3).map((tool) => tool.name);

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
                onChange={(event) => setQuery(event.target.value)}
              />
              <div className="search-actions">
                <button type="submit" disabled={isPending}>
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
                      <div className="result-actions">
                        <a href={tool.url} target="_blank" rel="noreferrer">
                          Visit tool
                        </a>
                        <a
                          href={`${API_BASE_URL}${tool.guideUrl}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open starter PDF
                        </a>
                      </div>
                    </article>
                  ))}
                </div>

                {resultsState.results.length > 5 ? (
                  <button
                    type="button"
                    className="show-more"
                    onClick={() => setShowAll((current) => !current)}
                  >
                    {showAll ? "Show top 5" : `Show ${resultsState.results.length - 5} more`}
                  </button>
                ) : null}

                <section className="post-search-proof" aria-label="Search result confirmation">
                  <div className="proof-panel proof-panel-primary">
                    <p className="panel-kicker">Popular Starting Points</p>
                    <h3>{topResultNames.length ? topResultNames.join(", ") : "Your first tools are ready"}</h3>
                    <p>
                      SARKSearch found practical places to begin. Open one tool first, then use the starter PDF
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
