import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const appDir=process.cwd();
const rootDir=path.resolve(appDir,'..');
const canonical=[
  'mousetrap_script_data.json',
  'mousetrap_line_translations.json',
  'mousetrap_line_vocabulary.json',
  'mousetrap_line_grammar.json',
  'mousetrap_word_dictionary.json'
];
const bytes=new Map(canonical.map(name=>[name,fs.readFileSync(path.join(rootDir,name))]));
bytes.set('pwa-version.json',fs.readFileSync(path.join(appDir,'pwa-version.json')));

class FakeClassList{
  constructor(){this.values=new Set()}
  add(...v){v.forEach(x=>this.values.add(x))}
  remove(...v){v.forEach(x=>this.values.delete(x))}
  toggle(v,on){if(on===undefined)on=!this.values.has(v);on?this.values.add(v):this.values.delete(v);return on}
}
class FakeElement{
  constructor(id=''){this.id=id;this.hidden=false;this.textContent='';this.innerHTML='';this.classList=new FakeClassList();this.onclick=null;this.contentWindow={postMessage(){}}}
  querySelector(){return new FakeElement('query')}
  querySelectorAll(){return[]}
  addEventListener(){}
  replaceChildren(){}
  scrollIntoView(){}
}
const elements=new Map();
const element=id=>{if(!elements.has(id))elements.set(id,new FakeElement(id));return elements.get(id)};
const document={
  getElementById:id=>element(id),
  querySelector:()=>new FakeElement('doc-query'),
  querySelectorAll:()=>[],
  createElement:tag=>new FakeElement(tag),
  head:{appendChild(){}},
  body:new FakeElement('body')
};
const local=new Map();
const localStorage={getItem:k=>local.has(k)?local.get(k):null,setItem:(k,v)=>local.set(k,String(v)),removeItem:k=>local.delete(k)};
const location={href:'https://example.test/mousetrap-script-trainer/',hash:'#/home'};
const history={replaceState(_a,_b,url){if(typeof url==='string'&&url.includes('#'))location.hash=url.slice(url.indexOf('#'))}};
const listeners=new Map();
const windowObj={
  document,localStorage,location,history,
  addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn)},
  dispatchEvent(){return true},
  matchMedia(){return{matches:false}}
};
const fetchMock=async input=>{
  const raw=typeof input==='string'?input:input?.url||'';
  const url=new URL(raw,location.href);
  const name=url.pathname.split('/').pop();
  const body=bytes.get(name);
  if(!body)return new Response('not found',{status:404});
  return new Response(body,{status:200,headers:{'content-type':'application/json; charset=utf-8'}});
};
const context={
  window:windowObj,document,localStorage,location,history,
  fetch:fetchMock,Response,Request,Headers,URL,URLSearchParams,AbortController,
  crypto:webcrypto,console,setTimeout,clearTimeout,setInterval,clearInterval,
  TextEncoder,TextDecoder,structuredClone,
  CustomEvent:class CustomEvent{constructor(type,init={}){this.type=type;this.detail=init.detail}},
};
windowObj.window=windowObj;
windowObj.fetch=fetchMock;
windowObj.Response=Response;
windowObj.Request=Request;
windowObj.Headers=Headers;
windowObj.URL=URL;
windowObj.URLSearchParams=URLSearchParams;
windowObj.AbortController=AbortController;
windowObj.crypto=webcrypto;
windowObj.console=console;
windowObj.setTimeout=setTimeout;
windowObj.clearTimeout=clearTimeout;
windowObj.CustomEvent=context.CustomEvent;
Object.assign(context,windowObj);
context.globalThis=context;
context.window=context;
vm.createContext(context);

vm.runInContext(fs.readFileSync(path.join(appDir,'p6_private_data.js'),'utf8'),context,{filename:'p6_private_data.js'});
vm.runInContext(fs.readFileSync(path.join(appDir,'p5_app.js'),'utf8'),context,{filename:'p5_app.js'});

const gate=element('dataGate');
const status=element('gateStatus');
const app=element('app');
const deadline=Date.now()+5000;
while(Date.now()<deadline&&(!gate.hidden||context.MTS_P5_QA?.status!=='PASS'))await new Promise(r=>setTimeout(r,20));

if(context.MTS_P5_QA?.status!=='PASS')throw new Error(`startup QA did not PASS: ${status.textContent}`);
if(!gate.hidden)throw new Error(`data gate remained visible after successful load: ${status.textContent}`);
if(!app.innerHTML.includes('台本を覚える')||!app.innerHTML.includes('The Mousetrap Trainer'))throw new Error('Home UI was not rendered after canonical data load');
if(context.MTS_PRIVATE_DATA?.version!==6)throw new Error(`resolver version ${context.MTS_PRIVATE_DATA?.version}/6`);
const metrics=context.MTS_PRIVATE_DATA.getMetrics();
if(metrics.networkVerified!==5)throw new Error(`network verified ${metrics.networkVerified}/5`);

console.log(JSON.stringify({status:'PASS',gateHidden:gate.hidden,homeRendered:true,qa:context.MTS_P5_QA.status,resolverVersion:context.MTS_PRIVATE_DATA.version,networkVerified:metrics.networkVerified},null,2));
