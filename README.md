# claude-my-threadlist

A Claude Code skill that turns a weekly Slack thread of YouTube links into an ordered YouTube playlist.

Two scheduled runs:

- **Open** (e.g. 9 a.m.): posts a thread in a Slack channel asking for one song each.
- **Collect** (e.g. 3 p.m.): reads the replies, keeps one usable song per person, skips rickrolls, orders the tracks so they play well together (Claude's own knowledge, plus Last.fm tags if you add a key), builds a playlist on your YouTube channel and replies with the link.

Everything runs as [Claude Code routines](https://claude.ai/code/routines) in Anthropic's cloud. No servers to host.

## Repo layout

```
.claude/skills/weekly-playlist/
  SKILL.md       # the skill: open and collect modes
  youtube.mjs    # YouTube Data API client (info, find, create, add, publish)
  lastfm.mjs     # Last.fm tag lookup (optional)
scripts/
  get-refresh-token.mjs   # one-off: mints the YouTube refresh token
index.md, PRIVACY.md      # homepage and privacy policy for the Google consent screen
```

No dependencies. Node 18+ (built-in `fetch`).

## Setup

You'll create your own Google project, YouTube channel and keys. Nothing is shared with anyone else's setup.

### 1. Fork the repo and turn on GitHub Pages

Fork this repo, then in **Settings → Pages** deploy from `main`, folder `/ (root)`. Your pages will be at:

- Homepage: `https://<you>.github.io/claude-my-threadlist/`
- Privacy policy: `https://<you>.github.io/claude-my-threadlist/PRIVACY`

Google needs both before it lets you publish the app (step 3). Edit the contact line in `PRIVACY.md` to point at your fork.

### 2. Create a bot Google account and its channel

Create a new Google account that does nothing but own the playlists. If the token ever leaks, this is all that's exposed.

Signed in as the bot, create a YouTube channel **on the bot's own account** (avatar → Create a channel). Don't use a brand account (see Gotchas). Then add your own account in **YouTube Studio → Settings → Permissions** if you want to manage the playlists yourself.

### 3. Set up the Google Cloud project

Signed in as the bot, in the [Google Cloud console](https://console.cloud.google.com/):

1. Create a project and enable **YouTube Data API v3**.
2. **Google Auth Platform → Branding:** app name, support email (the bot), homepage and privacy policy URLs from step 1, and `<you>.github.io` under authorised domains. Skip the logo; it triggers brand verification.
3. **Audience:** user type **External**, then **Publish app** so it's **In production**.
4. **Data access:** add only the `https://www.googleapis.com/auth/youtube` scope.
5. **Clients → Create client:** type **Desktop app**. Copy the client ID and client secret.

Ignore the verification warnings. You don't need Google's review for an app only the bot signs in to.

### 4. Get the refresh token

On your own machine:

```bash
YT_CLIENT_ID=… YT_CLIENT_SECRET=… node scripts/get-refresh-token.mjs
```

Open the URL it prints, sign in **as the bot**, and click **Advanced → Go to … (unsafe)** on the "Google hasn't verified this app" screen. It prints `YT_REFRESH_TOKEN=…`.

### 5. (Optional) Get a Last.fm API key

Last.fm tags help order lesser-known tracks. Without a key, the skill orders them on Claude's knowledge alone. To use it, create an API account at [last.fm/api/account/create](https://www.last.fm/api/account/create) and copy the **API key** (not the shared secret).

### 6. Create the cloud environment

At [claude.ai/code](https://claude.ai/code), create an environment with these variables:

| Variable | Required | Default | What it does |
| --- | --- | --- | --- |
| `YT_CLIENT_ID` | yes | – | OAuth client ID, from step 3 |
| `YT_CLIENT_SECRET` | yes | – | OAuth client secret, from step 3 |
| `YT_REFRESH_TOKEN` | yes | – | the bot channel's refresh token, from step 4 |
| `SLACK_CHANNEL_ID` | yes | – | ID of the Slack channel the thread goes in |
| `PLAYLIST_NAME` | yes | – | name used in the thread's first line and the playlist title, e.g. `Team Songs` → "Team Songs – week of 9 November 2026" |
| `PLAYLIST_DEADLINE` | no | none | text shown as "Links close at …" in the opening message, used exactly as written, e.g. `3 p.m. today (London time)`; leave it out and that sentence is dropped |
| `PLAYLIST_TIMEZONE` | no | `Europe/London` | IANA time zone for the date in the thread and playlist title, e.g. `America/New_York` |
| `PLAYLIST_WINDOW_HOURS` | no | `28` | how many hours back collect looks for the opening thread |
| `LASTFM_API_KEY` | no | none | Last.fm API key, from step 5; without it, tracks are ordered on Claude's knowledge alone |

The skill stops and says so if a required variable is missing.

Example:

```
PLAYLIST_NAME=Team Songs
PLAYLIST_DEADLINE=3 p.m. today (London time)
PLAYLIST_TIMEZONE=Europe/London
PLAYLIST_WINDOW_HOURS=28
```

And allow these domains in its network access:

- `oauth2.googleapis.com`
- `www.googleapis.com`
- `ws.audioscrobbler.com` (only if you set `LASTFM_API_KEY`)

Slack goes through the connector, so it needs no allowlist entry.

### 7. Create the two routines

Both use your fork, the environment from step 6, and the **Slack** connector.

| Routine | Schedule | Prompt |
| --- | --- | --- |
| Open | your day, 9:00 | `Run the weekly-playlist skill in "open" mode.` |
| Collect | same day, 15:00 | `Run the weekly-playlist skill in "collect" mode.` |

Set the trigger time zone to yours, not UTC, and make `PLAYLIST_TIMEZONE` match it. Collect only looks back `PLAYLIST_WINDOW_HOURS` (28 by default), so it has to run within that many hours of open: raise it if you leave the thread open longer, e.g. `72` to open on Monday and collect on Wednesday. Make `PLAYLIST_DEADLINE` match the collect time.

### 8. Test

Run the open routine once by hand, post a couple of links in the thread, then run collect.

## Customising

The name, channel, deadline, time zone and look-back window come from the environment. The wording of the opening message and the reply is in the **Mode: open** and **Mode: collect** sections of `SKILL.md`; change it in your fork. Keep the playlist reply marker (`🎧 This week's playlist:`) as it is: the duplicate check relies on it.

## How it behaves

- **One song each:** each person's first usable link counts. If it's unavailable, a rickroll, or already picked by someone else, their next link is used.
- **Safe to re-run:** playlists are created private and only made public once every video is in. A run that stops part-way is picked up by the next one, and a thread that already has a playlist reply is skipped.
- **Posts as you:** the Slack connector acts as your account, so messages end with "This is an automated message."
- **Data:** only playlist titles and video IDs go to YouTube; only artist and track names go to Last.fm, and only if it's configured. No Slack text or names leave the run.

## Gotchas

- **`Error 403: org_internal`**: the app's audience is Internal. Switch it to External.
- **`Error 403: access_denied`**: the app is still in Testing. Publish it. Don't just add test users: refresh tokens from a Testing app expire after 7 days.
- **Publish app is greyed out**: the Branding page is missing the homepage, privacy policy or support email.
- **`channels?mine=true` returns nothing**: the token isn't tied to a channel. This happens with brand-account channels, which often don't appear at consent. Use a channel on the bot's own account and re-run the token script.
- **"Host not in allowlist"**: a domain from step 6 is missing from the environment's network access.

## Quota

The YouTube Data API's default quota is 10,000 units a day. Adding a video costs 50, so about 190 songs a day, which is plenty for a weekly thread.
