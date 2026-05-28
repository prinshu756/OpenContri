'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const parseRepoInput = (value) => {
  const text = String(value || '').trim();

  if (!text) {
    return null;
  }

  const cleaned = text.replace(/^https?:\/\//, '').replace(/\.git$/, '').replace(/\/+$/, '');
  const match = cleaned.match(/^(?:github\.com\/)?([^\/]+)\/([^\/]+)(?:\/.*)?$/i);

  if (!match) {
    return null;
  }

  return `${match[1].toLowerCase()}/${match[2].toLowerCase()}`;
};

const formatRepoName = (repo) => repo?.replace('/', ' / ') || '';

const formatDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleDateString();
};

const badgeClass = (label) => {
  const text = String(label || '').toLowerCase();
  if (text.includes('bug')) return 'badge bug';
  if (text.includes('feature') || text.includes('enhancement')) return 'badge feature';
  if (text.includes('urgent') || text.includes('critical')) return 'badge urgent';
  return 'badge soft';
};

const getStorageKey = (repo) => `opencontri:${repo}:known`; 
const getWatchlistKey = () => 'opencontri:watchlist';

export default function Home() {
  const [repoInput, setRepoInput] = useState('');
  const [selectedRepo, setSelectedRepo] = useState('');
  const [repoData, setRepoData] = useState(null);
  const [issues, setIssues] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [toast, setToast] = useState(null);
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState(null);

  const loadWatchlist = useCallback(() => {
    try {
      const saved = window.localStorage.getItem(getWatchlistKey());
      const parsed = saved ? JSON.parse(saved) : [];
      setWatchlist(Array.isArray(parsed) ? parsed : []);
    } catch {
      setWatchlist([]);
    }
  }, []);

  const saveWatchlist = useCallback((list) => {
    setWatchlist(list);
    window.localStorage.setItem(getWatchlistKey(), JSON.stringify(list));
  }, []);

  const saveKnownIssueNumbers = useCallback((repo, issueNumbers) => {
    window.localStorage.setItem(getStorageKey(repo), JSON.stringify(issueNumbers));
  }, []);

  const loadKnownIssueNumbers = useCallback((repo) => {
    try {
      const saved = window.localStorage.getItem(getStorageKey(repo));
      const parsed = saved ? JSON.parse(saved) : [];
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  }, []);

  const showBrowserNotification = useCallback((repo, freshIssues) => {
    if (typeof window === 'undefined' || typeof window.Notification === 'undefined') {
      return;
    }

    if (window.Notification.permission === 'granted') {
      new window.Notification(`New issue opened in ${repo}`, {
        body: freshIssues.slice(0, 3).map((issue) => `#${issue.number} ${issue.title}`).join('\n'),
        tag: `opencontri-${repo}`,
      });
      return;
    }

    if (window.Notification.permission === 'default') {
      window.Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          new window.Notification(`New issue opened in ${repo}`, {
            body: freshIssues.slice(0, 3).map((issue) => `#${issue.number} ${issue.title}`).join('\n'),
            tag: `opencontri-${repo}`,
          });
        }
      }).catch(() => {});
    }
  }, []);

  const fetchRepoIssues = useCallback(async (repo) => {
    if (!repo) return;
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/issues?repo=${encodeURIComponent(repo)}`);
      const rawBody = await response.text();

      let data;
      try {
        data = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        throw new Error('The repository API returned invalid data. Refresh the app and try again.');
      }

      if (!response.ok) {
        throw new Error(data.error || 'Unable to fetch repository data');
      }

      const priorKnown = loadKnownIssueNumbers(repo);
      const issuesPayload = data.issues || [];
      const detectedNewIssues = issuesPayload.filter((issue) => !priorKnown.has(issue.number));

      setRepoData(data.repo);
      setIssues(issuesPayload);
      setLastRefresh(new Date().toISOString());

      if (priorKnown.size > 0 && detectedNewIssues.length > 0) {
        const notificationEntry = {
          id: `${repo}:${Date.now()}`,
          repo,
          issues: detectedNewIssues,
        };

        setNotifications((current) => [notificationEntry, ...current]);
        setToast({
          id: notificationEntry.id,
          repo,
          issues: detectedNewIssues,
        });
        showBrowserNotification(repo, detectedNewIssues);
      }

      saveKnownIssueNumbers(repo, issuesPayload.map((issue) => issue.number));
    } catch (err) {
      setError(err.message || 'Failed to load issues.');
    } finally {
      setLoading(false);
    }
  }, [loadKnownIssueNumbers, saveKnownIssueNumbers, showBrowserNotification]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    loadWatchlist();
  }, [loadWatchlist]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!selectedRepo) return;
    fetchRepoIssues(selectedRepo);
  }, [fetchRepoIssues, selectedRepo]);

  useEffect(() => {
    if (!selectedRepo) return;
    const timer = setInterval(() => fetchRepoIssues(selectedRepo), 30000);
    return () => clearInterval(timer);
  }, [fetchRepoIssues, selectedRepo]);

  const handleRepoSubmit = async (event) => {
    event.preventDefault();
    const repo = parseRepoInput(repoInput);

    if (!repo) {
      setError('Enter a valid GitHub repository link or owner/repo string.');
      return;
    }

    setSelectedRepo(repo);
    setRepoInput('');
    setError('');

    const nextWatchlist = [repo, ...watchlist.filter((item) => item !== repo)].slice(0, 8);
    saveWatchlist(nextWatchlist);
    await fetchRepoIssues(repo);
  };

  const handleWatchSelect = async (repo) => {
    setSelectedRepo(repo);
    setError('');
    await fetchRepoIssues(repo);
  };

  const clearNotifications = () => setNotifications([]);

  const issueCount = issues.length;
  const repoLabel = repoData ? repoData.full_name : selectedRepo;
  const newNotifications = useMemo(() => notifications.flatMap((entry) => entry.issues), [notifications]);

  return (
    <>
      <div className="toast-layer" aria-live="polite">
        {toast && (
          <div className="issue-toast" role="status">
            <div className="toast-header">
              <div>
                <strong>New issue opened</strong>
                <span>{toast.repo}</span>
              </div>
              <button className="toast-dismiss" type="button" onClick={() => setToast(null)}>Dismiss</button>
            </div>
            <p>{toast.issues.length} new open issue{toast.issues.length === 1 ? '' : 's'} detected for this repository.</p>
            <ul className="toast-issues">
              {toast.issues.slice(0, 3).map((issue) => (
                <li key={`${issue.number}-${issue.title}`} className="toast-issue">
                  <a href={issue.url} target="_blank" rel="noreferrer">#{issue.number} {issue.title}</a>
                  <span className="status-pill">Open</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <main className="page-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <span className="eyebrow">OpenContri</span>
          <h1>Track GitHub repos instantly.</h1>
          <p>Paste any repository link or “owner/repo” value, and watch open issues, activity, and live notifications from a modern dashboard.</p>
          <form className="repo-form" onSubmit={handleRepoSubmit}>
            <label className="field-label" htmlFor="repo-input">Paste GitHub repo link</label>
            <div className="input-row">
              <input
                id="repo-input"
                value={repoInput}
                onChange={(event) => setRepoInput(event.target.value)}
                placeholder="https://github.com/vercel/next.js or vercel/next.js"
                autoComplete="off"
                disabled={loading}
              />
              <button type="submit" className="button primary" disabled={loading}>
                {loading ? 'Loading…' : 'Track repo'}
              </button>
            </div>
          </form>
          <div className="hero-notes">
            <span>{selectedRepo ? `Tracking: ${repoLabel}` : 'Add a repo to begin tracking open issues.'}</span>
            <span>Auto-refresh every 30 seconds while active.</span>
          </div>
        </div>

        <div className="hero-stats">
          <div className="stat-card warm">
            <span className="stat-title">Live watchlist</span>
            <strong>{watchlist.length}</strong>
            <p>Recently tracked repositories that you can open again with one click.</p>
          </div>
          <div className="stat-card cool">
            <span className="stat-title">New notifications</span>
            <strong>{newNotifications.length}</strong>
            <p>Opened issues detected since the last repo refresh.</p>
          </div>
          <div className="stat-card soft-shadow">
            <span className="stat-title">Open issues</span>
            <strong>{issueCount}</strong>
            <p>Current open issues for the selected repository.</p>
          </div>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="panel card">
          <div className="panel-header">
            <div>
              <p className="panel-label">Repository</p>
              <h2>{repoData ? repoData.full_name : selectedRepo || 'No repository selected'}</h2>
            </div>
            <div className="repo-badges">
              {repoData && <span className="pill">Stars {repoData.stargazers_count}</span>}
              {repoData && <span className="pill secondary">Open {issueCount}</span>}
            </div>
          </div>
          <p className="panel-copy">{repoData?.description || 'Track any GitHub repo to surface open issues and recent notifications in one place.'}</p>
          <div className="repo-meta-grid">
            <div>
              <span className="meta-label">Owner</span>
              <p>{repoData?.owner?.login || '—'}</p>
            </div>
            <div>
              <span className="meta-label">Primary visibility</span>
              <p>{repoData?.private ? 'Private' : 'Public'}</p>
            </div>
            <div>
              <span className="meta-label">Last refreshed</span>
              <p>{lastRefresh ? formatDate(lastRefresh) : 'Waiting...'}</p>
            </div>
          </div>
          {error && <div className="alert">{error}</div>}
        </div>

        <div className="panel card sidebar-panel">
          <div className="panel-header">
            <div>
              <p className="panel-label">Watchlist</p>
              <h2>Saved repos</h2>
            </div>
            <button className="button small" onClick={() => saveWatchlist([])}>Clear</button>
          </div>
          <div className="watchlist">
            {watchlist.length === 0 ? (
              <p className="empty-state">Add repos to your watchlist to quickly switch contexts.</p>
            ) : (
              watchlist.map((repo) => (
                <button key={repo} className="repo-chip" onClick={() => handleWatchSelect(repo)}>
                  {repo}
                </button>
              ))
            )}
          </div>
          <div className="panel-section">
            <p className="section-label">Notifications</p>
            <div className="notifications-summary">
              <p>{newNotifications.length} new open issue{newNotifications.length === 1 ? '' : 's'}</p>
              <button className="button small secondary" onClick={clearNotifications}>Dismiss</button>
            </div>
            {newNotifications.length === 0 ? (
              <p className="empty-state">No fresh open issues since your last fetch.</p>
            ) : (
              newNotifications.slice(0, 4).map((issue) => (
                <a key={`${issue.repo || selectedRepo}:${issue.number}`} className="notification-row" href={issue.url} target="_blank" rel="noreferrer">
                  <span>#{issue.number}</span>
                  <strong>{issue.title}</strong>
                </a>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="issues-panel card">
        <div className="panel-header">
          <div>
            <p className="panel-label">Open issues</p>
            <h2>{issueCount} issue{issueCount === 1 ? '' : 's'} now open</h2>
          </div>
          <button className="button secondary" onClick={() => selectedRepo && fetchRepoIssues(selectedRepo)} disabled={!selectedRepo || loading}>
            Refresh
          </button>
        </div>

        {issues.length === 0 ? (
          <div className="empty-state large">No open issues loaded. Track a repo to see live issue cards.</div>
        ) : (
          <div className="issues-grid">
            {issues.map((issue) => (
              <article key={issue.number} className="issue-card">
                <div className="issue-top">
                  <div>
                    <a href={issue.url} target="_blank" rel="noreferrer" className="issue-link">#{issue.number} {issue.title}</a>
                    <p className="issue-subtitle">Opened by {issue.author || 'unknown'} · {formatDate(issue.created_at)}</p>
                  </div>
                  <span className="status-pill">Open</span>
                </div>
                <p className="issue-body">{issue.body ? issue.body.slice(0, 180) + (issue.body.length > 180 ? '…' : '') : 'No description available.'}</p>
                <div className="issue-footer">
                  <div className="badge-row">
                    {(issue.labels || []).slice(0, 3).map((label) => (
                      <span key={label} className={badgeClass(label)}>{label}</span>
                    ))}
                  </div>
                  <div className="issue-meta-small">
                    <span>{issue.comments} comments</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
    </>
  );
}
