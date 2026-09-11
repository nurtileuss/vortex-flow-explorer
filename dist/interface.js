'use strict';
const sidePanels=[...document.querySelectorAll('[data-side-panel]')];
let activePanel=null,panelTrigger=null;
const objectNotes={
  fly:['A fruit fly. Up close.','The NeuroMechFly fruit fly model, magnified to reveal its wings, legs and antennae. The flow uses a fixed side silhouette; the wings do not flap.'],
  car:['A Formula 1 car.','Open wheels, a low body and wings create a distinctive silhouette. Rotate the model to inspect the cockpit and suspension. The 2D flow study does not calculate downforce.'],
  plane:['An aircraft in flow.','A slender body separates the incoming flow. This study uses the side silhouette; it does not simulate lift from a three-dimensional wing.']
};
function updateAbout(){
  const aero=document.body.classList.contains('aero-active');
  document.querySelector('[data-about-vortex]').hidden=aero;
  document.querySelector('[data-about-aero]').hidden=!aero;
  const selected=document.querySelector('[data-object][aria-pressed="true"]')?.dataset.object??'fly';
  const note=objectNotes[selected]??objectNotes.fly;
  document.querySelector('[data-object-heading]').textContent=note[0];
  document.querySelector('[data-object-summary]').textContent=note[1];
}
function closePanel(restoreFocus=false){
  const previous=activePanel;
  activePanel=null;
  sidePanels.forEach(panel=>{
    if(!panel.hidden){panel.hidden=true;panel.open=false;panel.querySelector('video')?.pause();panel.dispatchEvent(new Event('close'));}
  });
  document.body.removeAttribute('data-open-panel');
  document.querySelectorAll('[data-panel]').forEach(button=>button.setAttribute('aria-expanded','false'));
  window.dispatchEvent(new Event('vortex-viewchange'));
  if(restoreFocus&&previous&&panelTrigger?.isConnected&&panelTrigger.getClientRects().length)panelTrigger.focus({preventScroll:true});
}
function openPanel(name,trigger){
  const panel=sidePanels.find(item=>item.dataset.sidePanel===name);
  if(!panel)return;
  const candidate=trigger??document.activeElement;
  closePanel();
  const navTrigger=document.querySelector('.masthead [data-panel="'+name+'"]');
  panelTrigger=candidate?.getClientRects().length?candidate:navTrigger?.getClientRects().length?navTrigger:document.querySelector('.masthead [data-panel="about"]');
  activePanel=name;
  updateAbout();panel.hidden=false;panel.open=true;
  panel.querySelector('.side-panel-content')?.scrollTo(0,0);
  document.body.dataset.openPanel=name;
  document.querySelectorAll('[data-panel]').forEach(button=>button.setAttribute('aria-expanded',String(button.dataset.panel===name)));
  panel.tabIndex=-1;panel.focus({preventScroll:true});
  if(name==='film'){panel.querySelector('video').play().catch(()=>{});}
  window.dispatchEvent(new Event('vortex-viewchange'));
}
document.querySelectorAll('[data-panel]').forEach(button=>button.addEventListener('click',()=>{
  if(button.dataset.panel==='controls'&&!document.body.classList.contains('explorer-mode')){startExploring();return;}
  if(activePanel===button.dataset.panel)closePanel(true);else openPanel(button.dataset.panel,button);
}));
sidePanels.forEach(panel=>panel.querySelector('[data-close-panel]').addEventListener('click',()=>closePanel(true)));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&activePanel){event.preventDefault();closePanel(true);}});
document.addEventListener('click',event=>{if(event.target.closest('[data-object]'))updateAbout();});
function applyExplorer(enabled,replay=false){
  if(enabled&&document.body.classList.contains('aero-active'))document.querySelector('[data-scene="vortex"]').click();
  document.body.classList.toggle('explorer-mode',enabled);
  document.querySelector('.scene-intro h1').textContent=enabled?'Flow Explorer.':'Anatomy of flow.';
  document.querySelector('[data-scene-subtitle]').textContent=enabled?'Change a parameter. See the difference.':'A visual study of fluid motion';
  document.querySelectorAll('[data-enter-explorer]').forEach(link=>{link.hidden=enabled;});
  document.querySelector('[data-exit-explorer]').hidden=!enabled;
  document.querySelector('.explorer-badge').hidden=!enabled;
  if(enabled)window.initializeVortex?.();
  window.vortexControls?.setExplorer(enabled);
  if(enabled)openPanel('controls',document.querySelector('.masthead [data-panel="controls"]'));
  else{closePanel();if(replay){window.vortexControls?.setFormationTime(0);window.vortexControls?.play();}}
  window.dispatchEvent(new Event('vortex-viewchange'));
}
function startExploring(){
  if(location.hash!=='#explore')history.pushState(null,'','#explore');
  applyExplorer(true);
}
document.querySelectorAll('[data-enter-explorer]').forEach(link=>link.addEventListener('click',event=>{
  event.preventDefault();startExploring();
}));
document.querySelector('[data-reset-parameters]').addEventListener('click',()=>{
  document.querySelector('[data-preset="balance"]').click();
});
document.querySelector('[data-exit-explorer]').addEventListener('click',()=>{
  history.pushState(null,'',location.pathname+location.search);applyExplorer(false,true);
});
window.addEventListener('popstate',()=>applyExplorer(location.hash==='#explore',location.hash!=='#explore'));
document.querySelectorAll('[data-scene]').forEach(button=>button.addEventListener('click',()=>{
  if(document.body.classList.contains('explorer-mode')){
    history.replaceState(null,'',location.pathname+location.search);applyExplorer(false,button.dataset.scene==='vortex');
  }
}));
window.initializeVortex?.();
window.addEventListener('DOMContentLoaded',()=>{if(location.hash==='#explore')applyExplorer(true);});
window.vortexUI={openPanel,closePanel};

