'use strict';
importScripts('aero-solver.js?v=aero-5');
let fluid=null,playing=true,timer=0,epoch=0;
function run(){
  timer=0;if(!fluid||!playing)return;
  const start=performance.now();let count=0;
  do{if(!fluid.advance(4)){postMessage({type:'error',epoch});playing=false;return;}count+=4;}while(performance.now()-start<20&&count<32);
  const state=fluid.snapshot();postMessage({type:'field',epoch,...state},[state.ux.buffer,state.uy.buffer,state.rho.buffer]);
  timer=setTimeout(run,fluid.steps<480?0:16);
}
onmessage=event=>{
  const m=event.data;if(!m||typeof m!=='object')return;
  if(m.type==='init'){
    if(!Number.isInteger(m.width)||!Number.isInteger(m.height)||m.width<16||m.width>512||m.height<16||m.height>256||!(m.mask instanceof Uint8Array)||m.mask.length!==m.width*m.height)return;
    clearTimeout(timer);epoch=m.epoch;fluid=new AeroFluid(m.width,m.height,m.mask,m.speed);playing=m.playing!==false;run();
    if(!playing){if(!fluid.advance(1200)){postMessage({type:'error',epoch});return;}const state=fluid.snapshot();postMessage({type:'field',epoch,...state},[state.ux.buffer,state.uy.buffer,state.rho.buffer]);}
  }else if(m.type==='play'){playing=Boolean(m.value);clearTimeout(timer);if(playing)run();}
};
