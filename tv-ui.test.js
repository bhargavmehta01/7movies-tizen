const {JSDOM}=require('jsdom');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const dom=new JSDOM('<html><head></head><body><header class="topbar"><button aria-label="Search">Search</button></header><main><button id="movie">Movie</button></main></body></html>',{url:'https://7movies.ac/',runScripts:'outside-only'});
const w=dom.window;
w.scrollBy=function(){};
w.HTMLElement.prototype.getBoundingClientRect=function(){return {left:20,top:150,right:120,bottom:200,width:100,height:50};};
w.document.querySelector('[aria-label="Search"]').onclick=function(){var i=w.document.createElement('input');i.type='search';i.placeholder='Search movies';w.document.querySelector('main').appendChild(i);};
w.eval(fs.readFileSync(path.join(__dirname,'tv-ui.js'),'utf8'));
w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
assert.ok(w.document.getElementById('sm-tv-bar'));
assert.equal(w.document.activeElement.textContent,'Home');
function rect(x,y){return {disabled:false,getAttribute(){return null},nodeType:0,getBoundingClientRect(){return {left:x,top:y,right:x+100,bottom:y+50,width:100,height:50};}};}
// Use real elements so getComputedStyle also works.
function tile(x,y){let el=w.document.createElement('button');w.document.body.appendChild(el);el.getBoundingClientRect=()=>({left:x,top:y,right:x+100,bottom:y+50,width:100,height:50});return el;}
const a=tile(0,0),b=tile(150,0),c=tile(0,100),d=tile(150,100);
const next=w.__sevenMoviesTV.nextInDirection;
assert.equal(next(a,[a,b,c,d],39),b);assert.equal(next(a,[a,b,c,d],40),c);assert.equal(next(d,[a,b,c,d],38),b);assert.equal(next(d,[a,b,c,d],37),c);
const search=Array.from(w.document.querySelectorAll('#sm-tv-bar button')).find(b=>b.textContent==='Search');search.click();
assert.ok(w.document.getElementById('sm-tv-keyboard'));
function key(label){Array.from(w.document.querySelectorAll('.sm-tv-keys button')).find(b=>b.textContent===label).click();}
key('A');key('B');key('Space');key('C');assert.equal(w.document.querySelector('input').value,'ab c');
key('Delete');assert.equal(w.document.querySelector('input').value,'ab ');
key('Clear');assert.equal(w.document.querySelector('input').value,'');
key('D');key('Done');assert.equal(w.document.getElementById('sm-tv-keyboard'),null);assert.equal(w.document.activeElement,w.document.querySelector('input'));
w.document.dispatchEvent(new w.KeyboardEvent('keydown',{keyCode:13,bubbles:true}));assert.ok(w.document.getElementById('sm-tv-keyboard'));
w.document.dispatchEvent(new w.KeyboardEvent('keydown',{keyCode:10009,bubbles:true}));assert.equal(w.document.getElementById('sm-tv-keyboard'),null);
w.eval(fs.readFileSync(path.join(__dirname,'tv-ui.js'),'utf8'));assert.equal(w.document.querySelectorAll('#sm-tv-bar').length,1);
w.close();console.log('Passed: TV toolbar, directional navigation, remote keyboard typing/delete/clear/done, Enter and Back, duplicate injection.');
