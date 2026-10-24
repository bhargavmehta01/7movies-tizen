/* 7Movies TV Guard: original implementation for TizenBrew, ES5 syntax.
 * Runs inside website execution contexts, NOT as a launcher <script>.
 * Best effort: no engine-level interception or promise of complete ad removal.
 */
(function () {
  'use strict';
  var siteHosts = ['7movies.ac', 'www.7movies.ac'];
  // Player origins observed in the site's CSP on 2026-10-23.
  var playerHosts = ['embed.animecurx.tech', 'embed.vidrift.net', 'embed.vidrift.in',
    'vidbolt.xyz', 'vidly.pro', 'player.cinezo.live', 'atlantic.st', 'www.vidy.st',
    'vaplayer.ru', 'vidlink.pro'];
  var host = window.location.hostname.toLowerCase();
  if (siteHosts.indexOf(host) < 0 && playerHosts.indexOf(host) < 0) return;
  if (window.__sevenMoviesGuard) return;
  var state = { version: '0.1.0', popups: 0, requests: 0, elements: 0, preference: false };
  window.__sevenMoviesGuard = state;
  // A deliberately small seed list, not an EasyList/uBlock implementation.
  var adHosts = ['doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
    'popads.net', 'popcash.net', 'adsterra.com', 'propellerads.com'];
  function blocked(url) {
    try {
      var a = document.createElement('a');
      a.href = String(url || '');
      var name = a.hostname.toLowerCase();
      for (var i = 0; i < adHosts.length; i++) {
        if (name === adHosts[i] || name.slice(-(adHosts[i].length + 1)) === '.' + adHosts[i]) return true;
      }
    } catch (ignore) {}
    return false;
  }
  function stop(event) { event.preventDefault(); event.stopImmediatePropagation(); }
  function popupBlocked() { state.popups++; return null; }
  try {
    Object.defineProperty(window, 'open', { value: popupBlocked, writable: false, configurable: false });
  } catch (ignore) { window.open = popupBlocked; }

  // Block new-window navigation, including user-gesture popunders. Same-tab
  // site navigation remains intact. Legitimate external-window links are blocked too.
  document.addEventListener('click', function (event) {
    var el = event.target;
    while (el && el.nodeType === 1) {
      if (el.tagName === 'A' || el.tagName === 'AREA') {
        var target = (el.getAttribute('target') || '').toLowerCase();
        if (blocked(el.href) || (target && target !== '_self')) {
          state.popups++; stop(event);
        }
        break;
      }
      el = el.parentElement;
    }
  }, true);
  document.addEventListener('submit', function (event) {
    var form = event.target;
    var target = (form.getAttribute('target') || '').toLowerCase();
    if (blocked(form.action) || (target && target !== '_self')) { state.popups++; stop(event); }
  }, true);

  // Use the website's own opt-out rather than modifying player response data.
  if (siteHosts.indexOf(host) >= 0) {
    try {
      window.sessionStorage.setItem('cinrift_ad_free', 'true');
      state.preference = true;
      var change = document.createEvent('Event');
      change.initEvent('cinrift:preferences', false, false);
      window.dispatchEvent(change);
    } catch (ignore) {}
  }

  if (window.fetch) {
    var fetchOriginal = window.fetch;
    window.fetch = function (input) {
      var url = input && input.url ? input.url : input;
      if (blocked(url)) { state.requests++; return Promise.reject(new TypeError('Blocked ad request')); }
      return fetchOriginal.apply(this, arguments);
    };
  }
  if (window.XMLHttpRequest) {
    var openOriginal = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      if (blocked(url)) { state.requests++; throw new Error('Blocked ad request'); }
      return openOriginal.apply(this, arguments);
    };
  }
  if (window.navigator.sendBeacon) {
    var beaconOriginal = window.navigator.sendBeacon;
    window.navigator.sendBeacon = function (url) {
      if (blocked(url)) { state.requests++; return false; }
      return beaconOriginal.apply(this, arguments);
    };
  }

  // Intercept common dynamically assigned resource URLs before they are fetched.
  var setAttributeOriginal = Element.prototype.setAttribute;
  function resource(el, attr) {
    return attr === 'src' && /^(SCRIPT|IFRAME|IMG)$/.test(el.tagName);
  }
  Element.prototype.setAttribute = function (name, value) {
    if (resource(this, String(name).toLowerCase()) && blocked(value)) {
      state.requests++; return;
    }
    return setAttributeOriginal.apply(this, arguments);
  };
  function patchSrc(ctor) {
    if (!ctor) return;
    var proto = ctor.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, 'src');
    if (!desc || !desc.set || !desc.configurable) return;
    Object.defineProperty(proto, 'src', {
      configurable: desc.configurable, enumerable: desc.enumerable, get: desc.get,
      set: function (value) {
        if (blocked(value)) { state.requests++; return; }
        desc.set.call(this, value);
      }
    });
  }
  patchSrc(window.HTMLScriptElement);
  patchSrc(window.HTMLIFrameElement);
  patchSrc(window.HTMLImageElement);

  // Exact conventional ad markers only; never hide generic overlays or players.
  var selectors = 'ins.adsbygoogle,[data-ad-slot],[id^="google_ads_iframe"]';
  function clean(root) {
    if (!root || !root.querySelectorAll) return;
    var elements = root.querySelectorAll(selectors + ',script[src],iframe[src],img[src]');
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      var adMarker = el.hasAttribute('data-ad-slot') ||
        (el.id || '').indexOf('google_ads_iframe') === 0 ||
        (el.tagName === 'INS' && /(^|\s)adsbygoogle(\s|$)/.test(el.className));
      if ((adMarker || blocked(el.getAttribute('src'))) && el.parentNode) {
        el.parentNode.removeChild(el); state.elements++;
      }
    }
  }
  var pending = false;
  function scheduleClean() {
    if (pending) return;
    pending = true;
    window.setTimeout(function () { pending = false; clean(document); }, 100);
  }
  function start() {
    clean(document);
    if (window.MutationObserver && document.documentElement) {
      new MutationObserver(scheduleClean).observe(document.documentElement, {
        childList: true, subtree: true, attributes: true,
        attributeFilter: ['src', 'id', 'class', 'data-ad-slot']
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
