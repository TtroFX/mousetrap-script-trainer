import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const appDir=process.cwd();
const rootDir=path.resolve(appDir,'..');
const canonical=['mousetrap_script_data.json','mousetrap_line_translations.json','mousetrap_line_vocabulary.json','mousetrap_line_grammar.json','mousetrap_word_dictionary.json'];
const bytes=new Map(canonical.map(name=>[name,fs.readFileSync(path.join(rootDir,name))]));
class FakeClassList{constructor(){this.values=new Set()}add(...v){v.forEach(x=>this.values.add(x))}remove(...v){v.forEach(x=>this.values.delete(x))}toggle(v,on){if(on===undefined)on=!this.values.has(v);on?this.values.add(v):this.values.delete(v);return on}}
class FakeElement{constructor(id=''){this.id=id;this.hidden=false;this.textContent='';this.innerHTML='';this.classList=new FakeClassList();this.onclick=null;this.contentWindow={postMessage(){}};this.children=[]}querySelector(){return new FakeElement('query')}querySelectorAll(){return[]}addEventListener(){}replaceChildren(...v){this.children=v;this.textContent=''}append(...v){this.children.push(...v)}appendChild(v){this.children.push(v)}scrollIntoView(){}}
const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,new FakeElement(id));return elements.get(id)};
const document={getElementById:id=>element(id),querySelector:()=>new FakeElement('doc-query'),querySelectorAll:()=>[],createElement:tag=>new FakeElement(tag),head:{appendChild(){}},body:new FakeElement('body')};
const local=new Map();const localStorage={getItem:k=>local.has(k)?local.get(k):null,setItem:(k,v)=>local.set(k,String(v)),removeItem:k=>local.delete(k)};
const location={href:'https://example.test/mousetrap-script-trainer/',hash:'#/home'};const history={replaceState(_a,_b,url){if(typeof url==='string'&&url.includes('#'))location.hash=url.slice(url.indexOf('#'))}};
const listeners=new Map();const windowObj={document,localStorage,location,history,addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn)},dispatchEvent(){return true},matchMedia(){return{matches:false}}};
let fetches=0;const fetchMock=async input=>{const raw=typeof input==='string'?input:input?.url||'';const url=new URL(raw,location.href);const name=url.pathname.split('/').pop();const body=bytes.get(name);fetches++;if(!body)return new Response('not found',{status:404});return new Response(body,{status:200,headers:{'content-type':'application/json; charset=utf-8'}})};
const context={window:windowObj,document,localStorage,location,history,fetch:fetchMock,Response,Request,Headers,URL,URLSearchParams,console,setTimeout,clearTimeout,setInterval,clearInterval,TextEncoder,TextDecoder,structuredClone};windowObj.window=windowObj;Object.assign(context,windowObj);context.globalThis=context;context.window=context;vm.createContext(context);
const index=fs.readFileSync(path.join(appDir,'index.html'),'utf8');if(!index.includes('台本を覚える'))throw new Error('initial Home is not present in index.html');if(index.includes('dataGate')||index.includes('Production Data'))throw new Error('legacy full-screen data gate remains in index.html');
vm.runInContext(fs.readFileSync(path.join(appDir,'p5_app.js'),'utf8'),context,{filename:'p5_app.js'});
const app=element('app'),dataStatus=element('dataStatus');const deadline=Date.now()+5000;while(Date.now()<deadline&&context.MTS_P5_QA?.status!=='PASS')await new Promise(r=>setTimeout(r,20));
if(context.MTS_P5_QA?.status!=='PASS')throw new Error('direct static JSON startup did not PASS');if(fetches!==5)throw new Error(`expected exactly 5 canonical fetches, got ${fetches}`);if(!dataStatus.hidden)throw new Error('data error banner visible after successful startup');if(!app.innerHTML.includes('台本を覚える')||!app.innerHTML.includes('The Mousetrap Trainer'))throw new Error('Home UI was not rendered after static JSON load');if(!context.MTS_SHARED_SCRIPT_DATA||Object.values(context.MTS_SHARED_SCRIPT_DATA).reduce((n,s)=>n+(s.speeches?.length||0),0)!==1164)throw new Error('1164 speeches are not available after startup');
console.log(JSON.stringify({status:'PASS',initialHome:true,directFetches:fetches,homeRendered:true,speeches:1164,fullScreenGate:false},null,2));
