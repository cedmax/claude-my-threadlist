#!/usr/bin/env node
// youtube.mjs — minimal YouTube Data API v3 client for the weekly-playlist skill
// Env: YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN
// Every command prints a single JSON object to stdout.

const API = `https://www.googleapis.com/youtube/v3`;

const { YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN } = process.env;

const fail = (message, extra = {}) => {
  console.log(JSON.stringify({ ok: false, error: message, ...extra }));
  process.exit(1);
};

if (!YT_CLIENT_ID || !YT_CLIENT_SECRET || !YT_REFRESH_TOKEN) {
  fail(`Missing env vars: YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN`);
}

const getAccessToken = async () => {
  const res = await fetch(`https://oauth2.googleapis.com/token`, {
    method: `POST`,
    headers: { 'Content-Type': `application/x-www-form-urlencoded` },
    body: new URLSearchParams({
      client_id: YT_CLIENT_ID,
      client_secret: YT_CLIENT_SECRET,
      refresh_token: YT_REFRESH_TOKEN,
      grant_type: `refresh_token`,
    }),
  });
  const data = await res.json();
  if (!res.ok) fail(`Token refresh failed`, { details: data });
  return data.access_token;
};

const request = async (token, method, path, body) => {
  const res = await fetch(`${API}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': `application/json` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
};

const playlistUrl = (id) => `https://www.youtube.com/playlist?list=${id}`;

// All pages of a list endpoint
const listAll = async (token, path) => {
  const items = [];
  let pageToken = ``;
  do {
    const sep = path.includes(`?`) ? `&` : `?`;
    const page = pageToken ? `&pageToken=${pageToken}` : ``;
    const { ok, data } = await request(token, `GET`, `${path}${sep}maxResults=50${page}`);
    if (!ok) fail(`List request failed: ${path}`, { details: data });
    items.push(...(data.items ?? []));
    pageToken = data.nextPageToken ?? ``;
  } while (pageToken);
  return items;
};

// Known rickroll uploads, plus a title check for re-uploads and remasters
const RICKROLL_IDS = new Set([`dQw4w9WgXcQ`]);
const RICKROLL_TITLE = /never\s*gonna\s*give\s*you\s*up/i;

const isRickroll = ({ videoId, title }) => RICKROLL_IDS.has(videoId) || RICKROLL_TITLE.test(title);

// Titles and availability for up to any number of video IDs (1 unit per 50)
const info = async (token, videoIds) => {
  const found = new Map();
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50).join(`,`);
    const { ok, data } = await request(token, `GET`, `videos?part=snippet,status&id=${batch}`);
    if (!ok) fail(`Video lookup failed`, { details: data });
    for (const v of data.items ?? []) {
      found.set(v.id, {
        videoId: v.id,
        title: v.snippet.title,
        channel: v.snippet.channelTitle,
        privacy: v.status.privacyStatus,
        embeddable: v.status.embeddable,
      });
    }
  }
  const available = videoIds.filter((id) => found.has(id) && found.get(id).privacy !== `private`);
  const rickrolls = available.filter((id) => isRickroll(found.get(id)));
  const kept = available.filter((id) => !rickrolls.includes(id));
  return {
    ok: true,
    videos: kept.map((id) => found.get(id)),
    unavailable: videoIds.filter((id) => !available.includes(id)),
    rickrolls,
  };
};

// Find a playlist on this channel by exact title
const find = async (token, title) => {
  const playlists = await listAll(token, `playlists?part=snippet,status&mine=true`);
  const match = playlists.find((p) => p.snippet.title === title);
  if (!match) return { ok: true, found: false };
  return {
    ok: true,
    found: true,
    playlistId: match.id,
    privacy: match.status.privacyStatus,
    url: playlistUrl(match.id),
  };
};

const create = async (token, title, description = ``) => {
  const { ok, data } = await request(token, `POST`, `playlists?part=snippet,status`, {
    snippet: { title, description },
    status: { privacyStatus: `private` },
  });
  if (!ok) fail(`Playlist creation failed`, { details: data });
  return { ok: true, playlistId: data.id, privacy: `private`, url: playlistUrl(data.id) };
};

const existingItems = async (token, playlistId) => {
  const items = await listAll(token, `playlistItems?part=snippet&playlistId=${playlistId}`);
  return items.map((i) => i.snippet.resourceId.videoId);
};

// Appends videos in the given order, skipping any already in the playlist
const add = async (token, playlistId, videoIds) => {
  const existing = await existingItems(token, playlistId);
  const added = [];
  const skipped = [];
  const failed = [];
  let position = existing.length;

  for (const videoId of videoIds) {
    if (existing.includes(videoId)) {
      skipped.push(videoId);
      continue;
    }
    const { ok, status, data } = await request(token, `POST`, `playlistItems?part=snippet`, {
      snippet: {
        playlistId,
        position,
        resourceId: { kind: `youtube#video`, videoId },
      },
    });
    if (ok) {
      added.push({ videoId, position });
      position += 1;
    } else {
      failed.push({ videoId, status, reason: data?.error?.message ?? `unknown` });
    }
  }

  return { ok: failed.length === 0, playlistId, url: playlistUrl(playlistId), added, skipped, failed };
};

const publish = async (token, playlistId) => {
  const { ok: found, data: current } = await request(
    token,
    `GET`,
    `playlists?part=snippet,status&id=${playlistId}`,
  );
  const playlist = current?.items?.[0];
  if (!found || !playlist) fail(`Playlist not found: ${playlistId}`, { details: current });

  const { ok, data } = await request(token, `PUT`, `playlists?part=snippet,status`, {
    id: playlistId,
    snippet: { title: playlist.snippet.title, description: playlist.snippet.description },
    status: { privacyStatus: `public` },
  });
  if (!ok) fail(`Publishing failed`, { details: data });
  return { ok: true, playlistId, privacy: `public`, url: playlistUrl(playlistId) };
};

const usage = `Commands:
  info <videoId> [videoId ...]
  find "<title>"
  create "<title>" ["<description>"]
  add <playlistId> <videoId> [videoId ...]
  publish <playlistId>`;

const [command, ...args] = process.argv.slice(2);
if (!command) fail(usage);

const token = await getAccessToken();
const out = (result) => console.log(JSON.stringify(result));

switch (command) {
  case `info`:
    if (args.length === 0) fail(usage);
    out(await info(token, args));
    break;
  case `find`:
    if (!args[0]) fail(usage);
    out(await find(token, args[0]));
    break;
  case `create`:
    if (!args[0]) fail(usage);
    out(await create(token, args[0], args[1]));
    break;
  case `add`:
    if (!args[0] || args.length < 2) fail(usage);
    out(await add(token, args[0], args.slice(1)));
    break;
  case `publish`:
    if (!args[0]) fail(usage);
    out(await publish(token, args[0]));
    break;
  default:
    fail(`Unknown command "${command}".\n${usage}`);
}
