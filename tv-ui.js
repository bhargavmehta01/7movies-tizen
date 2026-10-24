/* Remote-first TV presentation for 7Movies. ES5; no external dependencies.
 * v0.3.0 — Native Samsung TV app experience with sidebar, row nav, TV keyboard.
 */
(function () {
  'use strict';
  var host = location.hostname;
  var preview = /^(localhost|127\.0\.0\.1)$/.test(host) && document.documentElement.hasAttribute('data-tv-preview');
  if (host !== '7movies.ac' && host !== 'www.7movies.ac' && !preview) return;
  if (window.__sevenMoviesTV) return;
  var api = { version: '0.3.0' }; window.__sevenMoviesTV = api;

  // ── State ──
  var sidebar, sidebarOpen = false, keyboard, editing, selected, searchPending = false, backAt = 0;
  var focusMemory = {}; // railId → last focused element
  var sidebarIdx = 0;
  var hintTimer = null;
  var SIDEBAR_W_OPEN = 260;
  var SIDEBAR_W_CLOSED = 72;
  var NAV_ITEMS = [
    { label: 'Home',     icon: '⌂', href: '/' },
    { label: 'Movies',   icon: '🎬', href: '/movies' },
    { label: 'TV Shows', icon: '📺', href: '/tv' },
    { label: 'Discover', icon: '🔭', href: '/discover' },
    { label: 'Search',   icon: '🔍', href: null },
    { label: 'Refresh',  icon: '↻', href: null }
  ];

  // ── Utility ──
  function closest(el, query) {
    while (el && el.nodeType === 1) { if (el.matches(query)) return el; el = el.parentElement; }
    return null;
  }
  function visible(el) {
    if (!el || el.disabled || el.getAttribute('aria-hidden') === 'true') return false;
    var r = el.getBoundingClientRect(), s = window.getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && !closest(el, '[hidden],[aria-hidden="true"]');
  }
  function modal() {
    var all = document.querySelectorAll('[role="dialog"],[aria-modal="true"]');
    for (var i = all.length - 1; i >= 0; i--) if (visible(all[i])) return all[i];
    return null;
  }

  // ── Focus ring with scale + glow ──
  function setFocus(el) {
    if (!el) return;
    if (selected) {
      selected.classList.remove('sm-tv-focus');
      selected.style.transform = '';
      selected.style.zIndex = '';
    }
    selected = el;
    el.classList.add('sm-tv-focus');
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    try { el.focus({ preventScroll: true }); } catch (ignore) { el.focus(); }

    // Scale up media cards
    var isCard = closest(el, '.media-card,[data-media-card],article') || el.querySelector('img');
    if (isCard && !closest(el, '#sm-tv-sidebar,#sm-tv-keyboard')) {
      el.style.transform = 'scale(1.08)';
      el.style.zIndex = '10';
    }

    // Scroll into view — row-aware
    scrollToElement(el);

    // Show info preview for cards
    showInfoPreview(el);
  }

  function scrollToElement(el) {
    // Scroll horizontally inside rail
    var p = el.parentElement;
    while (p && p !== document.body && p !== document.documentElement) {
      var r = el.getBoundingClientRect(), b = p.getBoundingClientRect();
      if (p.scrollWidth > p.clientWidth + 4 && /auto|scroll/.test(getComputedStyle(p).overflowX)) {
        var targetX = r.left - b.left - 80;
        if (r.left < b.left + 40) {
          p.scrollTo ? p.scrollTo({ left: p.scrollLeft + r.left - b.left - 80, behavior: 'smooth' }) : (p.scrollLeft += r.left - b.left - 80);
        }
        if (r.right > b.right - 40) {
          p.scrollTo ? p.scrollTo({ left: p.scrollLeft + r.right - b.right + 80, behavior: 'smooth' }) : (p.scrollLeft += r.right - b.right + 80);
        }
      }
      if (p.scrollHeight > p.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(p).overflowY)) {
        if (r.top < b.top + 40) p.scrollTop -= b.top + 40 - r.top;
        if (r.bottom > b.bottom - 40) p.scrollTop += r.bottom - b.bottom + 40;
      }
      p = p.parentElement;
    }
    // Vertical page scroll
    if (!closest(el, '#sm-tv-sidebar,#sm-tv-keyboard')) {
      var box = el.getBoundingClientRect();
      if (box.top < 80) {
        window.scrollTo ? window.scrollTo({ top: window.scrollY + box.top - 100, behavior: 'smooth' }) : window.scrollBy(0, box.top - 100);
      } else if (box.bottom > window.innerHeight - 80) {
        window.scrollTo ? window.scrollTo({ top: window.scrollY + box.bottom - window.innerHeight + 100, behavior: 'smooth' }) : window.scrollBy(0, box.bottom - window.innerHeight + 100);
      }
    }
  }

  // ── Info Preview on card focus ──
  function showInfoPreview(el) {
    var existing = document.getElementById('sm-tv-info');
    if (existing) existing.parentNode.removeChild(existing);
    if (closest(el, '#sm-tv-sidebar,#sm-tv-keyboard,#sm-tv-bar')) return;
    // Try to find title/year/rating text near the card
    var card = closest(el, 'article,.media-card,[data-media-card]') || el;
    var titleEl = card.querySelector('h3,h4,.title,[class*="title"]');
    var metaEl = card.querySelector('.meta,[class*="meta"],[class*="year"]');
    var title = titleEl ? titleEl.textContent.trim() : (el.getAttribute('aria-label') || el.textContent || '').trim();
    if (!title || title.length > 120) return;
    var meta = metaEl ? metaEl.textContent.trim() : '';
    var info = document.createElement('div');
    info.id = 'sm-tv-info';
    info.innerHTML = '<strong>' + title.replace(/</g, '&lt;') + '</strong>' + (meta ? '<span>' + meta.replace(/</g, '&lt;') + '</span>' : '');
    document.body.appendChild(info);
    // Position below the card
    var r = el.getBoundingClientRect();
    info.style.left = Math.max(10, r.left) + 'px';
    info.style.top = Math.min(r.bottom + 8, window.innerHeight - 60) + 'px';
  }

  // ── Row-based navigation ──
  // Identify which "rail" an element belongs to
  function getRail(el) {
    return closest(el, '.rail,[class*="rail"],[class*="row"],section,ul') || el.parentElement;
  }
  function getRailId(rail) {
    if (!rail) return 'root';
    return rail.id || rail.getAttribute('data-rail-id') || ('rail-' + Array.prototype.indexOf.call((rail.parentElement || document.body).children, rail));
  }

  function collectFocusables() {
    var selector = 'a[href],button,input,select,textarea,[role="button"],[role="tab"],[tabindex="0"]';
    var root = keyboard || modal() || document;
    var all = root.querySelectorAll(selector), result = [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (!visible(el)) continue;
      if (el.getAttribute('tabindex') === '-1') continue;
      if (closest(el, '.topbar,.rail-arrow,footer,.hero-dots')) continue;
      // Skip nested controls inside media cards — the card itself is the target
      var card = closest(el.parentElement, '[data-navigation-href],[data-media-card]');
      if (card) continue;
      result.push(el);
    }
    return result;
  }

  function nextInDirection(current, list, code) {
    if (!current || !visible(current)) return list[0];
    var a = current.getBoundingClientRect(), ax = (a.left + a.right) / 2, ay = (a.top + a.bottom) / 2;
    var horizontal = code === 37 || code === 39, positive = code === 39 || code === 40;
    var best = null, score = Infinity;
    for (var i = 0; i < list.length; i++) {
      if (list[i] === current) continue;
      var b = list[i].getBoundingClientRect(), dx = (b.left + b.right) / 2 - ax, dy = (b.top + b.bottom) / 2 - ay;
      var main = horizontal ? dx : dy, cross = Math.abs(horizontal ? dy : dx);
      if ((positive ? main : -main) < 4) continue;
      var aligned = horizontal ? (b.bottom > a.top + 4 && b.top < a.bottom - 4) : (b.right > a.left + 4 && b.left < a.right - 4);
      var value = Math.abs(main) + cross * 3 + (aligned ? 0 : 10000);
      if (value < score) { score = value; best = list[i]; }
    }
    return best;
  }
  api.nextInDirection = nextInDirection;

  // Wrapper that applies rail focus memory on top of spatial navigation
  function navigateDirection(current, list, code) {
    var best = nextInDirection(current, list, code);
    // Save focus memory for current rail when leaving vertically
    if (best && (code === 38 || code === 40)) {
      var rail = getRail(current);
      if (rail) focusMemory[getRailId(rail)] = current;
    }
    // Restore focus memory for target rail
    if (best && (code === 38 || code === 40)) {
      var targetRail = getRail(best);
      if (targetRail) {
        var remembered = focusMemory[getRailId(targetRail)];
        if (remembered && visible(remembered) && list.indexOf(remembered) >= 0) {
          best = remembered;
        }
      }
    }
    return best;
  }

  // ── Hint bar ──
  function hint(text, duration) {
    var el = document.getElementById('sm-tv-hint');
    if (!el) return;
    el.textContent = text;
    el.style.opacity = '1';
    if (hintTimer) clearTimeout(hintTimer);
    if (duration) {
      hintTimer = setTimeout(function () { el.style.opacity = '0.5'; }, duration);
    }
  }

  // ── Set value on input (React-compatible) ──
  function setValue(input, value) {
    var proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(input, value); else input.value = value;
    var ev = document.createEvent('Event'); ev.initEvent('input', true, false); input.dispatchEvent(ev);
    ev = document.createEvent('Event'); ev.initEvent('change', true, false); input.dispatchEvent(ev);
  }

  // ── Sidebar ──
  function openSidebar() {
    if (sidebarOpen || keyboard) return;
    sidebarOpen = true;
    sidebar.classList.add('sm-tv-sidebar-open');
    document.body.classList.add('sm-tv-sidebar-expanded');
    var btns = sidebar.querySelectorAll('.sm-tv-nav-btn');
    if (btns[sidebarIdx]) setFocus(btns[sidebarIdx]);
    hint('↑↓ Navigate · OK Select · → Close sidebar', 4000);
  }
  function closeSidebar() {
    if (!sidebarOpen) return;
    sidebarOpen = false;
    sidebar.classList.remove('sm-tv-sidebar-open');
    document.body.classList.remove('sm-tv-sidebar-expanded');
    // Return focus to content
    var list = collectFocusables();
    for (var i = 0; i < list.length; i++) {
      if (!closest(list[i], '#sm-tv-sidebar')) { setFocus(list[i]); return; }
    }
  }
  function navigateSidebar(code) {
    var btns = sidebar.querySelectorAll('.sm-tv-nav-btn');
    if (code === 38) { sidebarIdx = Math.max(0, sidebarIdx - 1); }
    else if (code === 40) { sidebarIdx = Math.min(btns.length - 1, sidebarIdx + 1); }
    else if (code === 13 || code === 39) {
      if (code === 13 && btns[sidebarIdx]) {
        btns[sidebarIdx].click();
      }
      closeSidebar();
      return;
    }
    if (btns[sidebarIdx]) setFocus(btns[sidebarIdx]);
  }

  // ── On-screen keyboard (Samsung TV style) ──
  function closeKeyboard() {
    if (!keyboard) return;
    keyboard.parentNode.removeChild(keyboard); keyboard = null;
    var target = editing; editing = null;
    setFocus(visible(target) ? target : collectFocusables()[0]);
  }
  function openKeyboard(input) {
    if (keyboard || !input) return;
    editing = input; input.blur();
    keyboard = document.createElement('section');
    keyboard.id = 'sm-tv-keyboard';
    keyboard.setAttribute('role', 'dialog');
    keyboard.setAttribute('aria-label', 'TV keyboard');

    // Header
    var header = document.createElement('div');
    header.className = 'sm-tv-kb-header';
    var title = document.createElement('h2');
    title.textContent = '🔍 Search';
    header.appendChild(title);
    keyboard.appendChild(header);

    // Query display with blinking cursor
    var display = document.createElement('div');
    display.id = 'sm-tv-query';
    var queryText = document.createElement('span');
    queryText.className = 'sm-tv-query-text';
    queryText.textContent = input.value || '';
    display.appendChild(queryText);
    var cursor = document.createElement('span');
    cursor.className = 'sm-tv-cursor';
    cursor.textContent = '|';
    display.appendChild(cursor);
    if (!input.value) {
      var placeholder = document.createElement('span');
      placeholder.className = 'sm-tv-placeholder';
      placeholder.textContent = 'Type with your remote';
      display.appendChild(placeholder);
    }
    keyboard.appendChild(display);

    // Keyboard layout — QWERTY
    var rows = [
      ['1','2','3','4','5','6','7','8','9','0'],
      ['Q','W','E','R','T','Y','U','I','O','P'],
      ['A','S','D','F','G','H','J','K','L'],
      ['Z','X','C','V','B','N','M']
    ];
    var grid = document.createElement('div');
    grid.className = 'sm-tv-keys';
    rows.forEach(function (row) {
      var rowDiv = document.createElement('div');
      rowDiv.className = 'sm-tv-key-row';
      row.forEach(function (key) {
        var b = document.createElement('button');
        b.textContent = key;
        b.type = 'button';
        b.className = 'sm-tv-key';
        b.setAttribute('data-key', key);
        b.onclick = function () {
          var value = editing.value + key.toLowerCase();
          setValue(editing, value);
          queryText.textContent = value;
          var ph = display.querySelector('.sm-tv-placeholder');
          if (ph) ph.style.display = 'none';
        };
        rowDiv.appendChild(b);
      });
      grid.appendChild(rowDiv);
    });
    keyboard.appendChild(grid);

    // Action buttons row
    var actions = document.createElement('div');
    actions.className = 'sm-tv-key-row sm-tv-actions';
    var actionKeys = [
      { label: '␣ Space', action: 'space' },
      { label: '⌫ Delete', action: 'delete' },
      { label: '✕ Clear', action: 'clear' },
      { label: '✓ Done', action: 'done' }
    ];
    actionKeys.forEach(function (ak) {
      var b = document.createElement('button');
      b.textContent = ak.label;
      b.type = 'button';
      b.className = 'sm-tv-key sm-tv-key-action';
      b.setAttribute('data-action', ak.action);
      b.onclick = function () {
        if (ak.action === 'done') { closeKeyboard(); return; }
        var value = editing.value;
        if (ak.action === 'delete') value = value.slice(0, -1);
        else if (ak.action === 'clear') value = '';
        else if (ak.action === 'space') value += ' ';
        setValue(editing, value);
        queryText.textContent = value;
        var ph = display.querySelector('.sm-tv-placeholder');
        if (ph) ph.style.display = value ? 'none' : '';
      };
      actions.appendChild(b);
    });
    keyboard.appendChild(actions);

    document.body.appendChild(keyboard);
    setFocus(grid.querySelector('button'));
    hint('Type with D-pad · ✓ Done to search · Back to cancel', 5000);
  }

  // ── Search trigger ──
  function triggerSearch() {
    var buttons = document.querySelectorAll('button[aria-label="Search"]');
    searchPending = true;
    for (var i = 0; i < buttons.length; i++) {
      if (!closest(buttons[i], '#sm-tv-sidebar')) { buttons[i].click(); break; }
    }
    findSearchInput();
    window.setTimeout(function () {
      if (searchPending) { searchPending = false; hint('Search did not load. Use Refresh to retry.', 5000); }
    }, 8000);
  }
  function findSearchInput() {
    if (!searchPending) return;
    var inputs = document.querySelectorAll('input[type="search"],input[placeholder],input[aria-label]');
    for (var i = 0; i < inputs.length; i++) {
      var label = (inputs[i].getAttribute('placeholder') || '') + ' ' + (inputs[i].getAttribute('aria-label') || '');
      if (visible(inputs[i]) && (/search/i.test(label) || inputs[i].type === 'search')) {
        searchPending = false; openKeyboard(inputs[i]); return;
      }
    }
  }

  // ── Back / Exit ──
  function goBack() {
    if (keyboard) { closeKeyboard(); return; }
    if (sidebarOpen) { closeSidebar(); return; }
    var dialog = modal();
    if (dialog) {
      var close = dialog.querySelector('button[aria-label*="Close"],button[aria-label*="close"]');
      if (close) { close.click(); return; }
    }
    if (location.pathname !== '/') { window.history.back(); return; }
    if (window.history.state && typeof window.history.state.homeSearch === 'string') { location.assign('/'); return; }
    if (Date.now() - backAt < 1800) {
      try { tizen.application.getCurrentApplication().exit(); } catch (ignore) { hint('Close this browser tab to exit.', 3000); }
      return;
    }
    backAt = Date.now();
    hint('Press Back again to exit', 2000);
  }

  // ── Master keydown ──
  function keydown(e) {
    var code = e.keyCode || e.which;
    // Only intercept TV remote and arrow keys
    if ([37, 38, 39, 40, 13, 10009, 27, 8, 415, 19, 10252, 417, 412, 403, 404, 405, 406, 427, 428].indexOf(code) < 0) return;
    // Allow physical keyboard backspace in native inputs
    if (!keyboard && closest(e.target, 'input,textarea') && code === 8) return;
    e.preventDefault(); e.stopImmediatePropagation();

    // Back / Return
    if (code === 10009 || code === 27 || code === 8) { goBack(); return; }

    // Sidebar navigation
    if (sidebarOpen && !keyboard) {
      if (code >= 37 && code <= 40 || code === 13) { navigateSidebar(code); return; }
    }

    // Arrow navigation
    if (code >= 37 && code <= 40) {
      // Left arrow opens sidebar when at left edge of content
      if (code === 37 && !keyboard && !sidebarOpen) {
        if (selected) {
          var r = selected.getBoundingClientRect();
          if (r.left < SIDEBAR_W_CLOSED + 60) { openSidebar(); return; }
        } else { openSidebar(); return; }
      }
      var list = collectFocusables(), next = navigateDirection(selected, list, code);
      if (next) setFocus(next);
      else if (code === 40 && !keyboard) {
        window.scrollTo ? window.scrollTo({ top: window.scrollY + Math.round(innerHeight * 0.6), behavior: 'smooth' }) : window.scrollBy(0, Math.round(innerHeight * 0.6));
      }
      return;
    }

    // OK / Enter
    if (code === 13) {
      if (!selected || !visible(selected)) { setFocus(collectFocusables()[0]); return; }
      if (/^(INPUT|TEXTAREA)$/.test(selected.tagName)) { openKeyboard(selected); return; }
      selected.click(); return;
    }

    // Media controls
    var video = document.querySelector('video');
    if (video) {
      if (code === 415) video.play();
      else if (code === 19) video.pause();
      else if (code === 10252) { if (video.paused) video.play(); else video.pause(); }
      else if (code === 417 || code === 412) video.currentTime = Math.max(0, video.currentTime + (code === 417 ? 10 : -10));
    }

    // Channel Up / Down for page scroll
    if (code === 427) {
      window.scrollTo ? window.scrollTo({ top: window.scrollY - innerHeight * 0.8, behavior: 'smooth' }) : window.scrollBy(0, -innerHeight * 0.8);
    }
    if (code === 428) {
      window.scrollTo ? window.scrollTo({ top: window.scrollY + innerHeight * 0.8, behavior: 'smooth' }) : window.scrollBy(0, innerHeight * 0.8);
    }

    // Color buttons
    if (code === 403) { /* Red — could map to watchlist */ }
    if (code === 404) { /* Green */ }
    if (code === 405) { /* Yellow */ }
    if (code === 406) { /* Blue — open search */ triggerSearch(); }
  }

  // ── Inject styles ──
  function injectStyles() {
    var style = document.createElement('style');
    style.id = 'sm-tv-style';
    style.textContent = [
      // ── Base reset ──
      'html.sm-tv { scroll-padding-top: 40px; scroll-behavior: smooth; }',
      'html.sm-tv body { background: #0a0e1a !important; color: #e8ecf4; font-family: "Samsung One", "SamsungOne", -apple-system, Arial, sans-serif !important; padding-top: 20px !important; padding-bottom: 56px !important; padding-left: ' + SIDEBAR_W_CLOSED + 'px !important; transition: padding-left 0.3s cubic-bezier(0.4,0,0.2,1); overflow-x: hidden; }',
      'html.sm-tv body.sm-tv-sidebar-expanded { padding-left: ' + SIDEBAR_W_OPEN + 'px !important; }',
      // ── Hide site chrome ──
      '.sm-tv .topbar, .sm-tv footer, .sm-tv .hero-dots, .sm-tv .rail-arrow { display: none !important; }',
      '.sm-tv .hero { min-height: 400px !important; max-height: 560px !important; border-radius: 0 0 20px 20px; overflow: hidden; }',
      // ── Rails ──
      '.sm-tv .rail, .sm-tv section { margin: 24px 0 !important; }',
      '.sm-tv .rail h3, .sm-tv section h3, .sm-tv h3 { font-size: 26px !important; font-weight: 600; color: #c0cce0; letter-spacing: 0.3px; margin-left: 24px; margin-bottom: 12px; }',
      '.sm-tv .card-row { padding: 12px 0 !important; scroll-behavior: smooth; }',
      '.sm-tv .media-card { min-width: 190px !important; transition: transform 0.25s cubic-bezier(0.4,0,0.2,1), box-shadow 0.25s ease; border-radius: 12px; overflow: hidden; }',
      '.sm-tv .card-watchlist { display: none !important; }',
      '.sm-tv button, .sm-tv input, .sm-tv select { font-size: 20px !important; }',

      // ── Focus ring ──
      '.sm-tv .sm-tv-focus { outline: 3px solid #00b4ff !important; outline-offset: 4px !important; box-shadow: 0 0 20px rgba(0,180,255,0.35), 0 0 60px rgba(0,180,255,0.12), inset 0 0 0 1px rgba(0,180,255,0.15) !important; border-radius: 12px; transition: all 0.2s cubic-bezier(0.4,0,0.2,1); position: relative; }',
      '.sm-tv .sm-tv-focus img { filter: brightness(1.1) saturate(1.05); transition: filter 0.2s ease; }',

      // ── Sidebar ──
      '#sm-tv-sidebar { position: fixed; top: 0; left: 0; bottom: 0; width: ' + SIDEBAR_W_CLOSED + 'px; z-index: 2147483100; background: linear-gradient(180deg, #111827 0%, #0d1117 100%); border-right: 1px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; align-items: center; padding-top: 20px; transition: width 0.3s cubic-bezier(0.4,0,0.2,1); overflow: hidden; }',
      '#sm-tv-sidebar.sm-tv-sidebar-open { width: ' + SIDEBAR_W_OPEN + 'px; align-items: flex-start; background: linear-gradient(180deg, #131b2e 0%, #0d1117 100%); box-shadow: 8px 0 40px rgba(0,0,0,0.6); }',
      // Logo
      '.sm-tv-logo { display: flex; align-items: center; padding: 12px 16px; margin-bottom: 24px; white-space: nowrap; overflow: hidden; width: 100%; box-sizing: border-box; }',
      '.sm-tv-logo-icon { font-size: 32px; min-width: 40px; text-align: center; filter: drop-shadow(0 0 8px rgba(0,180,255,0.4)); }',
      '.sm-tv-logo-text { font-size: 22px; font-weight: 700; color: #00b4ff; margin-left: 14px; opacity: 0; transition: opacity 0.2s ease 0.1s; letter-spacing: 0.5px; }',
      '#sm-tv-sidebar.sm-tv-sidebar-open .sm-tv-logo-text { opacity: 1; }',
      // Nav buttons
      '.sm-tv-nav-btn { display: flex; align-items: center; width: 100%; padding: 14px 16px; border: none; background: transparent; color: #8899b0; font-size: 17px; cursor: pointer; white-space: nowrap; overflow: hidden; border-radius: 12px; margin: 2px 8px; box-sizing: border-box; transition: all 0.2s ease; }',
      '.sm-tv-nav-btn:hover, .sm-tv-nav-btn.sm-tv-focus { background: rgba(0,180,255,0.1); color: #e8ecf4; }',
      '.sm-tv-nav-btn.sm-tv-focus { outline: 2px solid #00b4ff !important; outline-offset: -2px !important; box-shadow: 0 0 16px rgba(0,180,255,0.2) !important; }',
      '.sm-tv-nav-btn.sm-tv-nav-active { color: #00b4ff; }',
      '.sm-tv-nav-icon { font-size: 24px; min-width: 40px; text-align: center; }',
      '.sm-tv-nav-label { margin-left: 14px; font-weight: 500; opacity: 0; transition: opacity 0.2s ease 0.1s; }',
      '#sm-tv-sidebar.sm-tv-sidebar-open .sm-tv-nav-label { opacity: 1; }',
      // Separator
      '.sm-tv-sep { width: calc(100% - 32px); height: 1px; background: rgba(255,255,255,0.06); margin: 8px 16px; }',

      // ── Hint bar ──
      '#sm-tv-hint { position: fixed; bottom: 0; left: 0; right: 0; height: 44px; padding: 10px 24px 10px ' + (SIDEBAR_W_CLOSED + 24) + 'px; background: linear-gradient(0deg, #0a0e1a 0%, rgba(10,14,26,0.95) 100%); color: #5a6d8a; font-size: 15px; z-index: 2147483000; pointer-events: none; display: flex; align-items: center; gap: 20px; transition: opacity 0.3s ease; letter-spacing: 0.2px; }',

      // ── Info preview ──
      '#sm-tv-info { position: fixed; z-index: 2147483050; background: rgba(17,24,39,0.95); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid rgba(0,180,255,0.15); border-radius: 10px; padding: 10px 16px; max-width: 320px; pointer-events: none; animation: sm-tv-fade-in 0.2s ease; }',
      '#sm-tv-info strong { display: block; font-size: 16px; color: #e8ecf4; margin-bottom: 4px; font-weight: 600; }',
      '#sm-tv-info span { font-size: 13px; color: #6b7d9a; }',
      '@keyframes sm-tv-fade-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }',

      // ── Keyboard ──
      '#sm-tv-keyboard { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(680px, 85vw); padding: 28px 32px; background: linear-gradient(145deg, #131b2e 0%, #0d1420 100%); border: 1px solid rgba(0,180,255,0.2); border-radius: 24px; z-index: 2147483200; box-shadow: 0 0 0 100vmax rgba(0,0,0,0.75), 0 24px 80px rgba(0,0,0,0.6); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); }',
      '#sm-tv-keyboard h2 { font-size: 24px; margin: 0 0 16px; color: #e8ecf4; font-weight: 600; }',
      '#sm-tv-query { display: flex; align-items: center; padding: 14px 18px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; min-height: 52px; font-size: 22px; margin-bottom: 20px; position: relative; }',
      '.sm-tv-query-text { color: #e8ecf4; }',
      '.sm-tv-cursor { color: #00b4ff; animation: sm-tv-blink 1s step-end infinite; margin-left: 1px; font-weight: 300; }',
      '.sm-tv-placeholder { color: #3a4a60; position: absolute; left: 18px; pointer-events: none; }',
      '@keyframes sm-tv-blink { 50% { opacity: 0; } }',
      // Key grid
      '.sm-tv-keys { display: flex; flex-direction: column; gap: 6px; }',
      '.sm-tv-key-row { display: flex; justify-content: center; gap: 6px; }',
      '.sm-tv-key { min-width: 48px; height: 48px; padding: 0 12px; background: rgba(255,255,255,0.06); color: #c0cce0; border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; font-size: 18px !important; font-weight: 500; cursor: pointer; transition: all 0.15s ease; display: flex; align-items: center; justify-content: center; }',
      '.sm-tv-key.sm-tv-focus { background: #00b4ff !important; color: #0a0e1a !important; border-color: #00b4ff !important; box-shadow: 0 0 20px rgba(0,180,255,0.4) !important; outline: none !important; transform: scale(1.08); }',
      '.sm-tv-key-action { flex: 1; font-size: 15px !important; }',
      '.sm-tv-actions { margin-top: 8px; }',

      // ── Loading skeleton ──
      '@keyframes sm-tv-shimmer { 0% { background-position: -200px 0; } 100% { background-position: 200px 0; } }',
      '.sm-tv-loading { background: linear-gradient(90deg, #1a2236 25%, #243050 50%, #1a2236 75%); background-size: 400px 100%; animation: sm-tv-shimmer 1.5s ease infinite; border-radius: 12px; }',

      // ── Scrollbar ──
      '.sm-tv ::-webkit-scrollbar { width: 4px; height: 4px; }',
      '.sm-tv ::-webkit-scrollbar-track { background: transparent; }',
      '.sm-tv ::-webkit-scrollbar-thumb { background: rgba(0,180,255,0.2); border-radius: 2px; }',

      // ── Page transition ──
      '@keyframes sm-tv-page-in { from { opacity: 0; } to { opacity: 1; } }',
      'html.sm-tv body > *:not(#sm-tv-sidebar):not(#sm-tv-hint):not(#sm-tv-keyboard):not(#sm-tv-info) { animation: sm-tv-page-in 0.3s ease; }'

    ].join('\n');
    document.head.appendChild(style);
  }

  // ── Build sidebar ──
  function buildSidebar() {
    sidebar = document.createElement('nav');
    sidebar.id = 'sm-tv-sidebar';
    sidebar.setAttribute('aria-label', 'TV navigation');

    // Logo
    var logo = document.createElement('div');
    logo.className = 'sm-tv-logo';
    var logoIcon = document.createElement('span');
    logoIcon.className = 'sm-tv-logo-icon';
    logoIcon.textContent = '🎬';
    logo.appendChild(logoIcon);
    var logoText = document.createElement('span');
    logoText.className = 'sm-tv-logo-text';
    logoText.textContent = '7Movies';
    logo.appendChild(logoText);
    sidebar.appendChild(logo);

    // Separator
    var sep1 = document.createElement('div');
    sep1.className = 'sm-tv-sep';
    sidebar.appendChild(sep1);

    // Nav items
    var currentPath = location.pathname;
    NAV_ITEMS.forEach(function (item, idx) {
      var btn = document.createElement('button');
      btn.className = 'sm-tv-nav-btn';
      btn.type = 'button';
      if (item.href && item.href === currentPath) btn.classList.add('sm-tv-nav-active');
      if (item.href === '/' && currentPath === '/') btn.classList.add('sm-tv-nav-active');

      var icon = document.createElement('span');
      icon.className = 'sm-tv-nav-icon';
      icon.textContent = item.icon;
      btn.appendChild(icon);

      var label = document.createElement('span');
      label.className = 'sm-tv-nav-label';
      label.textContent = item.label;
      btn.appendChild(label);

      btn.onclick = function () {
        sidebarIdx = idx;
        if (item.label === 'Search') { closeSidebar(); triggerSearch(); }
        else if (item.label === 'Refresh') { location.reload(); }
        else { location.assign(item.href); }
      };
      sidebar.appendChild(btn);

      // Add separator before Search
      if (idx === 3) {
        var sep2 = document.createElement('div');
        sep2.className = 'sm-tv-sep';
        sidebar.appendChild(sep2);
      }
    });

    document.body.appendChild(sidebar);

    // Hovering sidebar icon area opens sidebar
    sidebar.addEventListener('mouseenter', function () { if (!sidebarOpen) openSidebar(); });
    sidebar.addEventListener('mouseleave', function () { if (sidebarOpen) closeSidebar(); });
  }

  // ── Init ──
  function init() {
    if (document.getElementById('sm-tv-sidebar')) return;
    document.documentElement.classList.add('sm-tv');

    injectStyles();
    buildSidebar();

    // Hint bar
    var h = document.createElement('div');
    h.id = 'sm-tv-hint';
    h.innerHTML = '<span>← Sidebar</span><span>↑↓←→ Navigate</span><span>OK Select</span><span>🔵 Search</span><span>Back Return</span>';
    document.body.appendChild(h);

    // Key handler
    document.addEventListener('keydown', keydown, true);

    // Track external focus events
    document.addEventListener('focusin', function (e) {
      if (visible(e.target) && !closest(e.target, '.topbar')) {
        if (selected) {
          selected.classList.remove('sm-tv-focus');
          selected.style.transform = '';
          selected.style.zIndex = '';
        }
        selected = e.target;
        selected.classList.add('sm-tv-focus');
      }
    }, true);

    // Mutation observer — pick up dynamic content
    var queued = false;
    new MutationObserver(function () {
      if (queued) return;
      queued = true;
      setTimeout(function () {
        queued = false;
        findSearchInput();
        // Clean up orphaned info previews
        var info = document.getElementById('sm-tv-info');
        if (info && selected && !document.documentElement.contains(selected)) {
          info.parentNode.removeChild(info);
        }
        // Refocus if selected element was removed
        if (!keyboard && selected && !document.documentElement.contains(selected)) {
          setFocus(collectFocusables()[0]);
        }
      }, 120);
    }).observe(document.body, { childList: true, subtree: true });

    // Initial focus on first content element
    setTimeout(function () {
      var list = collectFocusables();
      for (var i = 0; i < list.length; i++) {
        if (!closest(list[i], '#sm-tv-sidebar')) { setFocus(list[i]); break; }
      }
      hint('← Open sidebar · ↑↓←→ Navigate · OK Select · Blue Search', 6000);
    }, 500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
