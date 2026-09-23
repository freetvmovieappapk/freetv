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

---

# App updates (APK hosting)

This repo is also the **update channel for the FreeTV Android app**. The app polls
`update.json` here, compares it against its own build number, and offers the user an update
from its Settings screen.

## Files

| Path | What it is |
|---|---|
| `update.json` | The manifest the app polls. Version, notes, and a SHA-256 + size per APK. |
| `apk/FreeTV-TV-<ver>.apk` | Build for TV boxes (onn 4K, Fire TV, Google TV). |
| `apk/FreeTV-Phone-<ver>.apk` | Build for phones/tablets. |
| `CHANGELOG.md` | One entry per released version. |
| `FreeTV.apk` | Always the newest build - the fixed link for a first install (see below). |

## First install, or a box still on 9.4 or older (no Update button yet)

Open this address once on the device (browser, or the "Downloader" app on a Fire TV) and install it:

    https://raw.githubusercontent.com/freetvmovieappapk/freetv/main/FreeTV.apk

Older boxes (Android 7.0 or older, older Fire TV sticks) cannot open that address - use:

    https://cdn.jsdelivr.net/gh/freetvmovieappapk/freetv@main/FreeTV.apk

It updates FreeTV in place (favourites and Continue Watching stay). From 9.5 on the app updates
itself: Settings -> App version.

The TV and Phone APKs are the **same universal build under two names** (the app detects a TV
vs a touch screen at runtime). Their SHA-256 is identical on purpose — that is not a bug, and
git stores the bytes once. The two names exist so it is obvious which file to hand to whom.

## update.json

```json
{
  "updatedUtc": "2026-09-23T00:00:00Z",
  "baseUrls": [
    "https://raw.githubusercontent.com/freetvmovieappapk/freetv/main/",
    "https://cdn.jsdelivr.net/gh/freetvmovieappapk/freetv@main/"
  ],
  "latest": {
    "versionCode": 13,
    "versionName": "9.4",
    "minSdkVersion": 21,
    "mandatory": false,
    "notes": "what changed",
    "tv":    { "file": "apk/FreeTV-TV-9.4.apk",    "size": 2110355, "sha256": "..." },
    "phone": { "file": "apk/FreeTV-Phone-9.4.apk", "size": 2110355, "sha256": "..." }
  }
}
```

**How a client should use it**

1. Fetch `update.json` from the **first** `baseUrls` entry (raw.githubusercontent), falling back
   to the second. Use raw first on purpose — see the caching note below.
2. Compare `latest.versionCode` with the installed `versionCode`. Greater means an update exists.
   Compare the **number**, never the display name: `"9.10"` sorts below `"9.4"` as text.
3. Refuse the update if `Build.VERSION.SDK_INT < latest.minSdkVersion`.
4. Pick `tv` or `phone` for the device, download `baseUrl + file`.
5. **Verify the SHA-256 before installing.** Reject on mismatch — a truncated download otherwise
   reaches the installer as a corrupt APK.
6. `mandatory: true` means do not offer a "later" option.

## Caching: read this before wondering why an update is invisible

jsDelivr caches a branch URL for **up to 12 hours**. raw.githubusercontent revalidates in about
5 minutes. That is why `update.json` is fetched from **raw first** — it is the lever that makes a
release visible promptly. jsDelivr stays as a fallback for when raw is blocked or rate-limited
(raw is rate-limited per IP for unauthenticated traffic).

## The signing rule that will bite you

Android only installs an update over an existing app when **both are signed by the same key**.
Every APK published here must be signed with `build\freetv.keystore` (alias `freetv`). A build
signed with a different key cannot update an installed FreeTV — the install fails with
`INSTALL_FAILED_UPDATE_INCOMPATIBLE` and the only fix is uninstalling, which wipes the user's
favourites and Continue Watching. Never rotate that keystore casually, and keep a backup of it:
losing it means no existing install can ever be updated again.

Installing an APK from inside the app also needs `REQUEST_INSTALL_PACKAGES` in the manifest, and
on Android 8+ the user grants "install unknown apps" to FreeTV once, at the first attempt.

## Publishing a new version

From the project root, after building (`tools\update-app.ps1 -NoInstall`):

```powershell
tools\publish-update.ps1 -Notes "What changed in this build" -Push
```

It reads the version from `app\apktool.yml`, copies the matching APKs out of `release\`,
recomputes every size and SHA-256 from the real bytes, rewrites `update.json`, prepends a
`CHANGELOG.md` entry, prunes APKs older than the last 3 versions, commits and pushes.

Hashes are always recomputed rather than typed, so the manifest cannot drift from what is
actually published. Add `-Mandatory` to force the update on clients.
