# FreeTV changelog

## 10.9 (build 25) - 2026-10-28

10.9 - Source button now sits on the main player bar (replaced Settings, which is on the main menu) and shows on everything - movies, shows, anime. Pick Source 1/2/3 and switch any time; a bad pick always falls back to a working stream.

## 10.8 (build 24) - 2026-10-28

10.8 - Live Sports now pulls in a second provider (ppv.st) for the SAME game, so the Source picker has real backup feeds when the first ones are flaky. Matched strictly by both team names.

## 10.7 (build 23) - 2026-10-28

10.7 - source button simply labeled 'Source'.

## 10.6 (build 22) - 2026-10-28

10.6 - Change source: movies & shows now have a source picker, pick Source 1 / Source 2 / Source 3 (with quality) and switch any time if one is bad. Plus the 200+ cdnlivetv channels from 10.5.

## 10.5 (build 21) - 2026-10-28

10.5 - new Live TV: 200+ extra channels (cdnlivetv) that stream clean/ad-free via on-device sniffing. MovieBox hide-unavailable + English dubs + freeze recovery carried over from 10.4.

## 10.4 (build 20) - 2026-10-11

Weak/hotel Wi-Fi: videos that froze on a loading spinner now reconnect automatically and resume when the connection recovers, instead of hanging forever. Also fixes some anime (e.g. Dragon Ball Z) that showed 'no source found' - the app now falls back to an available version - and prefers the English dub when one exists.

## 10.3 (build 19) - 2026-10-11

Fixes anime/movies (e.g. some Dragon Ball episodes) that would freeze or stop part-way through on the TV box. MovieBox videos now stream directly so the player handles long episodes reliably, instead of going through the local relay which could stall on slower devices.

## 10.2 (build 18) - 2026-10-11

Anime now plays in English when a MovieBox English version exists - Dragon Ball and others were defaulting to the original (e.g. Japanese) audio. The app now always prefers the English dub.

## 10.1 (build 17) - 2026-10-11

Dragon Ball and many more anime and movies now play, via an added MovieBox video source (used when the usual source doesn't carry a title). Titles that nothing can play are now hidden instead of showing 'Unavailable'. Fixed a startup issue that could make on-demand titles fail to load right after opening the app.

## 10.0 (build 16) - 2026-10-04

A fresh, easier-to-use design: a side menu you can always reach, bigger text, and your favorites and shows-in-progress right on the home screen. The phone app now works sideways, and search shows which titles can't be played for free.

## 9.6 (build 15) - 2026-09-23

Settings - App version: the app now updates itself from GitHub (checks once a day, green dot when a new version is ready, never installs without OK; a one-time Allow step the first time). About 4,100 whole Pluto TV series with season and episode pickers, Next episode and resume; about 8,500 Pluto films; Pluto anime series in the Anime tab. Casting a Pluto channel no longer sends the taken-down screen. Many playback and remote fixes.

## 9.4 (build 13) - 2026-09-23

Live Sports: the provider's 'remove sandbox' card is no longer shown - the embed runs hidden behind a 'Finding a stream' panel while the native sniffer grabs the HLS, and is only revealed if every feed fails. Sports API calls are now batched 4 at a time so the tab stops getting rate-limited. 30-second auto full screen, on by default with a Settings toggle. TV series get a season/episode picker instead of being stuck on S1E1.

