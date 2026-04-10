import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { API_BASE_URL, fetchRecentSearches, searchTools } from "./api";

const guidedPrompts = [
  "I need to build a resume but I have no design skills",
  "I want to learn Python from scratch",
  "Find tools for my first research paper",
  "Help me meet online friends with shared interests",
  "What should I use to organize school and deadlines?",
];

const brandHighlights = [
  "Simple recommendations",
  "Direct site and app links",
  "Starter PDFs for first steps",
];

function App() {
  const [query, setQuery] = useState("");
  const [resultsState, setResultsState] = useState(null);
  const [recentQueries, setRecentQueries] = useState([]);
  const [showAll, setShowAll] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState("");

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

  return (
    <div className="page-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <main className="page">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Synchronized Applications Recommender Knowledgebases Search</p>
            <h1>Don&apos;t know what site or app you need? Ask SARKSearch.</h1>
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

            <div className="support-grid">
              <section className="support-panel">
                <p className="panel-kicker">Popular starting points</p>
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
          </div>
        </section>

        <section className="workspace">
          <div className="results-column">
            <div className="section-heading">
              <div>
                <p className="panel-kicker">Recommendations</p>
                <h2>Suggested sites and apps for your goal</h2>
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
                          <div className="tool-mark" aria-hidden="true">
                            {tool.icon}
                          </div>
                          <div>
                            <h3>{tool.name}</h3>
                            <p className="result-meta">
                              {tool.category} | {tool.popularity}
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
      </main>
    </div>
  );
}

export default App;
