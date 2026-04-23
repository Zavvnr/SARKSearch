import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  API_BASE_URL,
  MAX_RESULT_LIMIT,
  NETWORK_RESULT_LIMIT,
  createAccount,
  fetchApplicationNetwork,
  fetchCurrentSession,
  fetchRecentSearches,
  loginWithPassword,
  logoutSession,
  searchTools,
  startGuestSession,
} from "./api";

const RESULT_BATCH_SIZE = 5;
const NETWORK_CENTER = { x: 590, y: 420 };
const NETWORK_RING_CAPACITIES = [8, 16, 26];
const NETWORK_RING_RADII = [145, 260, 370];
const GUIDE_FORMAT_LIMIT = 3;
const DEFAULT_GUIDE_FORMAT_IDS = ["pdf", "word", "docs"];
const STARTUP_SEARCH_PROMPT =
  "What are the most used apps? Make this like a tutorial for using the sites.";
const RECENT_SEARCH_LIMIT = 10;
const AUTH_TOKEN_STORAGE_KEY = "sarksearch-auth-token";
const GUEST_TOKEN_STORAGE_KEY = "sarksearch-guest-token";
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

const credits = [
  {
    name: "OpenAI",
    href: "https://openai.com/",
    detail: "LLM Brain recommendations",
  },
  {
    name: "MongoDB",
    href: "https://www.mongodb.com/",
    detail: "optional account persistence",
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

function createEmptyAuthForm() {
  return {
    name: "",
    email: "",
    password: "",
  };
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function sanitizeName(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 60);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? "").trim());
}

function buildRecentQueryList(value) {
  const queries = Array.isArray(value) ? value : [];
  const seen = new Set();
  const nextQueries = [];

  for (const item of queries) {
    const query = String(item ?? "").trim();
    const key = query.toLowerCase();

    if (!query || seen.has(key)) {
      continue;
    }

    seen.add(key);
    nextQueries.push(query);

    if (nextQueries.length >= RECENT_SEARCH_LIMIT) {
      break;
    }
  }

  return nextQueries;
}

function addRecentQuery(value, query) {
  return buildRecentQueryList([query, ...(Array.isArray(value) ? value : [])]);
}

function isUserSession(session) {
  return session?.kind === "user" && Boolean(session?.user?.email);
}

function maskEmail(value) {
  const normalized = normalizeEmail(value);
  const atIndex = normalized.indexOf("@");
  if (atIndex <= 0) {
    return "";
  }

  const localPart = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);
  const visibleLocal = localPart.slice(0, Math.min(2, localPart.length));
  return `${visibleLocal}${"*".repeat(Math.max(localPart.length - visibleLocal.length, 1))}@${domain}`;
}

function getSessionLabel(session) {
  if (isUserSession(session)) {
    return session.user.name || maskEmail(session.user.email);
  }

  return "Default guest";
}

