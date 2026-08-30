# freetv

Player, channel list and configuration for FreeTV. This repo is the **mutable half** of
the site: the domain hosts a small shell that almost never changes, and everything that
does change lives here and is delivered over [jsDelivr](https://www.jsdelivr.com/).

Push to `main` and it goes live. No host access, no app rebuild.

## Files

| File | What it is |
|---|---|
| `config.json` | The control panel. Ad settings, asset paths, cache version. |
| `freetv-ads.js` | VAST ad-break client — fetches the ad, plays it, returns to the stream. |
| `player.js` | The player. Must expose `FreeTVPlayer.mount(root, cfg)`. *(not yet added)* |
| `channels.json` | The channel list. *(not yet added)* |
| `movies.json` | On-demand catalogue. *(not yet added)* |

## How a change reaches viewers

1. Edit a file, commit, push to `main`.
2. **Bump `assetVersion` in `config.json`** in the same push.
3. Live within a few minutes.

Step 2 is not optional. jsDelivr caches a branch URL for **up to 12 hours**, so without a
new `assetVersion` viewers keep the old `player.js` or `channels.json` for half a day.
`config.json` itself is fetched from raw.githubusercontent.com first precisely so it stays
fresh — it is the lever that busts everything else.

## Turning ads on

Ads stay completely off until all three of these are true, so the site can be built and
submitted for approval before any ad code runs:

```json
"ads": { "enabled": true, "vastTag": "https://…" }
```

Set `vastTag` to the Video VAST zone URL from the ad network dashboard, flip `enabled`,
bump `assetVersion`, push.

## Settings worth understanding before changing

- **`midRollMinutes`** — gap between ad breaks. Broadcast-normal is 8–15. Below 5 and
  people uninstall.
- **`idleMinutes`** — stop requesting ads after this long with no remote input. People
  leave TV apps running in empty rooms; billing an empty room is the pattern that gets
  publisher accounts terminated. Do not raise this casually.
- **`maxBreaksPerHour`** — hard ceiling regardless of session length.

## Repo visibility

This repo is public because jsDelivr only serves public repositories. That is a deliberate
trade: free global CDN delivery in exchange for the channel list being visible.