const filmDialog=document.getElementById('film-dialog');
const film=filmDialog.querySelector('video');
const applyFilmRate=()=>{film.defaultPlaybackRate=film.playbackRate=document.querySelector('[data-film="cinema"]')?.getAttribute('aria-pressed')==='true'?1:0.55;};
applyFilmRate();
film.addEventListener('loadedmetadata',applyFilmRate);
const films={
  formation:{src:'assets/vortex-formation-web.mp4',poster:'assets/vortex-formation-poster.jpg',caption:'A cinematic reveal of the paths with a camera orbit. An artistic animation of the geometry.'},
};
document.querySelectorAll('[data-film]').forEach(button=>button.addEventListener('click',()=>{
  const selected=films[button.dataset.film];if(!selected)return;
  document.querySelectorAll('[data-film]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
  film.pause();film.src=selected.src;film.poster=selected.poster;film.load();applyFilmRate();filmDialog.querySelector('.film-caption').textContent=selected.caption;
  film.play().catch(()=>{});
}));

// Progressive enhancement: the same visible controls can be used by supported agents.
if(document.modelContext?.registerTool){
  const duration=window.vortexControls?.duration ?? 30;
  const lifecycle=new AbortController();
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  const state=()=>{if(!window.vortexControls)throw new Error('The 3D view is unavailable');return window.vortexControls;};
  const register=tool=>{try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
  register({name:'read_vortex_state',title:'Read vortex parameters',description:'Read the current parameters, camera view and formation time without changing anything.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:input=>{if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw new Error('Expected an empty object');return state().getState();}});
  register({name:'configure_vortex',title:'Configure the vortex',description:'Change only the local interactive vortex: rotation, stretching, viscosity, camera view or the 0–30 second geometry reveal. No files or remote data are changed.',inputSchema:{type:'object',properties:{spin:{type:'number',minimum:0.2,maximum:1.8},stretch:{type:'number',minimum:0.45,maximum:2},viscosity:{type:'number',minimum:0.35,maximum:2.5},view:{type:'string',enum:['angle','front','top']},formationTime:{type:'number',minimum:0,maximum:duration}},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:async input=>{
    if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Expected a parameter object');
    const limits={spin:[0.2,1.8],stretch:[0.45,2],viscosity:[0.35,2.5],formationTime:[0,duration]};
    for(const [key,value]of Object.entries(input)){
      if(key==='view'){if(!['angle','front','top'].includes(value))throw new Error('Invalid camera view');}
      else if(!Object.hasOwn(limits,key)||typeof value!=='number'||!Number.isFinite(value)||value<limits[key][0]||value>limits[key][1])throw new Error('Invalid parameter');
    }
    const api=state();
    for(const key of ['spin','stretch','viscosity'])if(Object.hasOwn(input,key))api.setParameter(key,input[key]);
    if(Object.hasOwn(input,'formationTime'))api.setFormationTime(input.formationTime);
    if(Object.hasOwn(input,'view'))api.setView(input.view);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return api.getState();
  }});
}
