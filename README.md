# Twitch Ad Muter

This is an early, installable Manifest V3 build (0.2.0). It recognizes two specific Portuguese Twitch ad UI phrases observed by the user and mutes only the Twitch tab while one of those phrases is present. When the phrase disappears, it restores audio only if this extension still owns the tab mute. The user confirmed one real ad start/return cycle. Broader real-world reliability and false-positive rates remain unvalidated. Generic ad wording is diagnostic-only. This is not a completed or broadly validated product.

## Current status

The user confirmed one real ad-to-live cycle. The exact phrases and their false-positive rate still need testing across more normal streams, ad breaks, and locales. This early build implements tab audio control for only those two exact phrases. The popup/options interface is still pending. See [the investigation report](docs/investigation.md).

## Architecture

- `content/detector.js`: locates the video player and attaches a scoped `MutationObserver`; does not depend on tab visibility.
- `background/audio-controller.js`: owns per-tab mute state, stores recovery state locally, and preserves pre-existing/manual mute changes.
- `background/service-worker.js`: Manifest V3 service worker.
- `shared/detection-core.js`: phrase classification and mute-ownership rules.
- `tests/detection-core.test.js`: detector and mute-ownership unit tests.
- `tests/audio-controller.test.js`: service-worker/controller tests with a mocked Chrome API.
- No ad blocking, external service, popup, or options page is included in this early audio-control stage.

## Permissions

The extension declares Twitch host access plus `tabs` and `storage`. It does not request `scripting` or broad web access. `tabs` is used to mute only the Twitch tab that sent the detector signal; `storage` preserves mute ownership across service-worker suspension.

## Install

1. Open `chrome://extensions/`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked**.
4. Select this project folder (`twitch-ad-muter`).
5. Open a Twitch stream. In that tab's DevTools console, filter for `Twitch Ad Muter`.

To exercise the current audio path, start with the Twitch tab unmuted. During an ad that shows one of the exact observed Portuguese phrases, the Twitch tab should mute; when the phrase disappears, audio should restore only if the extension still owns that mute. Also check that a pre-muted tab stays muted and that a manual mute change during an ad is left alone. These are important real-Chrome checks; the automated suite alone does not validate browser integration.

The logs report player identification, matching evidence, and tab mute/restore decisions. A cleared phrase was associated with a live return in one user-confirmed cycle; this has not been validated across multiple ad types, durations, or normal playback conditions.

## Tests

Requires Node.js. Run `npm test` from the project folder. Tests validate phrase classification and mute-ownership logic against synthetic fixtures. They do not replace real tests of Twitch ad timing, browser UI mute changes, multiple tabs, service-worker suspension, or background execution.

## Test matrix

| Scenario | Expected | Observed | Indicator | Accuracy / issues |
|---|---|---|---|---|
| Normal live stream | No ad candidate | Not validated as playable live video | Player-scoped text | No rate available |
| One observed ad cycle | Mute on ad UI phrase; restore when live returns | User confirms phrase appeared during ad and live returned when phrase cleared | Two specific Portuguese phrases | One real cycle; more needed |
| Different durations, consecutive ads | Mute and restore each time | Not tested | Same UI phrases | Pending |
| Return to live | Restore only after live returns | One user-confirmed return coincided with phrase clearing | Phrase disappearance | More cycles needed |
| Loading, pause/resume, quality change | No ad trigger | Logic fixtures only; real behavior pending | No ad-specific signal used | No rate available |
| Background/minimized | Continue collecting real signals | Not tested | MutationObserver | Chrome/page scheduling behavior pending |
| Several Twitch tabs, reload, close | Isolated per-tab lifecycle | Per-tab state and close cleanup implemented; real browser test pending | Tab ID + local storage | Pending |

## Limitations and diagnostic collection

The documented Twitch embedded-player events cover general playback and channel state; the reviewed public event list does not include ad start/end events. The EventSub ad-break event is tied to the channel's requested break and can precede what viewers see. This build therefore uses specific player UI phrases confirmed in one real user-observed cycle. The tab mute controller tracks ownership and preserves manual mute changes; these protections have isolated logic tests but still need live Chrome validation. Do not treat this early build as fully validated.
