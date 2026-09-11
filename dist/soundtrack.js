'use strict';
(() => {
  const audio=document.querySelector('[data-soundtrack]');
  const buttons=[...document.querySelectorAll('[data-sound-toggle]')];
  if(!audio||!buttons.length)return;
  const hero=document.querySelector('[data-hero-video]');
  const film=document.querySelector('#film-dialog video');
  const filmPanel=document.querySelector('#film-dialog');
  let enabled=true,unlocked=false,waiting=false,failed=false,pending=null;
  audio.volume=0.62;audio.muted=false;
  const hasSource=()=>Boolean(audio.getAttribute('src'));
  // The visible player owns the soundtrack; hidden WebGL events cannot stop it.
  function source(){
    if(filmPanel?.open)return {playing:!film.paused&&!film.ended&&!film.seeking&&film.readyState>=3,time:film.currentTime/film.playbackRate};
    if(document.body.classList.contains('aero-active'))return {playing:document.querySelector('[data-aero-play]')?.getAttribute('aria-pressed')==='true',time:audio.currentTime};
    if(document.body.classList.contains('explorer-mode'))return {playing:false,time:audio.currentTime};
    if(hero){const state=window.vortexHero?.getState();return {playing:state?.playing===true,time:hero.currentTime};}
    const state=window.vortexControls?.getState();return {playing:state?.formationPlaying===true,time:state?.motionTime??0};
  }
  const canPlay=()=>hasSource()&&enabled&&source().playing&&!document.hidden&&!failed;
  function update(){
    const state=!hasSource()?'missing':failed?'error':!enabled?'muted':waiting?'waiting':unlocked?'enabled':'loading';
    const labels={missing:'Sound unavailable',error:'Retry sound',muted:'Sound off',waiting:'Enable sound',enabled:'Sound on',loading:'Loading sound…'};
    buttons.forEach(button=>{
      button.textContent=labels[state];button.dataset.soundState=state;button.disabled=state==='missing';
      button.setAttribute('aria-pressed',String(enabled&&unlocked&&!waiting&&!failed));
      button.title=state==='waiting'?'Soundtrack — enable music':state==='error'?'Retry loading the music':enabled?'Soundtrack — mute music':'Soundtrack — enable music';
    });
  }
  function seek(time){
    if(Number.isFinite(audio.duration)&&audio.duration>0&&Number.isFinite(time))audio.currentTime=Math.max(0,time)%audio.duration;
  }
  function play(){
    if(!canPlay()||pending)return;
    waiting=false;
    if(!unlocked)seek(source().time);
    let aborted=false;
    pending=audio.play();
    pending.then(()=>{unlocked=true;waiting=false;if(!canPlay())audio.pause();}).catch(error=>{
      if(error.name==='NotAllowedError')waiting=true;
      else if(error.name==='AbortError')aborted=true;
      else failed=true;
    }).finally(()=>{pending=null;update();if(aborted&&canPlay())play();});
    update();
  }
  function sync(){if(canPlay())play();else audio.pause();update();}
  buttons.forEach(button=>button.addEventListener('click',()=>{
    if(waiting||failed||!unlocked){
      enabled=true;if(failed)audio.load();failed=false;
      if(!filmPanel?.open&&!document.body.classList.contains('aero-active')&&!document.body.classList.contains('explorer-mode')){if(hero)window.vortexHero?.play();else window.vortexControls?.play();}
    }
    else enabled=!enabled;
    sync();
  }));
  function unlock(event){
    if(event.target.closest('[data-sound-toggle]'))return;
    if(enabled&&!unlocked)play();
  }
  document.addEventListener('pointerdown',unlock);document.addEventListener('pointerup',unlock);
  document.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')unlock(event);});
  document.addEventListener('visibilitychange',sync);
  window.addEventListener('pagehide',()=>audio.pause());window.addEventListener('pageshow',sync);
  audio.addEventListener('playing',()=>{unlocked=true;waiting=false;failed=false;if(!canPlay())audio.pause();update();});
  audio.addEventListener('error',()=>{failed=true;update();});
  window.addEventListener('hero-playback',event=>{
    if(event.detail?.seek&&!filmPanel?.open&&!document.body.classList.contains('aero-active'))seek(event.detail.time);
    sync();
  });
  window.addEventListener('vortex-viewchange',sync);
  window.addEventListener('vortex-playback',event=>{if(hero)return;if(event.detail?.seek&&!filmPanel?.open&&!document.body.classList.contains('aero-active'))seek(event.detail.time);sync();});
  document.querySelector('[data-aero-play]')?.addEventListener('click',()=>queueMicrotask(sync));
  document.querySelectorAll('[data-scene]').forEach(button=>button.addEventListener('click',()=>queueMicrotask(sync)));
  for(const type of ['play','playing','pause','ended','waiting','seeking','canplay'])film?.addEventListener(type,sync);
  film?.addEventListener('seeked',()=>{if(filmPanel?.open)seek(film.currentTime/film.playbackRate);sync();});
  filmPanel?.addEventListener('close',sync);
  update();sync();
})();
