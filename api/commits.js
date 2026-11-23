/**
 * Sparse public commit tape for jacobmcgreen.
 *
 * Optional env:
 *   GITHUB_TOKEN — raises rate limit; public data works without it.
 *
 * Strategy: PushEvents first, then recent commits from recently-pushed public repos.
 * Responses are short-cached via Cache-Control + warm-instance memory.
 */

const USER = 'jacobmcgreen';
const LIMIT = 12;

let memory = { at: 0, payload: null };
const MEMORY_TTL_MS = 5 * 60_000;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function headers() {
  const h = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'jacobmcgreen-personalportfolio',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (process.env.GITHUB_TOKEN) {
    h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return h;
}

async function gh(path) {
  const response = await fetch(`https://api.github.com${path}`, { headers: headers() });
  if (response.status === 403 || response.status === 429) {
    const err = new Error('rate_limited');
    err.status = 429;
    throw err;
  }
  if (!response.ok) {
    const err = new Error(`github_${response.status}`);
    err.status = response.status;
    throw err;
  }
  return response.json();
}

function pushEventCommits(events) {
  const out = [];
  for (const event of events) {
    if (out.length >= LIMIT) break;
    if (event.type !== 'PushEvent') continue;
    const repo = event.repo?.name?.replace(`${USER}/`, '') || event.repo?.name || '';
    const commits = event.payload?.commits || [];
    for (let i = commits.length - 1; i >= 0; i -= 1) {
      if (out.length >= LIMIT) break;
      const c = commits[i];
      const message = String(c.message || '').split('\n')[0].trim().slice(0, 72);
      if (!message) continue;
      out.push({
        sha: String(c.sha || '').slice(0, 7),
        message,
        repo,
        url: c.url
          ? c.url.replace('api.github.com/repos', 'github.com').replace('/commits/', '/commit/')
          : `https://github.com/${event.repo?.name}`,
        at: event.created_at || null,
      });
    }
  }
  return out;
}

async function repoCommitsFallback(existing) {
  const seen = new Set(existing.map((c) => `${c.repo}:${c.sha}`));
  const out = [...existing];
  const repos = await gh(`/users/${USER}/repos?sort=pushed&direction=desc&per_page=6&type=owner`);
  if (!Array.isArray(repos)) return out;

  for (const repo of repos) {
    if (out.length >= LIMIT) break;
    if (repo.private || repo.fork) continue;
    const name = repo.name;
    let commits;
    try {
      commits = await gh(`/repos/${USER}/${name}/commits?per_page=4`);
    } catch (error) {
      if (error.status === 429) throw error;
      continue;
    }
    if (!Array.isArray(commits)) continue;
    for (const c of commits) {
      if (out.length >= LIMIT) break;
      const sha = String(c.sha || '').slice(0, 7);
      const key = `${name}:${sha}`;
      if (seen.has(key)) continue;
      const message = String(c.commit?.message || '').split('\n')[0].trim().slice(0, 72);
      if (!message) continue;
      seen.add(key);
      out.push({
        sha,
        message,
        repo: name,
        url: c.html_url || `https://github.com/${USER}/${name}/commit/${c.sha}`,
        at: c.commit?.author?.date || c.commit?.committer?.date || null,
      });
    }
  }

  out.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  return out.slice(0, LIMIT);
}

async function fetchCommits() {
  const now = Date.now();
  if (memory.payload && now - memory.at < MEMORY_TTL_MS) {
    return { commits: memory.payload, cached: true };
  }

  const events = await gh(`/users/${USER}/events/public?per_page=30`);
  let commits = pushEventCommits(Array.isArray(events) ? events : []);
  if (commits.length < LIMIT) {
    commits = await repoCommitsFallback(commits);
  }

  memory = { at: now, payload: commits };
  return { commits, cached: false };
}

module.exports = async function handler(req, res) {
  cors(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, OPTIONS');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'method_not_allowed' }));
    return;
  }

  try {
    const result = await fetchCommits();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Cache-Control',
      'public, s-maxage=300, stale-while-revalidate=900',
    );
    res.end(JSON.stringify(result));
  } catch (error) {
    const status = error.status === 429 ? 429 : 502;
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    res.end(JSON.stringify({
      commits: memory.payload || [],
      error: error.message || 'upstream_error',
    }));
  }
};