function getSessionInitials(session) {
  if (!isUserSession(session)) {
    return "";
  }

  const source = String(session.user?.name || session.user?.email || "").trim();
  if (!source) {
    return "";
  }

  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function getStoredToken(storage, key) {
  if (typeof window === "undefined" || !storage) {
    return "";
  }

  return String(storage.getItem(key) ?? "").trim();
}

function getStoredUserToken() {
  return typeof window === "undefined" ? "" : getStoredToken(window.localStorage, AUTH_TOKEN_STORAGE_KEY);
}

function getStoredGuestToken() {
  return typeof window === "undefined" ? "" : getStoredToken(window.sessionStorage, GUEST_TOKEN_STORAGE_KEY);
}

function persistSessionToken(token, session) {
  if (typeof window === "undefined") {
    return;
  }

  if (isUserSession(session)) {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    window.sessionStorage.removeItem(GUEST_TOKEN_STORAGE_KEY);
    return;
  }

  window.sessionStorage.setItem(GUEST_TOKEN_STORAGE_KEY, token);
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

function clearStoredUserToken() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

function clearStoredGuestToken() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(GUEST_TOKEN_STORAGE_KEY);
}

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

function AccountMenu({
  session,
  authForm,
  canSubmitLogin,
  canSubmitSignup,
  isPending,
  error,
  onChangeMode,
  onFieldChange,
  onSubmitLogin,
  onSubmitSignup,
  onStartGuest,
}) {
  const [openPanel, setOpenPanel] = useState("");
  const menuRef = useRef(null);
  const isUser = isUserSession(session);
  const maskedEmail = maskEmail(session?.user?.email);
  const initials = getSessionInitials(session);
  const isMenuOpen = openPanel === "menu";
  const isPopoverOpen = openPanel === "login" || openPanel === "signup";
  const isLoginOpen = openPanel === "login";
  const popoverTitleId = isLoginOpen ? "login-popover-title" : "signup-popover-title";

  useEffect(() => {
    if (!openPanel) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (!menuRef.current?.contains(event.target)) {
        setOpenPanel("");
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setOpenPanel("");
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openPanel]);

  useEffect(() => {
    setOpenPanel("");
  }, [session?.kind, session?.user?.id]);

  function handleMenuToggle() {
    setOpenPanel((current) => (current ? "" : "menu"));
  }

  function handleOpenForm(nextMode) {
    onChangeMode(nextMode);
    setOpenPanel(nextMode);
  }

  async function handleGuestAction() {
    await onStartGuest();
    setOpenPanel("");
  }

  return (
    <div className="account-menu" ref={menuRef}>
      <button
        type="button"
        className={`account-menu-button${openPanel ? " is-active" : ""}`}
        onClick={handleMenuToggle}
        aria-expanded={Boolean(openPanel)}
        aria-label={isUser ? `Open account menu for ${getSessionLabel(session)}` : "Open account menu"}
      >
        <span className={`account-avatar${initials ? " has-initials" : ""}`} aria-hidden="true">
          {initials ? (
            <span className="account-avatar-text">{initials}</span>
          ) : (
            <svg viewBox="0 0 24 24" className="account-avatar-icon">
              <path d="M12 12.2a4.1 4.1 0 1 0-4.1-4.1 4.1 4.1 0 0 0 4.1 4.1Z" />
              <path d="M4.8 19.2a7.5 7.5 0 0 1 14.4 0" />
            </svg>
          )}
        </span>
      </button>

      {isMenuOpen ? (
        <div className="account-popover account-popover-menu" role="menu" aria-label="Account options">
          <p className="panel-kicker">Account</p>
          {isUser ? (
            <>
              <div className="account-menu-summary">
                <strong className="account-menu-name">{session?.user?.name || "Signed-in user"}</strong>
                {maskedEmail ? <span className="account-menu-email">{maskedEmail}</span> : null}
              </div>
              <button
                type="button"
                className="account-menu-item"
                onClick={handleGuestAction}
                disabled={isPending}
                role="menuitem"
              >
                Use default guest
              </button>
            </>
          ) : (
            <>
              <p className="account-menu-copy">Choose an option to save searches and keep your account history.</p>
              <div className="account-menu-list">
                <button
                  type="button"
                  className="account-menu-item"
                  onClick={() => handleOpenForm("login")}
                  disabled={isPending}
                  role="menuitem"
                >
                  Log in
                </button>
                <button
                  type="button"
                  className="account-menu-item"
                  onClick={() => handleOpenForm("signup")}
                  disabled={isPending}
                  role="menuitem"
                >
                  Create account
                </button>
              </div>
            </>
          )}
          {error ? <p className="auth-error-text auth-error-inline">{error}</p> : null}
        </div>
      ) : null}

      {isPopoverOpen ? (
        <div className="account-popover auth-popover" role="dialog" aria-modal="false" aria-labelledby={popoverTitleId}>
          <div className="auth-popover-header">
            <button type="button" className="account-popover-back" onClick={() => setOpenPanel("menu")}>
              Back
            </button>
            <button
              type="button"
              className="auth-popover-close"
              onClick={() => setOpenPanel("")}
              aria-label="Close account pop-up"
            >
              Close
            </button>
          </div>
          <p className="panel-kicker">{isLoginOpen ? "Saved account" : "New account"}</p>
          <h3 className="auth-popover-title" id={popoverTitleId}>
            {isLoginOpen ? "Log in" : "Create account"}
          </h3>
          <p className="auth-popover-copy">
            {isLoginOpen
              ? "Use your email and password to continue with your saved backend search history."
              : "Use any email and a password with at least 8 characters to start saving searches."}
          </p>

          {isLoginOpen ? (
            <form className="account-form" onSubmit={onSubmitLogin}>
              <label htmlFor="login-email">Log in with email and password</label>
              <div className="auth-fields">
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={authForm.email}
                  placeholder="you@example.com"
                  onChange={(event) => onFieldChange("email", event.target.value)}
                />
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={authForm.password}
                  placeholder="Password"
                  onChange={(event) => onFieldChange("password", event.target.value)}
                />
              </div>
              <div className="auth-submit-row">
                <button type="submit" className="auth-submit-button" disabled={!canSubmitLogin || isPending}>
                  {isPending ? "Logging in..." : "Log in"}
                </button>
              </div>
            </form>
          ) : (
            <form className="account-form" onSubmit={onSubmitSignup}>
              <label htmlFor="signup-name">Create account</label>
              <div className="auth-fields">
                <input
                  id="signup-name"
                  type="text"
                  autoComplete="name"
                  value={authForm.name}
                  placeholder="Name (optional)"
                  onChange={(event) => onFieldChange("name", event.target.value)}
                />
                <input
                  id="signup-email"
                  type="email"
                  autoComplete="email"
                  value={authForm.email}
                  placeholder="you@example.com"
                  onChange={(event) => onFieldChange("email", event.target.value)}
                />
                <input
                  id="signup-password"
                  type="password"
                  autoComplete="new-password"
                  value={authForm.password}
                  placeholder="At least 8 characters"
                  onChange={(event) => onFieldChange("password", event.target.value)}
                />
              </div>
              <div className="auth-submit-row">
                <button type="submit" className="auth-submit-button" disabled={!canSubmitSignup || isPending}>
                  {isPending ? "Creating..." : "Create account"}
                </button>
              </div>
            </form>
          )}

          {error ? <p className="auth-error-text">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function App() {
  const [query, setQuery] = useState("");
  const [resultsState, setResultsState] = useState(null);
  const [recentQueries, setRecentQueries] = useState([]);
  const [authState, setAuthState] = useState({
    status: "loading",
    token: "",
    session: null,
  });
  const [authForm, setAuthForm] = useState(createEmptyAuthForm);
  const [authError, setAuthError] = useState("");
  const [isAuthPending, setIsAuthPending] = useState(false);
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
  const sessionTokenRef = useRef("");

  const deferredQuery = useDeferredValue(query);
  const normalizedDeferredQuery = deferredQuery.trim().toLowerCase();
  const visiblePrompts = !normalizedDeferredQuery
    ? guidedPrompts
    : guidedPrompts.filter((prompt) => prompt.toLowerCase().includes(normalizedDeferredQuery)).slice(0, 5);
  const isSessionReady = authState.status === "ready" && Boolean(authState.token && authState.session?.id);
  const guestMode = !isUserSession(authState.session);
  const canSubmitLogin = isValidEmail(authForm.email) && authForm.password.length >= 8;
  const canSubmitSignup = isValidEmail(authForm.email) && authForm.password.length >= 8;

  useEffect(() => {
    sessionTokenRef.current = authState.token;
  }, [authState.token]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("sarksearch-theme", theme);
  }, [theme]);

  function resetSearchExperience(options = {}) {
    const clearQuery = options.clearQuery === true;

    setRecentQueries([]);
    setResultsState(null);
    setError("");
    setResultsNotice("");
    setNetworkState(null);
    setIsNetworkVisible(false);
    setIsNetworkLoading(false);
    setNetworkError("");
    setSelectedNetworkTool(null);
    setHasMoreResults(true);
    setIsPending(false);
    setIsSearchingMore(false);

    if (clearQuery) {
      setQuery("");
      userTouchedQueryRef.current = false;
    }
  }

  function applySession(token, session, options = {}) {
    persistSessionToken(token, session);
    setAuthState({
      status: "ready",
      token,
      session,
    });
    setAuthError("");
    setAuthForm(createEmptyAuthForm());

    if (options.resetWorkspace === true) {
      resetSearchExperience({ clearQuery: true });
    }
  }

  function retireSession(previousToken, nextToken) {
    if (!previousToken || previousToken === nextToken) {
      return;
    }

    void logoutSession(previousToken).catch(() => {});
  }

  useEffect(() => {
    let isActive = true;

    const restoreSession = async () => {
      const storedUserToken = getStoredUserToken();
      if (storedUserToken) {
        try {
          const payload = await fetchCurrentSession(storedUserToken);
          if (!isActive) {
            return;
          }

          applySession(storedUserToken, payload.session);
          return;
        } catch (_error) {
          clearStoredUserToken();
        }
      }

      const storedGuestToken = getStoredGuestToken();
      if (storedGuestToken) {
        try {
          const payload = await fetchCurrentSession(storedGuestToken);
          if (!isActive) {
            return;
          }

          applySession(storedGuestToken, payload.session);
          return;
        } catch (_error) {
          clearStoredGuestToken();
        }
      }

      try {
        const payload = await startGuestSession();
        if (!isActive) {
          return;
        }

        applySession(payload.token, payload.session);
      } catch (requestError) {
        if (!isActive) {
          return;
        }

        setAuthError(requestError.message);
        setAuthState({
          status: "ready",
          token: "",
          session: null,
        });
      }
    };

    void restoreSession();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    if (!isSessionReady) {
      setRecentQueries([]);
      return () => {
        isActive = false;
      };
    }

    setRecentQueries([]);

    fetchRecentSearches(authState.token)
      .then((payload) => {
        if (isActive) {
          setRecentQueries(buildRecentQueryList(payload.sessions ?? []));
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
  }, [authState.token, authState.session?.id, isSessionReady]);

  async function runSearch(nextQuery, options = {}) {
    const normalized = nextQuery.trim();
    const isAutomatic = options.isAutomatic === true;
    const shouldStoreRecent = !isAutomatic && options.skipRecent !== true;

    if (!isSessionReady) {
      setError("SARKSearch is still starting your session. Try again in a moment.");
      return;
    }

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
        sessionToken: authState.token,
        skipSessionSave: options.skipSessionSave === true || !shouldStoreRecent,
      });
      const initialResults = mergeUniqueResults([], payload.results ?? []).slice(0, MAX_RESULT_LIMIT);

      startTransition(() => {
        setResultsState({
          ...payload,
          results: initialResults,
        });

        if (shouldStoreRecent) {
          setRecentQueries((current) => addRecentQuery(current, payload.query));
        }
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsPending(false);
    }
  }

  useEffect(() => {
    if (!isSessionReady || hasStartedInitialSearch) {
      return;
    }

    hasStartedInitialSearch = true;
    let isActive = true;

    const warmSearch = async () => {
      try {
        await searchTools(STARTUP_SEARCH_PROMPT, {
          limit: RESULT_BATCH_SIZE,
          sessionToken: authState.token,
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
  }, [authState.token, isSessionReady]);

  async function runSearchMore() {
    const currentResults = resultsState?.results ?? [];
    const normalized = String(resultsState?.query ?? query).trim();

    if (!isSessionReady) {
      setError("SARKSearch is still starting your session. Try again in a moment.");
      return;
    }

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
        sessionToken: authState.token,
        excludeResults: currentResults.map(toSearchExclusion),
        skipSessionSave: true,
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

    if (!isSessionReady) {
      setNetworkError("SARKSearch is still starting your session. Try again in a moment.");
      return;
    }

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
      const payload = await fetchApplicationNetwork(normalized, {
        limit: NETWORK_RESULT_LIMIT,
        sessionToken: authState.token,
      });
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

  function handleAuthFieldChange(field, value) {
    setAuthForm((current) => ({
      ...current,
      [field]: field === "email" ? value.toLowerCase() : value,
    }));
  }

  function handleAuthModeChange(nextMode) {
    setAuthError("");
    setAuthForm((current) => ({
      ...current,
      password: "",
    }));
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();

    if (!canSubmitLogin) {
      setAuthError("Enter a valid email and a password with at least 8 characters.");
      return;
    }

    const previousToken = sessionTokenRef.current;
    setIsAuthPending(true);
    setAuthError("");

    try {
      const payload = await loginWithPassword({
        email: normalizeEmail(authForm.email),
        password: authForm.password,
      });

      applySession(payload.token, payload.session, { resetWorkspace: true });
      retireSession(previousToken, payload.token);
    } catch (requestError) {
      setAuthError(requestError.message);
      setAuthForm((current) => ({
        ...current,
        password: "",
      }));
    } finally {
      setIsAuthPending(false);
    }
  }

  async function handleSignupSubmit(event) {
    event.preventDefault();

    if (!canSubmitSignup) {
      setAuthError("Enter a valid email and a password with at least 8 characters.");
      return;
    }

    const previousToken = sessionTokenRef.current;
    setIsAuthPending(true);
    setAuthError("");

    try {
      const payload = await createAccount({
        name: sanitizeName(authForm.name),
        email: normalizeEmail(authForm.email),
        password: authForm.password,
      });

      applySession(payload.token, payload.session, { resetWorkspace: true });
      retireSession(previousToken, payload.token);
    } catch (requestError) {
      setAuthError(requestError.message);
      setAuthForm((current) => ({
        ...current,
        password: "",
      }));
    } finally {
      setIsAuthPending(false);
    }
  }

  async function handleUseGuest() {
    const previousToken = sessionTokenRef.current;
    setIsAuthPending(true);
    setAuthError("");

    try {
      const payload = await startGuestSession();
      applySession(payload.token, payload.session, { resetWorkspace: true });
      retireSession(previousToken, payload.token);
    } catch (requestError) {
      setAuthError(requestError.message);
    } finally {
      setIsAuthPending(false);
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

              <div className="hero-controls">
                <AccountMenu
                  session={authState.session}
                  authForm={authForm}
                  canSubmitLogin={canSubmitLogin}
                  canSubmitSignup={canSubmitSignup}
                  isPending={isAuthPending || authState.status === "loading"}
                  error={authError}
                  onChangeMode={handleAuthModeChange}
                  onFieldChange={handleAuthFieldChange}
                  onSubmitLogin={handleLoginSubmit}
                  onSubmitSignup={handleSignupSubmit}
                  onStartGuest={handleUseGuest}
                />

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
                disabled={!isSessionReady}
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
                <button type="submit" disabled={!isSessionReady || isPending || isSearchingMore}>
                  {authState.status === "loading"
                    ? "Starting session..."
                    : isPending
                      ? "Searching..."
                      : "Search SARKSearch"}
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
                    disabled={!isSessionReady || isNetworkLoading || isPending}
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
                    disabled={!isSessionReady || isSearchingMore || isPending}
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
                <p className="account-note recent-note">
                  {guestMode
                    ? "Default guest history resets when you start or restart the guest session."
                    : `${getSessionLabel(authState.session)} keeps the latest ${RECENT_SEARCH_LIMIT} searches.`}
                </p>
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
              <p className="empty-copy">
                {guestMode
                  ? "Guest recent searches stay empty until you search in this guest session."
                  : "This account will show up to 10 recent searches after the first one."}
              </p>
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
