#!/usr/bin/env node
// get-refresh-token.mjs — one-off: prints a refresh token for the YouTube scope
// Env: YT_CLIENT_ID, YT_CLIENT_SECRET

import http from 'node:http';
import { randomBytes } from 'node:crypto';

const { YT_CLIENT_ID, YT_CLIENT_SECRET } = process.env;
if (!YT_CLIENT_ID || !YT_CLIENT_SECRET) {
  console.error(`Missing env vars: YT_CLIENT_ID, YT_CLIENT_SECRET`);
  process.exit(1);
}

const PORT = 53682;
const REDIRECT_URI = `http://127.0.0.1:${PORT}`;
const SCOPE = `https://www.googleapis.com/auth/youtube`;
const state = randomBytes(16).toString(`hex`);

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
  client_id: YT_CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  response_type: `code`,
  scope: SCOPE,
  access_type: `offline`,
  prompt: `consent`,
  state,
})}`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get(`code`);

  if (url.searchParams.get(`state`) !== state || !code) {
    res.end(`Invalid response. Check the terminal.`);
    console.error(`Bad callback: ${url.search}`);
    return;
  }

  const tokenRes = await fetch(`https://oauth2.googleapis.com/token`, {
    method: `POST`,
    headers: { 'Content-Type': `application/x-www-form-urlencoded` },
    body: new URLSearchParams({
      client_id: YT_CLIENT_ID,
      client_secret: YT_CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT_URI,
      grant_type: `authorization_code`,
    }),
  });
  const data = await tokenRes.json();

  if (!tokenRes.ok || !data.refresh_token) {
    res.end(`Token exchange failed. Check the terminal.`);
    console.error(JSON.stringify(data, null, 2));
  } else {
    res.end(`Done. You can close this tab.`);
    console.log(`\nYT_REFRESH_TOKEN=${data.refresh_token}\n`);
  }
  server.close();
});

server.listen(PORT, `127.0.0.1`, () => {
  console.log(`Open this URL in a browser:\n\n${authUrl}\n`);
});
