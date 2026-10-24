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

/* Remote-first TV presentation for 7Movies. ES5; no external dependencies. */
(function () {
  'use strict';
  var host = location.hostname;
  var preview = /^(localhost|127\.0\.0\.1)$/.test(host) && document.documentElement.hasAttribute('data-tv-preview');
  if (host !== '7movies.ac' && host !== 'www.7movies.ac' && !preview) return;
  if (window.__sevenMoviesTV) return;
  var api = { version: '0.2.0' }; window.__sevenMoviesTV = api;
  var bar, keyboard, editing, selected, last, searchPending = false, backAt = 0;
  var selector = 'a[href],button,input,select,textarea,[role="button"],[role="tab"],[tabindex="0"]';
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
  function candidates() {
    var root = keyboard || modal() || document;
    var all = root.querySelectorAll(selector), result = [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (!visible(el) || el.getAttribute('tabindex') === '-1' || closest(el, '.topbar,.rail-arrow,footer,.hero-dots')) continue;
      // Each poster is a single remote target, not its nested watchlist controls.
      var card = closest(el.parentElement, '[data-navigation-href],[data-media-card]');
      if (card) continue;
      result.push(el);
    }
    return result;
  }
  function focus(el) {
    if (!el) return;
    if (selected) selected.classList.remove('sm-tv-focus');
    selected = el; el.classList.add('sm-tv-focus');
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    try { el.focus({ preventScroll: true }); } catch (ignore) { el.focus(); }
    // Old Tizen supports the boolean form of scrollIntoView. Scroll only the
    // overflowing ancestors, preserving horizontal rows and the page position.
    var p = el.parentElement;
    while (p && p !== document.body && p !== document.documentElement) {
      var r = el.getBoundingClientRect(), b = p.getBoundingClientRect();
      if (p.scrollWidth > p.clientWidth + 4 && /auto|scroll/.test(getComputedStyle(p).overflowX)) {
        if (r.left < b.left + 12) p.scrollLeft -= b.left + 12 - r.left;
        if (r.right > b.right - 12) p.scrollLeft += r.right - b.right + 12;
      }
      if (p.scrollHeight > p.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(p).overflowY)) {
        if (r.top < b.top + 12) p.scrollTop -= b.top + 12 - r.top;
        if (r.bottom > b.bottom - 12) p.scrollTop += r.bottom - b.bottom + 12;
      }
      p = p.parentElement;
    }
    if (!closest(el, '#sm-tv-bar,#sm-tv-keyboard')) {
      var box = el.getBoundingClientRect();
      if (box.top < 116) window.scrollBy(0, box.top - 136);
      else if (box.bottom > window.innerHeight - 60) window.scrollBy(0, box.bottom - window.innerHeight + 80);
    }
  }
  function nextInDirection(current, list, code) {
    if (!current || !visible(current)) return list[0];
    var a = current.getBoundingClientRect(), ax = (a.left+a.right)/2, ay=(a.top+a.bottom)/2;
    var horizontal = code === 37 || code === 39, positive = code === 39 || code === 40;
    var best = null, score = Infinity;
    for (var i=0;i<list.length;i++) {
      if(list[i]===current) continue;
      var b=list[i].getBoundingClientRect(), dx=(b.left+b.right)/2-ax, dy=(b.top+b.bottom)/2-ay;
      var main=horizontal?dx:dy, cross=Math.abs(horizontal?dy:dx);
      if ((positive?main:-main) < 4) continue;
      var aligned=horizontal?(b.bottom>a.top+4&&b.top<a.bottom-4):(b.right>a.left+4&&b.left<a.right-4);
      var value=Math.abs(main)+cross*3+(aligned?0:10000);
      if(value<score){score=value;best=list[i];}
    }
    return best;
  }
  api.nextInDirection = nextInDirection;
  function hint(text) { var el=document.getElementById('sm-tv-hint'); if(el) el.textContent=text; }
  function setValue(input, value) {
    var proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var desc=Object.getOwnPropertyDescriptor(proto,'value');
    if(desc&&desc.set)desc.set.call(input,value); else input.value=value;
    var ev=document.createEvent('Event');ev.initEvent('input',true,false);input.dispatchEvent(ev);
    ev=document.createEvent('Event');ev.initEvent('change',true,false);input.dispatchEvent(ev);
  }
  function closeKeyboard() {
    if(!keyboard)return;
    keyboard.parentNode.removeChild(keyboard);keyboard=null;
    var target=editing;editing=null;
    focus(visible(target)?target:bar.querySelector('button'));
  }
  function openKeyboard(input) {
    if(keyboard||!input)return;
    last=selected;editing=input; input.blur();
    keyboard=document.createElement('section');keyboard.id='sm-tv-keyboard';keyboard.setAttribute('role','dialog');keyboard.setAttribute('aria-label','TV keyboard');
    var title=document.createElement('h2');title.textContent='Search movies & TV';keyboard.appendChild(title);
    var display=document.createElement('div');display.id='sm-tv-query';display.textContent=input.value||'Type with your remote';keyboard.appendChild(display);
    var keys='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('').concat(['Space','Delete','Clear','Done']);
    var grid=document.createElement('div');grid.className='sm-tv-keys';keyboard.appendChild(grid);
    keys.forEach(function(key){var b=document.createElement('button');b.textContent=key;b.type='button';b.onclick=function(){
      if(key==='Done'){closeKeyboard();return;}
      var value=editing.value;
      value=key==='Delete'?value.slice(0,-1):key==='Clear'?'':value+(key==='Space'?' ':key.toLowerCase());
      setValue(editing,value);display.textContent=value||'Type with your remote';
    };grid.appendChild(b);});
    document.body.appendChild(keyboard);focus(grid.querySelector('button'));
  }
  function search() {
    var buttons=document.querySelectorAll('button[aria-label="Search"]');
    searchPending=true;
    for(var i=0;i<buttons.length;i++) if(!closest(buttons[i],'#sm-tv-bar')){buttons[i].click();break;}
    findSearch();
    window.setTimeout(function(){if(searchPending){searchPending=false;hint('Search did not load. Use Refresh to retry.');}},8000);
  }
  function findSearch() {
    if(!searchPending)return;
    var inputs=document.querySelectorAll('input[type="search"],input[placeholder],input[aria-label]');
    for(var i=0;i<inputs.length;i++) {
      var label=(inputs[i].getAttribute('placeholder')||'')+' '+(inputs[i].getAttribute('aria-label')||'');
      if(visible(inputs[i])&&(/search/i.test(label)||inputs[i].type==='search')){searchPending=false;openKeyboard(inputs[i]);return;}
    }
  }
  function goBack() {
    if(keyboard){closeKeyboard();return;}
    var dialog=modal();
    if(dialog){var close=dialog.querySelector('button[aria-label*="Close"],button[aria-label*="close"]');if(close){close.click();return;}}
    if(location.pathname!=='/'){window.history.back();return;}
    if(window.history.state && typeof window.history.state.homeSearch === 'string'){location.assign('/');return;}
    if(Date.now()-backAt<1800){try{tizen.application.getCurrentApplication().exit();}catch(ignore){hint('Close this browser tab to exit.');}return;}
    backAt=Date.now();focus(bar.querySelector('button'));hint('Press Back again to exit · Arrows move · OK selects');
  }
  function keydown(e) {
    var code=e.keyCode||e.which;
    if([37,38,39,40,13,10009,27,8,415,19,10252,417,412].indexOf(code)<0)return;
    // A physical keyboard can edit the site input normally. OK opens our TV keyboard.
    if(!keyboard&&closest(e.target,'input,textarea')&&code===8)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(code===10009||code===27||code===8){goBack();return;}
    if(code>=37&&code<=40){
      var list=candidates(), next=nextInDirection(selected,list,code);
      if(next)focus(next);else if(code===40&&!keyboard)window.scrollBy(0,Math.round(innerHeight*0.6));
      return;
    }
    if(code===13){
      if(!selected||!visible(selected)){focus(candidates()[0]);return;}
      if(/^(INPUT|TEXTAREA)$/.test(selected.tagName)){openKeyboard(selected);return;}
      selected.click();return;
    }
    var video=document.querySelector('video');
    if(video){
      if(code===415)video.play();else if(code===19)video.pause();else if(code===10252){if(video.paused)video.play();else video.pause();}
      else if(code===417||code===412)video.currentTime=Math.max(0,video.currentTime+(code===417?10:-10));
    }
  }
  function init() {
    if(document.getElementById('sm-tv-bar'))return;
    document.documentElement.classList.add('sm-tv');
    var style=document.createElement('style');style.id='sm-tv-style';
    style.textContent='html.sm-tv{scroll-padding-top:130px}html.sm-tv body{background:#0b1020!important;color:#f5f7ff;font-family:Arial,sans-serif!important;padding-top:110px!important;padding-bottom:48px!important}'+
    '.sm-tv .topbar,.sm-tv footer,.sm-tv .hero-dots,.sm-tv .rail-arrow{display:none!important}.sm-tv .hero{min-height:420px!important;max-height:580px!important}.sm-tv .rail{margin:28px 0!important}.sm-tv .rail h3{font-size:30px!important}.sm-tv .card-row{padding:16px!important}.sm-tv .media-card{min-width:180px!important}.sm-tv .card-watchlist{display:none!important}'+
    '.sm-tv button,.sm-tv input,.sm-tv select{font-size:22px!important}.sm-tv .sm-tv-focus{outline:4px solid #64dcff!important;outline-offset:4px!important;box-shadow:0 0 24px rgba(100,220,255,.45)!important;position:relative;z-index:5;border-radius:10px}.sm-tv .sm-tv-focus img{filter:brightness(1.12)}'+
    '#sm-tv-bar{position:fixed;top:0;left:0;right:0;height:98px;z-index:2147483000;background:#111a30;border-bottom:1px solid #34415f;display:flex;align-items:center;padding:0 36px}#sm-tv-bar strong{font-size:30px;margin-right:32px;color:#64dcff;white-space:nowrap}#sm-tv-bar button{background:transparent;color:#eef5ff;border:0;border-radius:8px;padding:15px 20px;margin:0 5px;font-size:22px}#sm-tv-bar button.sm-tv-focus{background:#24476a}'+
    '#sm-tv-hint{position:fixed;bottom:0;left:0;right:0;height:38px;padding:9px 30px;background:#111a30;color:#a9bad7;font-size:17px;z-index:2147483000;pointer-events:none}'+
    '#sm-tv-keyboard{position:fixed;top:12%;left:15%;width:70%;padding:28px;background:#15213a;border:2px solid #64dcff;border-radius:18px;z-index:2147483100;box-shadow:0 0 0 100vmax rgba(0,0,0,.8)}#sm-tv-keyboard h2{font-size:30px;margin:0 0 12px}#sm-tv-query{padding:16px;background:#080d18;min-height:58px;font-size:26px;margin-bottom:18px;overflow-wrap:break-word}.sm-tv-keys{display:flex;flex-wrap:wrap}.sm-tv-keys button{width:9%;height:55px;margin:.5%;background:#293d5e;color:white;border:0;border-radius:6px;font-size:23px!important}';
    document.head.appendChild(style);
    bar=document.createElement('nav');bar.id='sm-tv-bar';bar.setAttribute('aria-label','TV navigation');
    var brand=document.createElement('strong');brand.textContent='7Movies TV';bar.appendChild(brand);
    [['Home','/'],['Movies','/movies'],['TV shows','/tv'],['Discover','/discover'],['Search',null],['Refresh',null]].forEach(function(item){
      var b=document.createElement('button');b.textContent=item[0];b.type='button';
      b.onclick=function(){if(item[0]==='Search')search();else if(item[0]==='Refresh')location.reload();else location.assign(item[1]);};bar.appendChild(b);
    });
    document.body.appendChild(bar);var h=document.createElement('div');h.id='sm-tv-hint';h.textContent='Arrows move · OK selects · Search opens keyboard · Back returns';document.body.appendChild(h);
    document.addEventListener('keydown',keydown,true);
    document.addEventListener('focusin',function(e){if(visible(e.target)&&!closest(e.target,'.topbar')){if(selected)selected.classList.remove('sm-tv-focus');selected=e.target;selected.classList.add('sm-tv-focus');}},true);
    var queued=false;
    new MutationObserver(function(){if(queued)return;queued=true;setTimeout(function(){queued=false;findSearch();if(!keyboard&&selected&&!document.documentElement.contains(selected))focus(candidates()[0]);},120);}).observe(document.body,{childList:true,subtree:true});
    focus(bar.querySelector('button'));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
