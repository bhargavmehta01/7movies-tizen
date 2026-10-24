const {JSDOM}=require('jsdom');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');

// Set up a minimal 7movies-like DOM
const dom=new JSDOM('<html><head></head><body><header class="topbar"><button aria-label="Search">Search</button></header><main><button id="movie">Movie</button></main></body></html>',{url:'https://7movies.ac/',runScripts:'outside-only'});
const w=dom.window;
w.scrollBy=function(){};
w.scrollTo=function(){};
w.HTMLElement.prototype.getBoundingClientRect=function(){return {left:120,top:150,right:220,bottom:200,width:100,height:50};};
w.document.querySelector('[aria-label="Search"]').onclick=function(){
  var i=w.document.createElement('input');
  i.type='search';
  i.placeholder='Search movies';
  w.document.querySelector('main').appendChild(i);
};

// Load the TV UI
w.eval(fs.readFileSync(path.join(__dirname,'tv-ui.js'),'utf8'));
w.document.dispatchEvent(new w.Event('DOMContentLoaded'));

// 1. Sidebar should be created
assert.ok(w.document.getElementById('sm-tv-sidebar'), 'Sidebar should exist');

// 2. Sidebar should have nav buttons
const navBtns = w.document.querySelectorAll('.sm-tv-nav-btn');
assert.ok(navBtns.length >= 6, 'Should have at least 6 nav buttons');

// 3. Check sidebar has correct labels
const labels = Array.from(navBtns).map(b => b.querySelector('.sm-tv-nav-label').textContent);
assert.ok(labels.indexOf('Home') >= 0, 'Should have Home');
assert.ok(labels.indexOf('Search') >= 0, 'Should have Search');
assert.ok(labels.indexOf('Movies') >= 0, 'Should have Movies');

// 4. Directional navigation
function tile(x,y){
  let el=w.document.createElement('button');
  w.document.body.appendChild(el);
  el.getBoundingClientRect=()=>({left:x,top:y,right:x+100,bottom:y+50,width:100,height:50});
  return el;
}
const a=tile(120,200),b=tile(270,200),c=tile(120,300),d=tile(270,300);
const next=w.__sevenMoviesTV.nextInDirection;
assert.equal(next(a,[a,b,c,d],39),b,'Right should go to b');
assert.equal(next(a,[a,b,c,d],40),c,'Down should go to c');
assert.equal(next(d,[a,b,c,d],38),b,'Up from d should go to b');
assert.equal(next(d,[a,b,c,d],37),c,'Left from d should go to c');

// 5. Search button opens keyboard
const searchBtn = Array.from(navBtns).find(b => b.querySelector('.sm-tv-nav-label').textContent === 'Search');
searchBtn.click();
assert.ok(w.document.getElementById('sm-tv-keyboard'), 'Keyboard should open after search');

// 6. Keyboard typing
function key(label){
  const keys = Array.from(w.document.querySelectorAll('.sm-tv-key'));
  const btn = keys.find(b => {
    const text = b.textContent.trim();
    const dataKey = b.getAttribute('data-key');
    const dataAction = b.getAttribute('data-action');
    return dataKey === label || text === label || dataAction === label;
  });
  assert.ok(btn, 'Key "' + label + '" should exist');
  btn.click();
}
key('A'); key('B');
// Use action labels for Space
const spaceBtn = Array.from(w.document.querySelectorAll('.sm-tv-key')).find(b => b.getAttribute('data-action') === 'space');
spaceBtn.click();
key('C');
assert.equal(w.document.querySelector('input').value, 'ab c', 'Typing ABC with space');

// 7. Delete
const deleteBtn = Array.from(w.document.querySelectorAll('.sm-tv-key')).find(b => b.getAttribute('data-action') === 'delete');
deleteBtn.click();
assert.equal(w.document.querySelector('input').value, 'ab ', 'Delete should remove last char');

// 8. Clear
const clearBtn = Array.from(w.document.querySelectorAll('.sm-tv-key')).find(b => b.getAttribute('data-action') === 'clear');
clearBtn.click();
assert.equal(w.document.querySelector('input').value, '', 'Clear should empty');

// 9. Done closes keyboard
key('D');
const doneBtn = Array.from(w.document.querySelectorAll('.sm-tv-key')).find(b => b.getAttribute('data-action') === 'done');
doneBtn.click();
assert.equal(w.document.getElementById('sm-tv-keyboard'), null, 'Done should close keyboard');

// 10. Enter on input re-opens keyboard
assert.equal(w.document.activeElement, w.document.querySelector('input'), 'Focus should be on input after Done');
w.document.dispatchEvent(new w.KeyboardEvent('keydown', {keyCode: 13, bubbles: true}));
assert.ok(w.document.getElementById('sm-tv-keyboard'), 'Enter on input should reopen keyboard');

// 11. Back closes keyboard
w.document.dispatchEvent(new w.KeyboardEvent('keydown', {keyCode: 10009, bubbles: true}));
assert.equal(w.document.getElementById('sm-tv-keyboard'), null, 'Back should close keyboard');

// 12. No duplicate injection
w.eval(fs.readFileSync(path.join(__dirname, 'tv-ui.js'), 'utf8'));
assert.equal(w.document.querySelectorAll('#sm-tv-sidebar').length, 1, 'Should not duplicate sidebar');

// 13. Hint bar exists
assert.ok(w.document.getElementById('sm-tv-hint'), 'Hint bar should exist');

// 14. Styles injected
assert.ok(w.document.getElementById('sm-tv-style'), 'Style tag should exist');

w.close();
console.log('Passed: Sidebar nav, directional navigation, QWERTY keyboard typing/delete/clear/done, Enter/Back, focus management, duplicate injection guard, hint bar, styles.');
