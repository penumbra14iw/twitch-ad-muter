# Twitch detector investigation (2026-11-11)

## Scope and observed page

Inspected `https://www.twitch.tv/shroud` in the available browser session. The page exposed a `<video>` element and `data-a-target` values `video-player` and `video-ref`. The player reported a media-open error and no source URL. No ad label, ad transition, or returning-live event was present. The session therefore supplied no real ad sample.

This is one page observation, not evidence that the same DOM appears during an ad, in every locale, or for every Twitch player variant.

## Findings by confidence

| Category | Finding | Use |
|---|---|---|
| Reliable for player presence only | A video element was present; the inspected page used `data-a-target="video-player"` and `data-a-target="video-ref"`. | Find and diagnose the player. These do not identify ads. |
| Partially reliable | Twitch's public embedded-player API documents `PLAY`, `PLAYING`, `PAUSE`, `ONLINE`, and `OFFLINE`. | Playback/channel state only. The documented event list does not expose an ad-start or ad-end event. Do not classify an ad from these events. |
| Observed once; further validation pending | Exact player-scoped Portuguese phrases `Deixar feedback sobre este anúncio` and `Saiba mais sobre este anúncio`. | One user-confirmed ad-to-live cycle supports using only these exact phrases for tab audio control. Broader normal-live, duration, consecutive-ad, and locale coverage remains pending. |
| Experimental | Generic ad wording (`Anúncio`, `Publicidade`, `Ad break`, `Ad N of N`, `Advertisement`). | Logged as low-confidence diagnostic evidence only; never controls audio. |
| Not suitable for viewer-side muting | EventSub `channel.ad_break.begin`. | The official reference describes a broadcaster's requested break and explicitly warns of delay before viewers see ads. It is not a viewer player-state signal. |
| Do not use | Paused/buffering/playback events, quality changes, timers, video dimensions, or disappearance of a candidate by themselves. | They are not specific to advertising and can occur during normal viewing. |

## Stability and background behavior

The public player API documents general playback events only. The inspected page's `data-a-target` values identify the player but are not ad indicators; Twitch may change its client DOM at any time. No stable public native-player ad DOM contract was found in the official documentation reviewed. The diagnostic content script uses a scoped `MutationObserver` and does not branch on `document.visibilityState`; this establishes only that the code does not intentionally stop when hidden. It does not prove that Twitch or Chrome will keep delivering page mutations while minimized or suspended.

## Validation status

Two user-provided ad-associated observations are available. At 15:20:41, the player-scoped DOM text included `Deixar feedback sobre este anúncio`, `Anúncio`, and `Saiba mais sobre este anúncio`; the detector cleared the candidate at 15:20:59. In a later capture, `Saiba mais sobre este anúncio` appeared at 15:25:51 and cleared at 15:26:20. The user reports that this phrase appears only during an ad, and confirms the live transmission returned when the phrase cleared in the later cycle. This is one real, user-confirmed ad-to-live cycle for the specific phrase. It does not establish behavior across other ads, durations, locales, or all normal-playback states. The 18- and 29-second spans measure label visibility, not necessarily the complete ad duration. Both screenshots show the older generic detector rule (`localized-ad-label`); version 0.2.0 recognizes the full phrase as a high-confidence control signal.

Real ad detection: **one user-confirmed start/return cycle; broader validation pending**. Real return-to-live detection: **one phrase disappearance coincident with confirmed live return; more cycles required**. Background/minimized behavior: **pending**. No accuracy rate is available.

The automated suite covers phrase classification, tab targeting, pre-existing mute preservation, user mute overrides, mute ownership, tab navigation/closure cleanup, and persisted state recovery with a mocked Chrome API. These are deterministic tests, not real Chrome or live Twitch validation. Background/minimized behavior and end-to-end audio control still need real browser tests.
