# 7Movies TV — TizenBrew module

Prepared for Samsung QN49Q6FAM (2017), Tizen 3.0, with TizenBrew already installed.
This is source for a TizenBrew site-modification module, not a signed standalone
widget. It does not activate merely by reinstalling the original launcher.

## TV interface (v0.2.0)

- Persistent Home, Movies, TV shows, Discover, Search and Refresh navigation.
- Arrow-key spatial navigation, visible cyan focus rings and automatic scrolling.
- OK selects the focused card or button; Back closes the keyboard or returns.
- Search opens an on-screen remote keyboard: letters, numbers, Space, Delete,
  Clear and Done. Results use the website's search. After Done, arrows move from
  the search field into results. Physical keyboards can still enter text.
- Larger buttons and headings, with desktop navigation and row arrows hidden.

This is a TV presentation layer over the website, not a separate native catalog.
The website must still load successfully in the TV browser. The injected code
uses ES5 syntax, but does not transpile the website's own modern JavaScript.
Cross-origin player controls and remote events inside player frames are not
covered by the top-level TV navigation layer. Playback remains provider-dependent.

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
of player content, origin scoping and duplicate injection. They do not substitute
for testing on the TV or against real third-party players.

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
point. Rebuild module.js after editing either source. Tests are in
`adblock.test.js` and `tv-ui.test.js`. The TV layout was visually checked using
a static captured catalog; keyboard/navigation tests use jsdom. Actual TV
search and third-party playback have not been verified.
