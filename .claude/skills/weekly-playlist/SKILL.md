---
name: weekly-playlist
description: Opens a weekly songs thread in Slack, and later collects the YouTube links posted in it into an ordered YouTube playlist. Run with mode "open" or "collect"; the channel, name, deadline, time zone and look-back window come from environment variables.
---

# Weekly playlist

## Config
Read these first with `echo "$SLACK_CHANNEL_ID | $PLAYLIST_NAME | $PLAYLIST_DEADLINE | $PLAYLIST_TIMEZONE | $PLAYLIST_WINDOW_HOURS"`:
- Slack channel: the channel ID in `SLACK_CHANNEL_ID`. If it's empty, stop and say so.
- NAME: the value of `PLAYLIST_NAME` (e.g. `Team Songs`). If it's empty, stop and say so.
- DEADLINE: the value of `PLAYLIST_DEADLINE`, used as written (e.g. `3 p.m. today (London time)`). Optional.
- TIMEZONE: the IANA time zone in `PLAYLIST_TIMEZONE` (e.g. `America/New_York`). If it's empty, use `Europe/London`. All dates and times, including "today", are in this zone. Get the current local date with `TZ="${PLAYLIST_TIMEZONE:-Europe/London}" date +"%-d %B %Y"`.
- WINDOW: the number of hours in `PLAYLIST_WINDOW_HOURS`. If it's empty or not a positive number, use `28`.
- Thread marker (first line of the opening message, never change): `{NAME} – week of {DATE}`
- DATE format: D MMMM YYYY (e.g. 9 November 2026), the date in TIMEZONE when the thread is opened.
- Playlist title: `{NAME} – week of {DATE}`, the same DATE as the thread.
- Playlist reply marker (first line of the bot's reply, never change): `🎧 This week's playlist:`
- YouTube script: `node .claude/skills/weekly-playlist/youtube.mjs <command> …` (run from the repo root). Every command prints one JSON object; check `ok` before continuing.

## Mode: open
1. Post a new top-level message in the channel. The first line must be exactly the thread marker with today's date.
2. Below it, add the description for the team (editable):
   "Reply in this thread with a YouTube link to a song you'd like on this week's playlist, one song each. Links close at {DEADLINE}."
   If DEADLINE is empty, leave out the "Links close at" sentence.
3. End the message with the line: "_This is an automated message._"
4. Stop. Don't post anything else.

## Mode: collect
1. **Find the thread.** Look for a top-level message in the channel that:
   - was posted in the last WINDOW hours,
   - was posted by the account this Slack connection acts as (the same account that posts in "open" mode), and
   - has a first line starting with `{NAME} – week of`.
   If there are several, use the most recent. If there are none, stop without posting anything.
   Take DATE from the marker line itself.
2. **Check for duplicates.** If any reply in that thread was posted by the same account and starts with the playlist reply marker, stop without doing anything.
3. **Collect links.** Read every reply in the thread (not the opening message). Extract all YouTube video links: `youtube.com/watch?v=`, `youtu.be/`, `music.youtube.com/watch?v=`, `youtube.com/shorts/`. Take the 11-character video ID from each, and ignore anything that isn't a video link, including playlist links.
   Keep every link for now, in posting order, noting who posted each one. Track who posted what only for the one-song-per-person rule in step 5: never pass names to the scripts.
4. If there are no video IDs, reply in the thread with the reply marker followed by "no songs this week." and stop.
5. **Look the videos up.** Run `info <id> <id> …` with every distinct ID from step 3. Videos listed under `unavailable` are private, deleted or invalid: leave them out and remember them for the reply.
   **Spot rickrolls.** Using each video's title and channel, judge whether it's a rickroll: any upload of Rick Astley's "Never Gonna Give You Up" (the original is `dQw4w9WgXcQ`, but remasters, re-uploads, covers, lyric videos, live versions and abbreviations like "NGGYU" count too), or a video whose title or channel makes it obvious it's that song in disguise. Treat rickrolls as discarded: never add them, even if someone insists in the thread, and remember how many there were for the reply. Other Rick Astley songs are fine. When it's genuinely unclear, give the benefit of the doubt and keep it.
   **Then apply one song per person (max one each):** going through the links in posting order, give each person the first of their links that is usable: not unavailable, not a rickroll, and not a song already picked for someone earlier. If their first link is discarded, fall back to their next one, and so on. Once a person has a song, ignore any further links from them and count those as extras for the reply. Someone with no usable link gets nothing. The result is the final list of video IDs for the next steps. If it's empty, reply as in step 4 and stop.
6. **Order the tracks.** From each video's title and channel, work out artist and track. Last.fm is optional: check whether it's configured with `[ -n "$LASTFM_API_KEY" ] && echo yes || echo no`.
   - If yes, for each track run `node .claude/skills/weekly-playlist/lastfm.mjs tags "<artist>" "<track>"` (it falls back to artist tags when the track has none). If a lookup fails, carry on without tags for that track.
   - If no, skip the lookups entirely and don't mention it in the reply.
   Using the tags (if any) plus your own knowledge of the songs, order them so they play well together: group similar genres and moods, build the energy up and then down, and don't put two songs by the same artist back to back. If a track can't be identified, place it where it seems to fit and don't drop it.
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
    - if any rickrolls were skipped, one line: "Nice try: {n} rickroll(s) skipped."
    - if any extra links were ignored, one line: "One song each: {n} extra link(s) skipped."
    - a one-line tip: "On Tidal or Spotify? Paste the playlist link into TuneMyMusic."
    - last line: "_This is an automated message._"
    The same last line goes on the "no songs this week" reply in step 4.

## Rules
- Never create a playlist without a matching thread from the last WINDOW hours.
- Never post more than one reply per run.
- If anything fails before step 9, leave the playlist private, don't reply in the thread, and report the error in your final output. The next run picks up the private playlist.
- Only send playlist titles and video IDs to the YouTube script. Never send message text or user names.
