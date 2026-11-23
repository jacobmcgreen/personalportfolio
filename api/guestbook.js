/**
 * One-word guestbook — Vercel serverless + Upstash Redis (Vercel KV).
 *
 * Env (required for durable writes on production):
 *   KV_REST_API_URL
 *   KV_REST_API_TOKEN
 *
 * Without KV, GET returns [] and POST returns 503 so the page stays quiet.
 */

const WORDS_KEY = 'guestbook:words';
const RATE_PREFIX = 'guestbook:rate:';
const MAX_WORDS = 120;
const MAX_LEN = 16;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 3;

const WORD_RE = /^[\p{L}\p{N}']{1,16}$/u;

const BLOCK = new Set([
  'fuck', 'shit', 'ass', 'bitch', 'cunt', 'nigger', 'nigga', 'fag', 'faggot',
  'rape', 'nazi', 'hitler', 'kill', 'suicide',
]);

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function kvConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function kv(command, args = []) {
  const base = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const response = await fetch(`${base}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([command, ...args]),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`KV ${command} failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.result;
}

function clientKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = typeof forwarded === 'string'
    ? forwarded.split(',')[0].trim()
    : req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
  return `${RATE_PREFIX}${ip}`;
}

function normalizeWord(raw) {
  if (typeof raw !== 'string') return null;
  const word = raw.trim().normalize('NFKC');
  if (!WORD_RE.test(word)) return null;
  if (word.includes(' ')) return null;
  const lower = word.toLowerCase();
  if (BLOCK.has(lower)) return null;
  return word.slice(0, MAX_LEN);
}

module.exports = async function handler(req, res) {
  cors(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60');

    if (!kvConfigured()) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ words: [], storage: 'unconfigured' }));
      return;
    }

    try {
      const raw = await kv('LRANGE', [WORDS_KEY, 0, MAX_WORDS - 1]);
      const words = Array.isArray(raw) ? raw : [];
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ words, storage: 'kv' }));
    } catch (error) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'storage_unavailable' }));
    }
    return;
  }

  if (req.method === 'POST') {
    if (!kvConfigured()) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: 'storage_unconfigured',
        hint: 'Set KV_REST_API_URL and KV_REST_API_TOKEN on Vercel',
      }));
      return;
    }

    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }
    if (!body || typeof body !== 'object') body = {};

    const word = normalizeWord(body.word);
    if (!word) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'invalid_word' }));
      return;
    }

    try {
      const rateKey = clientKey(req);
      const count = Number(await kv('INCR', [rateKey])) || 0;
      if (count === 1) {
        await kv('PEXPIRE', [rateKey, RATE_WINDOW_MS]);
      }
      if (count > RATE_MAX) {
        res.statusCode = 429;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'rate_limited' }));
        return;
      }

      await kv('LPUSH', [WORDS_KEY, word]);
      await kv('LTRIM', [WORDS_KEY, 0, MAX_WORDS - 1]);

      res.statusCode = 201;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ word }));
    } catch (error) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'storage_unavailable' }));
    }
    return;
  }

  res.statusCode = 405;
  res.setHeader('Allow', 'GET, POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'method_not_allowed' }));
};
