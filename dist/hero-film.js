'use strict';
(() => {
  const video=document.querySelector('[data-hero-video]');
  if(!video)return;
  const stage=document.querySelector('.hero-cinema');
  const playButton=document.querySelector('[data-hero-play]');
  const timeline=document.querySelector('[data-hero-time]');
  const output=document.querySelector('[data-hero-clock]');
  const chapter=document.querySelector('[data-hero-chapter]');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let active=location.hash!=='#explore',suspended=false,wanted=!reduced,resumeAfterSeek=false,scrubbing=false,buffering=false;
  video.muted=true;video.defaultMuted=true;video.playbackRate=1;
  const isPlaying=()=>active&&!suspended&&!buffering&&!video.paused&&!video.ended;
  const notify=(seek=false)=>window.dispatchEvent(new CustomEvent('hero-playback',{detail:{playing:isPlaying(),time:video.currentTime,seek}}));
  const format=value=>`00:${String(Math.floor(value||0)).padStart(2,'0')}`;
  function update(){
    const duration=Number.isFinite(video.duration)?video.duration:30;
    timeline.max=String(duration);timeline.value=String(video.currentTime);
    output.textContent=`${format(video.currentTime)} / ${format(duration)}`;
    playButton.textContent=video.ended?'↺ Replay':video.paused?'▶ Play':'Ⅱ Pause';
    playButton.setAttribute('aria-pressed',String(!video.paused));
    const time=video.currentTime;
    chapter.textContent=time<4?'From particles to motion.':time<16?'The spiral takes shape.':time<26?'Motion has a structure.':'Explore the flow in 3D.';
  }
  function sync(){
    if(active&&!suspended&&wanted&&!document.hidden&&!video.ended){
      video.play().catch(()=>{update();notify();});
    }else video.pause();
    update();notify();
  }
  function replay(){wanted=true;video.currentTime=0;notify(true);sync();}
  playButton.addEventListener('click',()=>{if(video.ended)replay();else{wanted=video.paused;sync();}});
  document.querySelector('[data-hero-replay]').addEventListener('click',replay);
  timeline.addEventListener('pointerdown',()=>{scrubbing=true;resumeAfterSeek=wanted;video.pause();});
  timeline.addEventListener('input',()=>{const time=Number(timeline.value);if(Number.isFinite(time)){video.currentTime=Math.max(0,Math.min(video.duration||30,time));update();notify(true);}});
  function finishSeek(){if(!scrubbing)return;scrubbing=false;wanted=resumeAfterSeek;resumeAfterSeek=false;sync();}
  window.addEventListener('pointerup',finishSeek);window.addEventListener('pointercancel',finishSeek);
  timeline.addEventListener('change',()=>{if(!scrubbing)sync();});
  for(const type of ['play','playing','pause','ended','loadedmetadata'])video.addEventListener(type,()=>{update();notify();});
  video.addEventListener('timeupdate',update);
  video.addEventListener('playing',()=>{buffering=false;stage.dataset.loaded='true';delete stage.dataset.buffering;notify();});
  video.addEventListener('waiting',()=>{buffering=true;stage.dataset.buffering='true';notify();});
  video.addEventListener('canplay',()=>{buffering=false;delete stage.dataset.buffering;notify();});
  video.addEventListener('error',()=>{chapter.textContent='The film could not load. Open Explore in 3D.';});
  document.addEventListener('visibilitychange',sync);
  window.addEventListener('pagehide',()=>video.pause());
  window.addEventListener('pageshow',sync);
  window.vortexHero={setActive:value=>{active=value;sync();},setSuspended:value=>{suspended=value;sync();},play:()=>{if(video.ended)replay();else{wanted=true;sync();}},replay,getState:()=>({active,suspended,wanted,playing:isPlaying(),time:video.currentTime})};
  update();sync();
})();
