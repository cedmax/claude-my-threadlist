#!/usr/bin/env node
// lastfm.mjs — read-only Last.fm tag lookup for the weekly-playlist skill
// Env: LASTFM_API_KEY
// Prints a single JSON object to stdout.

const API = `https://ws.audioscrobbler.com/2.0/`;
const { LASTFM_API_KEY } = process.env;

const fail = (message, extra = {}) => {
  console.log(JSON.stringify({ ok: false, error: message, ...extra }));
  process.exit(1);
};

if (!LASTFM_API_KEY) fail(`Missing env var: LASTFM_API_KEY`);

const call = async (method, params) => {
  const url = `${API}?${new URLSearchParams({
    method,
    api_key: LASTFM_API_KEY,
    format: `json`,
    autocorrect: `1`,
    ...params,
  })}`;
  const res = await fetch(url);
  const data = await res.json();
  return { ok: res.ok && !data.error, data };
};

// Top tags, most relevant first, ignoring near-zero weights
const topTags = (data) =>
  (data?.toptags?.tag ?? [])
    .filter((t) => Number(t.count) >= 10)
    .slice(0, 8)
    .map((t) => t.name.toLowerCase());

const tags = async (artist, track) => {
  if (track) {
    const { ok, data } = await call(`track.getTopTags`, { artist, track });
    const trackTags = ok ? topTags(data) : [];
    if (trackTags.length > 0) return { ok: true, artist, track, source: `track`, tags: trackTags };
  }

  const { ok, data } = await call(`artist.getTopTags`, { artist });
  if (!ok) return { ok: false, artist, track, error: data?.message ?? `Lookup failed`, tags: [] };
  return { ok: true, artist, track, source: `artist`, tags: topTags(data) };
};

const [command, artist, track] = process.argv.slice(2);

if (command !== `tags` || !artist) fail(`Usage: tags "<artist>" ["<track>"]`);

console.log(JSON.stringify(await tags(artist, track)));
