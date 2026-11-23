/**
 * Local static + API stand-in for visual QA.
 * Guestbook uses in-memory store. Commits proxy GitHub (optional GITHUB_TOKEN).
 * Usage: node scripts/dev-server.mjs
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const WORD_RE = /^[\p{L}\p{N}']{1,16}$/u;
const words = [];
const rates = new Map();

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' || Buffer.isBuffer(body)
    ? body
    : JSON.stringify(body);
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    ...headers,
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function clientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket.remoteAddress
    || 'local';
}

async function handleGuestbook(req, res) {
  if (req.method === 'OPTIONS') {
    send(res, 204, '', {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return;
  }

  if (req.method === 'GET') {
    send(res, 200, { words, storage: 'memory' }, {
      'Content-Type': 'application/json; charset=utf-8',
    });
    return;
  }

  if (req.method === 'POST') {
    const body = await readBody(req);
    const word = typeof body.word === 'string' ? body.word.trim().normalize('NFKC') : '';
    if (!WORD_RE.test(word) || /\s/.test(word)) {
      send(res, 400, { error: 'invalid_word' }, { 'Content-Type': 'application/json' });
      return;
    }

    const ip = clientIp(req);
    const now = Date.now();
    const bucket = rates.get(ip) || { count: 0, reset: now + 60_000 };
    if (now > bucket.reset) {
      bucket.count = 0;
      bucket.reset = now + 60_000;
    }
    bucket.count += 1;
    rates.set(ip, bucket);
    if (bucket.count > 3) {
      send(res, 429, { error: 'rate_limited' }, { 'Content-Type': 'application/json' });
      return;
    }

    words.unshift(word.slice(0, 16));
    if (words.length > 120) words.length = 120;
    send(res, 201, { word }, { 'Content-Type': 'application/json' });
    return;
  }

  send(res, 405, { error: 'method_not_allowed' }, { 'Content-Type': 'application/json' });
}

let commitCache = { at: 0, commits: [] };

async function handleCommits(req, res) {
  if (req.method === 'OPTIONS') {
    send(res, 204, '', { 'Access-Control-Allow-Methods': 'GET, OPTIONS' });
    return;
  }
  if (req.method !== 'GET') {
    send(res, 405, { error: 'method_not_allowed' }, { 'Content-Type': 'application/json' });
    return;
  }

  const now = Date.now();
  if (commitCache.commits.length && now - commitCache.at < 5 * 60_000) {
    send(res, 200, { commits: commitCache.commits, cached: true }, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60',
    });
    return;
  }

  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'jacobmcgreen-personalportfolio-dev',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  try {
    const gh = async (path) => {
      const response = await fetch(`https://api.github.com${path}`, { headers });
      if (!response.ok) {
        const err = new Error(`github_${response.status}`);
        err.status = response.status;
        throw err;
      }
      return response.json();
    };

    const events = await gh('/users/jacobmcgreen/events/public?per_page=30');
    const commits = [];
    const seen = new Set();

    for (const event of events) {
      if (commits.length >= 12) break;
      if (event.type !== 'PushEvent') continue;
      const repo = event.repo?.name?.replace('jacobmcgreen/', '') || '';
      for (const c of [...(event.payload?.commits || [])].reverse()) {
        if (commits.length >= 12) break;
        const message = String(c.message || '').split('\n')[0].trim().slice(0, 72);
        if (!message) continue;
        const sha = String(c.sha || '').slice(0, 7);
        seen.add(`${repo}:${sha}`);
        commits.push({
          sha,
          message,
          repo,
          url: c.url
            ? c.url.replace('api.github.com/repos', 'github.com').replace('/commits/', '/commit/')
            : `https://github.com/${event.repo?.name}`,
          at: event.created_at || null,
        });
      }
    }

    if (commits.length < 12) {
      const repos = await gh('/users/jacobmcgreen/repos?sort=pushed&direction=desc&per_page=6&type=owner');
      for (const repo of repos) {
        if (commits.length >= 12) break;
        if (repo.private || repo.fork) continue;
        let list;
        try {
          list = await gh(`/repos/jacobmcgreen/${repo.name}/commits?per_page=4`);
        } catch {
          continue;
        }
        for (const c of list) {
          if (commits.length >= 12) break;
          const sha = String(c.sha || '').slice(0, 7);
          const key = `${repo.name}:${sha}`;
          if (seen.has(key)) continue;
          const message = String(c.commit?.message || '').split('\n')[0].trim().slice(0, 72);
          if (!message) continue;
          seen.add(key);
          commits.push({
            sha,
            message,
            repo: repo.name,
            url: c.html_url || `https://github.com/jacobmcgreen/${repo.name}/commit/${c.sha}`,
            at: c.commit?.author?.date || null,
          });
        }
      }
      commits.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
    }

    const sliced = commits.slice(0, 12);
    commitCache = { at: now, commits: sliced };
    send(res, 200, { commits: sliced, cached: false }, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60',
    });
  } catch {
    send(res, 502, { commits: commitCache.commits, error: 'upstream_error' }, {
      'Content-Type': 'application/json',
    });
  }
}

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const clean = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(ROOT, clean);
  if (!full.startsWith(ROOT)) return null;
  return full;
}

const server = http.createServer(async (req, res) => {
  const url = req.url || '/';

  if (url.startsWith('/api/guestbook')) {
    await handleGuestbook(req, res);
    return;
  }
  if (url.startsWith('/api/commits')) {
    await handleCommits(req, res);
    return;
  }

  let filePath = safePath(url === '/' ? '/index.html' : url);
  if (!filePath) {
    send(res, 400, 'Bad request');
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    send(res, 404, 'Not found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const data = fs.readFileSync(filePath);
  send(res, 200, data, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`dev server http://127.0.0.1:${PORT}`);
});
