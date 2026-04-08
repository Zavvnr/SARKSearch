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
  "Beginner-friendly recommendations",
  "Popularity-weighted ranking",
  "Starter PDFs for first-time users",
];

function App() {
  const [query, setQuery] = useState(guidedPrompts[0]);
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
            <h1>SARKSearch turns vague goals into useful tools you can start today.</h1>
            <p className="hero-text">
              Type what you want to do in plain English. The agent pipeline will translate it into a
              ranked shortlist of tools, explain the fit, and hand you a first-step PDF for each one.
            </p>

            <div className="highlight-row" aria-label="Product highlights">
              {brandHighlights.map((item) => (
                <span key={item} className="highlight-pill">
                  {item}
                </span>
              ))}
            </div>

            <form
              className="search-panel"
              onSubmit={(event) => {
                event.preventDefault();
                runSearch(query);
              }}
            >
              <label className="search-label" htmlFor="query">
                What are you trying to do?
              </label>
              <textarea
                id="query"
                value={query}
                rows={3}
                placeholder="I want to get a job, but I don't know where to start."
                onChange={(event) => setQuery(event.target.value)}
              />
              <div className="search-actions">
                <button type="submit" disabled={isPending}>
                  {isPending ? "Thinking..." : "Find my tools"}
                </button>
                <span className="subtle-copy">Top results are ranked by fit, then popularity.</span>
              </div>
            </form>

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

            {error ? <p className="error-text">{error}</p> : null}
          </div>

          <div className="hero-panel">
            <div className="panel-title-row">
              <p className="panel-kicker">Agent pipeline</p>
              <span className="panel-status">Live</span>
            </div>
            <ol className="pipeline-list">
              <li>Specification agent translates the user goal into structured intent.</li>
              <li>Architecture agent builds a search and ranking plan.</li>
              <li>Implementation agent assembles and scores tool matches.</li>
              <li>Evaluation agent checks confidence and retries when coverage is weak.</li>
            </ol>
            <div className="hero-grid">
              <article>
                <span>40</span>
                <p>Curated tools</p>
              </article>
              <article>
                <span>5</span>
                <p>Primary results</p>
              </article>
              <article>
                <span>PDF</span>
                <p>Starter guide per tool</p>
              </article>
              <article>
                <span>TTL</span>
                <p>Node cache for repeated searches</p>
              </article>
            </div>
          </div>
        </section>

        <section className="workspace">
          <div className="results-column">
            <div className="section-heading">
              <div>
                <p className="panel-kicker">Recommendations</p>
                <h2>Ranked tools for the goal in front of you</h2>
              </div>
              {resultsState?.meta ? (
                <p className="meta-pill">
                  Cache: {resultsState.meta.cache} | Persistence: {resultsState.meta.persistenceMode}
                </p>
              ) : null}
            </div>

            {!resultsState ? (
              <div className="empty-state">
                <p>Start with a guided prompt or describe your goal in your own words.</p>
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

          <aside className="inspector">
            <section className="inspector-panel">
              <div className="section-heading">
                <div>
                  <p className="panel-kicker">Why these matches</p>
                  <h2>Agent trace</h2>
                </div>
              </div>

              {resultsState?.agentTrace?.length ? (
                <ol className="trace-list">
                  {resultsState.agentTrace.map((item) => (
                    <li key={`${item.agent}-${item.detail}`}>
                      <div className="trace-head">
                        <strong>{item.agent}</strong>
                        <span>{item.status}</span>
                      </div>
                      <p>{item.detail}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="empty-copy">Run a search to see how the recommendation engine reasoned about it.</p>
              )}
            </section>

            <section className="inspector-panel">
              <div className="section-heading">
                <div>
                  <p className="panel-kicker">Momentum</p>
                  <h2>Recent searches</h2>
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
                <p className="empty-copy">Your latest search terms will appear here after the first run.</p>
              )}
            </section>
          </aside>
        </section>
      </main>
    </div>
  );
}

export default App;
