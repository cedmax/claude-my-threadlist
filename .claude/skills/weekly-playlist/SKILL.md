---
name: weekly-playlist
description: Opens the weekly D2C songs thread in Slack, and later collects the YouTube links posted in it into an ordered YouTube playlist. Run with mode "open" or "collect"; the Slack channel ID comes from the SLACK_CHANNEL_ID environment variable.
---

# Weekly D2C playlist

## Config
- Slack channel: the channel ID in the `SLACK_CHANNEL_ID` environment variable (read it with `echo "$SLACK_CHANNEL_ID"`). If it's empty, stop and say so.
- Time zone: all dates and times are Europe/London.
- Thread marker (first line of the opening message, never change): `D2C Songs – week of {DATE}`
- DATE format: D MMMM YYYY (e.g. 9 November 2026), the London date the thread is opened.
- Playlist title: `D2C Songs – week of {DATE}`, the same DATE as the thread.
- Playlist reply marker (first line of the bot's reply, never change): `🎧 This week's playlist:`
- YouTube script: `node .claude/skills/weekly-playlist/youtube.mjs <command> …` (run from the repo root). Every command prints one JSON object; check `ok` before continuing.

## Mode: open
1. Post a new top-level message in the channel. The first line must be exactly the thread marker with today's date.
2. Below it, add the description for the team (editable):
   "Reply in this thread with a YouTube link to a song you'd like on this week's playlist. Links close at 3 p.m. today (London time)."
3. End the message with the line: "_This is an automated message._"
4. Stop. Don't post anything else.

## Mode: collect
1. **Find the thread.** Look for a top-level message in the channel that:
   - was posted in the last 28 hours,
   - was posted by the account this Slack connection acts as (the same account that posts in "open" mode), and
   - has a first line starting with `D2C Songs – week of`.
   If there are several, use the most recent. If there are none, stop without posting anything.
   Take DATE from the marker line itself.
2. **Check for duplicates.** If any reply in that thread was posted by the same account and starts with the playlist reply marker, stop without doing anything.
3. **Collect links.** Read every reply in the thread (not the opening message). Extract all YouTube video links: `youtube.com/watch?v=`, `youtu.be/`, `music.youtube.com/watch?v=`, `youtube.com/shorts/`. Take the 11-character video ID from each, drop duplicates (keep the first), and ignore anything that isn't a video link, including playlist links.
4. If there are no video IDs, reply in the thread with the reply marker followed by "no songs this week." and stop.
5. **Look the videos up.** Run `info <id> <id> …`. Videos listed under `unavailable` are private, deleted or invalid: leave them out and remember them for the reply.
6. **Order the tracks.** From each video's title and channel, work out artist and track. Fetch Last.fm tags for each track (or the artist, if the track has none). Using the tags plus your own knowledge of the songs, order them so they play well together: group similar genres and moods, build the energy up and then down, and don't put two songs by the same artist back to back. If a track can't be identified, place it where it seems to fit and don't drop it.
7. **Get the playlist.** Run `find "<title>"`.
   - Found and `public`: the playlist was finished on an earlier run but the reply never got posted. Skip to step 10.
   - Found and `private`: an earlier run stopped part-way. Reuse it; `add` skips videos already in it.
   - Not found: run `create "<title>"`. It is created private.
8. **Add the videos.** Run `add <playlistId> <id> <id> …` with the IDs in the chosen order. Note anything in `failed`.
9. **Publish.** Only if step 8 finished, run `publish <playlistId>`. If `add` reported failures, publish anyway; the failed ones go in the reply.
10. **Reply in the thread** with:
    - first line: the reply marker followed by the playlist link
    - the track order (Artist – Title)
    - any links that were unavailable or failed to add
    - a one-line tip: "On Tidal or Spotify? Paste the playlist link into TuneMyMusic."
    - last line: "_This is an automated message._"
    The same last line goes on the "no songs this week" reply in step 4.

## Rules
- Never create a playlist without a matching thread from the last 28 hours.
- Never post more than one reply per run.
- If anything fails before step 9, leave the playlist private, don't reply in the thread, and report the error in your final output. The next run picks up the private playlist.
- Only send playlist titles and video IDs to the YouTube script. Never send message text or user names.
