# 7Movies TV — TizenBrew module

Prepared for Samsung QN49Q6FAM (2017), Tizen 3.0, with TizenBrew already installed.
This is source for a TizenBrew site-modification module, not a signed standalone
widget. It does not activate merely by reinstalling the original launcher.

## TV interface (v0.3.0) — Native Samsung TV experience

Built to feel like a native Samsung TV app (TizenTube-style), not a website
overlay. The interface is designed for Samsung TV remotes with D-pad navigation.

### Sidebar navigation
- **Collapsible left sidebar** with icon + label navigation (Home, Movies, TV
  Shows, Discover, Search, Refresh)
- Press **←** at the left edge of content to open the sidebar
- **↑ ↓** navigates sidebar items, **OK** selects, **→** or **OK** closes
- Active page is highlighted in the sidebar
- The sidebar auto-collapses when you navigate into content
- Mouse hover also opens/closes (for desktop preview testing)

### Spatial navigation with focus memory
- **Arrow-key D-pad navigation** between all focusable elements
- **Row-based focus memory**: when you move vertically between rails (rows of
  posters), the last focused card in each rail is remembered. Coming back to
  that rail restores your position — just like Netflix/Samsung TV+
- **Smooth scrolling**: horizontal rail scroll and page scroll animate smoothly
- **Card focus effects**: focused cards scale up 8% with a blue glow ring and
  elevated z-index, exactly like native TV app poster focus

### On-screen QWERTY keyboard
- Samsung TV-style **QWERTY keyboard layout** (not a flat grid of letters)
- Rows: numbers, QWERTY, middle, bottom + action keys (Space, Delete, Clear, Done)
- **Blinking cursor** in the query display
- **Glassmorphism design** with backdrop blur, rounded corners, gradient background
- Keys highlight blue with scale-up when focused
- Typing is live — the search query updates as you type
- **Done** submits, **Back** cancels

### Media info preview
- Hovering (focusing) a movie/TV card shows a **floating info popup** below it
  with the title and metadata (year, rating)
- Auto-hides when focus moves away

### Premium visual design
- **Dark theme** with deep navy/black gradients matching Samsung TV OS
- **Glassmorphism** sidebar and keyboard with backdrop blur
- **Smooth CSS transitions** on all interactive elements (0.2–0.3s cubic-bezier)
- **Custom scrollbars** — thin, translucent blue
- **Page-in animation** — content fades in on page load
- **Samsung One font family** fallback chain
- Clean hint bar at the bottom showing available controls

### Enhanced remote control support
- **D-pad arrows**: spatial navigation
- **OK/Enter**: select or open keyboard on input fields
- **Back/Return** (keyCode 10009): close keyboard → close sidebar → close dialog
  → history back → double-tap to exit the app
- **Play/Pause/Stop**: media playback controls
- **Fast Forward/Rewind**: ±10 second seek
- **Channel Up/Down**: page scroll by 80% of viewport
- **Blue button**: quick-open Search
- **Color buttons** (Red/Green/Yellow): reserved for future features

### Updating an existing installation

Fully exit TizenBrew and reopen it to clear its in-memory module cache. If the
old interface persists, remove and re-add the GitHub module using
`bhargavmehta01/7movies-tizen@main`. The module is now named `7Movies TV`.

## What it does

- Opens https://7movies.ac using the TizenBrew module runtime.
- Sets the site's own `cinrift_ad_free` session preference to `true` whenever
  injected into 7movies.ac. This preference was verified in its public JavaScript
  on October 23, 2026. The site may change its implementation.
- Suppresses `window.open` and links/forms requesting other browsing contexts.
  Legitimate new-window actions, including some sign-in flows, are also blocked.
- Filters a small explicit list of known advertising hosts in fetch, XHR, beacon,
  and dynamic script/iframe/image URL assignments, with hostname-boundary checks.
- Removes conventional explicit ad elements and repeats cleanup after DOM changes.
- Applies popup/filter guards in the listed player origins when TizenBrew injects
  into their execution contexts. New player domains need explicit review/addition.

## Install / activate

TizenBrew's inspected loader fetches modules through jsDelivr from GitHub/npm;
there is no local-folder import in that loader. Install from the GitHub module
name above/below, rather than attempting to import a source ZIP.

Repository: https://github.com/bhargavmehta01/7movies-tizen

1. In TizenBrew's Module Manager choose the GitHub module option.
2. Enter `bhargavmehta01/7movies-tizen`.
3. Launch `7Movies TV` from TizenBrew, not the ordinary launcher.
4. Verify the site's Ads control reports off, browse a title, and test each player.
   Confirm that selecting play does not open a new window and that seeking,
   full screen, audio and the remote still work.
5. If a player fails, exit the module. The original launcher still works without
   these filters. Remove the module in TizenBrew to disable the integration.

This source uses the execution-context injection mode used by TizenTube. It does
not assume document-start injection works on the old Tizen 3.0 debugger. Injection
can race early scripts; full-page navigation creates a new injection opportunity.
No developer settings, certificate trust, CSP, or network settings were changed.

## Scope and limitations

This is best-effort script-level filtering, NOT uBlock Origin, a full EasyList
engine, or native network interception. Parser-loaded resources can start before
cleanup. Existing references to native APIs, workers, unlisted ad domains,
in-page overlays without explicit ad markers, same-tab redirects, and ads baked
into video can evade it. It does not bypass access checks or extract streams.
It does not claim all ads are blocked or certify seamless playback on this TV.
No TV was connected during development.

Diagnostic counters are available as `window.__sevenMoviesGuard` in each injected
page's developer console. They count blocked attempts, not independently verified
ads or total network traffic. They are not sent anywhere.

## Tests

Run `npm install --ignore-scripts` and `npm test` on a desktop with Node.js.
The jsdom tests cover popup suppression, allowed movie links, preference setting,
fetch/XHR/dynamic-resource filters, hostname boundaries, DOM cleanup, preservation
of player content, origin scoping and duplicate injection. The TV UI tests cover
sidebar creation, directional spatial navigation, QWERTY keyboard interaction
(typing, delete, clear, done), Enter to open keyboard on inputs, Back to close,
focus management, duplicate injection guards, hint bar, and style injection. They
do not substitute for testing on the TV or against real third-party players.

## Foundations reviewed

- https://github.com/reisxd/TizenTube — YouTube-specific response pruning in
  `mods/features/adblock.js`; debugger injection in the standalone injector.
- https://github.com/reisxd/TizenBrew/blob/main/docs/MODULES.md — module contract.
- TizenBrew `service-nextgen/service/utils/debugger.js` and `moduleLoader.js` —
  execution-context injection and jsDelivr-based loading.
- https://github.com/ghostfxck/TizenBrowse — reviewed; its filtering is also
  substantially YouTube-specific and is not a ready-made general adblock engine.

The guard implementation is original code; no upstream source is bundled.

## Source layout

`adblock.js` and `tv-ui.js` are concatenated into `module.js`, the runtime entry
point. Rebuild module.js after editing either source:

```sh
cat adblock.js tv-ui.js > module.js
```

Tests are in `adblock.test.js` and `tv-ui.test.js`. The TV layout was visually
checked using a static captured catalog; keyboard/navigation tests use jsdom.
Actual TV search and third-party playback have not been verified.
