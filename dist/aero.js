(() => {
  'use strict';
  const root=document.querySelector('.aero-lab'),canvas=document.querySelector('#aero-canvas'),loading=root.querySelector('.aero-loading');
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),W=288,H=144,X0=-7,Y0=-4.5,CELL=16;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let active=false,ready=false,playing=!reduced,mode='trails',object='fly',field=null,mask=null,epoch=0,frame=0,last=0,worker=null,renderer=null,speed=1,loadId=0;
  let yaw=.18,pitch=.11,targetYaw=yaw,targetPitch=pitch,drag=null,metricUpdated=0;
  const cache=new Map(),particles=[],trailData=new Float32Array(1500*2*6),pointData=new Float32Array(1500*6);
  const streamData=new Float32Array(72*320*12);let streamCount=0,streamUpdated=0;
  const titles={fly:['A tiny fly.','A bigger view.'],car:['Built','for speed.'],plane:['Where does','flight begin?']};
  const captions={fly:'A fruit fly, magnified.',car:'A Formula 1 car meets the flow.',plane:'Flow around an aircraft silhouette.'};
  let randomSeed=8157;
  function random(){randomSeed=(Math.imul(randomSeed,1664525)+1013904223)>>>0;return randomSeed/4294967296;}
  function sample(x,y){
    if(!field)return[.055*speed,0];
    const gx=clamp((x-X0)*CELL,0,W-1.001),gy=clamp((y-Y0)*CELL,0,H-1.001),ix=Math.floor(gx),iy=Math.floor(gy),i=ix+iy*W;
    if(mask?.[i])return[0,0];
    const a=gx-ix,b=gy-iy;
    const interpolate=array=>array[i]*(1-a)*(1-b)+array[i+1]*a*(1-b)+array[i+W]*(1-a)*b+array[i+W+1]*a*b;
    return[interpolate(field.ux),interpolate(field.uy)];
  }
  function seedParticle(p,all=false){p.x=all?X0+random()*17.7:X0+random()*.35;p.y=Y0+.3+random()*8.4;p.age=0;p.life=8+random()*18;p.z=.02;p.px=p.x;p.py=p.y;}
  function resetParticles(){randomSeed=8157;particles.length=0;for(let i=0;i<1400;i++){const p={};seedParticle(p,true);particles.push(p);}}
  function updateMetric(now){
    if(!field||now-metricUpdated<500)return;metricUpdated=now;
    const output=root.querySelector('[data-aero-deficit]');
    if(field.steps<900){output.textContent='—';return;}
    // Fixed cross-section x=4, y in [-1.8,1.8], in the shared illustrative units.
    const x=Math.round((4-X0)*CELL),low=Math.ceil((-1.8-Y0)*CELL),high=Math.floor((1.8-Y0)*CELL);let sum=0;
    for(let y=low;y<=high;y++)sum+=Math.max(0,1-field.ux[x+y*W]/field.inlet);
    output.textContent=Math.round(sum/(high-low+1)*100)+'%';
  }
  function buildStreamlines(){
    streamCount=0;
    for(let seed=0;seed<72;seed++){
      let x=seed<52?-6.8:2.5+(seed%5)*1.45,y=seed<52?-3.7+seed/51*7.4:-1.65+Math.floor((seed-52)/5)*1.1;
      for(let step=0;step<320;step++){
        const [u,v]=sample(x,y),length=Math.hypot(u,v);if(length<.004)break;
        const scale=.065/length,nx=x+u*scale,ny=y+v*scale;
        if(nx<-6.9||nx>10.8||ny<-4.25||ny>4.25)break;
        const index=Math.floor((nx-X0)*CELL)+Math.floor((ny-Y0)*CELL)*W;if(mask[index])break;
        const k=clamp((length/field.inlet-.65)/1.4,0,1),r=.18+k*.78,g=.66-k*.08,b=.77-k*.45;
        streamData.set([x,y,.01,r,g,b,nx,ny,.01,r,g,b],streamCount*12);streamCount++;x=nx;y=ny;
      }
    }
  }
  function fail(message){loading.hidden=false;loading.textContent=message;playing=false;updatePlay();worker?.postMessage({type:'play',value:false});}
  function makeRenderer(){
    const gl=canvas.getContext('webgl',{alpha:false,antialias:true,powerPreference:'high-performance'});
    if(!gl)throw new Error('WebGL unavailable');
    const common=`precision highp float; uniform vec2 uAngle;uniform vec2 uExtent;uniform float uCenter; vec3 rotate(vec3 p){float c=cos(uAngle.x),s=sin(uAngle.x);p=vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);c=cos(uAngle.y);s=sin(uAngle.y);return vec3(p.x,c*p.y-s*p.z,s*p.y+c*p.z);} vec4 project(vec3 p){p=rotate(p-vec3(uCenter,0.,0.));return vec4(p.x/uExtent.x,p.y/uExtent.y,-p.z/35.,1.);}`;
    function program(vs,fs){const p=gl.createProgram();for(const[type,source]of [[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]]){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error('Graphics shader failed');gl.attachShader(p,shader);gl.deleteShader(shader);}gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error('Graphics link failed');return p;}
    const body=program(common+`attribute vec3 aPosition,aNormal,aColor;varying mediump vec3 vNormal,vColor,vPoint;void main(){vNormal=rotate(aNormal);vColor=aColor;vPoint=rotate(aPosition);gl_Position=project(aPosition);}`,`precision mediump float;uniform float uOpacity;varying mediump vec3 vNormal,vColor,vPoint;void main(){vec3 n=normalize(vNormal);if(uOpacity<.99&&!gl_FrontFacing)n=-n;vec3 l=normalize(vec3(-.4,.85,1.));float key=max(dot(n,l),0.);float rim=pow(1.-abs(n.z),3.);float spec=pow(max(dot(n,normalize(l+vec3(0.,0.,1.))),0.),48.);vec3 col=vColor*(.21+.8*key)+vec3(.12,.31,.37)*rim+vec3(.7,.85,.9)*spec*.3;col+=vec3(.03,.09,.14)*max(dot(n,normalize(vec3(1.,-.25,-.5))),0.);gl_FragColor=vec4(pow(col,vec3(.9)),uOpacity);}`);
    const lines=program(common+`attribute vec3 aPosition,aColor;uniform float uPointSize;varying mediump vec3 vColor;void main(){vColor=aColor;gl_Position=project(aPosition);gl_PointSize=uPointSize;}`,`precision mediump float;varying mediump vec3 vColor;uniform bool uPoints;uniform float uAlpha;void main(){float a=uAlpha;if(uPoints){float r=length(gl_PointCoord-.5)*2.;a*=1.-smoothstep(.1,1.,r);}gl_FragColor=vec4(vColor,a);}`);
    const plane=program(common+`attribute vec3 aPosition;attribute vec2 aUV;varying mediump vec2 vUV;void main(){vUV=aUV;gl_Position=project(aPosition);}`,`precision mediump float;uniform sampler2D uField;uniform float uMode;varying mediump vec2 vUV;vec3 speedColor(float x){vec3 a=vec3(.035,.08,.22),b=vec3(.07,.36,.63),c=vec3(.18,.73,.76),d=vec3(.95,.58,.25);return x<.4?mix(a,b,x/.4):x<.7?mix(b,c,(x-.4)/.3):mix(c,d,clamp((x-.7)/.3,0.,1.));}void main(){vec4 f=texture2D(uField,vUV);float edge=smoothstep(0.,.035,vUV.x)*smoothstep(1.,.91,vUV.x)*smoothstep(0.,.1,vUV.y)*smoothstep(1.,.9,vUV.y);vec3 color=speedColor(f.r);float a=.55;if(uMode>1.5){float curl=(f.g-.5)*2.;color=mix(vec3(.015,.035,.055),curl>0.?vec3(.93,.5,.23):vec3(.06,.48,.8),pow(abs(curl),.65));a=.7;}if(uMode<.5){a=.16;color*=.6;}gl_FragColor=vec4(color,edge*a*(1.-f.b));}`);
    const meshBuffer=gl.createBuffer(),wingBuffer=gl.createBuffer(),lineBuffer=gl.createBuffer(),streamBuffer=gl.createBuffer(),pointBuffer=gl.createBuffer(),planeBuffer=gl.createBuffer(),tex=gl.createTexture();let meshCount=0,wingCount=0;
    gl.bindBuffer(gl.ARRAY_BUFFER,planeBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-7,-4.5,-1.1,0,0,11,-4.5,-1.1,1,0,-7,4.5,-1.1,0,1,-7,4.5,-1.1,0,1,11,-4.5,-1.1,1,0,11,4.5,-1.1,1,1]),gl.STATIC_DRAW);
    gl.bindTexture(gl.TEXTURE_2D,tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,W,H,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(W*H*4));
    const pixels=new Uint8Array(W*H*4),locations=new Map();
    function loc(p,name){const key=p===body?'body':p===lines?'lines':'plane';const id=key+name;if(!locations.has(id))locations.set(id,gl.getUniformLocation(p,name));return locations.get(id);}
    function attr(p,name,size,stride,offset){const a=gl.getAttribLocation(p,name);if(a<0)return;gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,size,gl.FLOAT,false,stride,offset);}
    function setup(p){
      gl.useProgram(p);gl.uniform2f(loc(p,'uAngle'),yaw,pitch);
      const aspect=canvas.width/canvas.height;
      const halfWidth=object==='fly'?Math.max(3.25,aspect*2.0):object==='car'?clamp(aspect*2.55,3.55,6.2):canvas.clientWidth<650?6.5:8.8;
      const center=object==='fly'?0:object==='car'?(aspect>1.6?.85:.15):canvas.clientWidth<650?.5:1.6;
      gl.uniform2f(loc(p,'uExtent'),halfWidth,halfWidth/aspect);gl.uniform1f(loc(p,'uCenter'),center);
    }
    function updateField(){if(!field)return;for(let i=0;i<W*H;i++){const s=Math.hypot(field.ux[i],field.uy[i])/field.inlet;const curl=i>W&&i<W*(H-1)-1?((field.uy[i+1]-field.uy[i-1])-(field.ux[i+W]-field.ux[i-W]))*.5:0;pixels[i*4]=clamp(s/2.4,0,1)*255;pixels[i*4+1]=(clamp(curl/.023,-1,1)*.5+.5)*255;pixels[i*4+2]=mask[i]?255:0;pixels[i*4+3]=255;}gl.bindTexture(gl.TEXTURE_2D,tex);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,pixels);}
    function draw(segmentCount,pointCount){
      const pixelRatio=Math.min(devicePixelRatio||1,2),width=Math.round(canvas.clientWidth*pixelRatio),height=Math.round(canvas.clientHeight*pixelRatio);if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
      gl.viewport(0,0,width,height);gl.clearColor(.0196,.0274,.0353,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.disable(gl.DEPTH_TEST);
      setup(plane);gl.bindBuffer(gl.ARRAY_BUFFER,planeBuffer);attr(plane,'aPosition',3,20,0);attr(plane,'aUV',2,20,12);gl.uniform1f(loc(plane,'uMode'),mode==='trails'?0:mode==='speed'?1:2);gl.uniform1i(loc(plane,'uField'),0);gl.drawArrays(gl.TRIANGLES,0,6);
      setup(body);gl.uniform1f(loc(body,'uOpacity'),1);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.bindBuffer(gl.ARRAY_BUFFER,meshBuffer);attr(body,'aPosition',3,36,0);attr(body,'aNormal',3,36,12);attr(body,'aColor',3,36,24);gl.drawArrays(gl.TRIANGLES,0,meshCount);
      if(wingCount){gl.depthMask(false);gl.uniform1f(loc(body,'uOpacity'),.22);gl.bindBuffer(gl.ARRAY_BUFFER,wingBuffer);attr(body,'aPosition',3,36,0);attr(body,'aNormal',3,36,12);attr(body,'aColor',3,36,24);gl.drawArrays(gl.TRIANGLES,0,wingCount);}
      setup(lines);gl.depthMask(false);gl.uniform1i(loc(lines,'uPoints'),0);gl.uniform1f(loc(lines,'uPointSize'),1);
      gl.uniform1f(loc(lines,'uAlpha'),mode==='trails'?.25:.14);gl.bindBuffer(gl.ARRAY_BUFFER,streamBuffer);gl.bufferData(gl.ARRAY_BUFFER,streamData.subarray(0,streamCount*12),gl.DYNAMIC_DRAW);attr(lines,'aPosition',3,24,0);attr(lines,'aColor',3,24,12);gl.drawArrays(gl.LINES,0,streamCount*2);
      gl.uniform1f(loc(lines,'uAlpha'),mode==='trails'?.76:.54);gl.bindBuffer(gl.ARRAY_BUFFER,lineBuffer);gl.bufferData(gl.ARRAY_BUFFER,trailData.subarray(0,segmentCount*12),gl.DYNAMIC_DRAW);attr(lines,'aPosition',3,24,0);attr(lines,'aColor',3,24,12);gl.drawArrays(gl.LINES,0,segmentCount*2);
      gl.bindBuffer(gl.ARRAY_BUFFER,pointBuffer);gl.bufferData(gl.ARRAY_BUFFER,pointData.subarray(0,pointCount*6),gl.DYNAMIC_DRAW);attr(lines,'aPosition',3,24,0);attr(lines,'aColor',3,24,12);gl.uniform1i(loc(lines,'uPoints'),1);gl.uniform1f(loc(lines,'uPointSize'),2.2*pixelRatio);gl.uniform1f(loc(lines,'uAlpha'),.9);gl.drawArrays(gl.POINTS,0,pointCount);gl.depthMask(true);
    }
    return{setMesh(data,wings=[]){gl.bindBuffer(gl.ARRAY_BUFFER,meshBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);meshCount=data.length/9;gl.bindBuffer(gl.ARRAY_BUFFER,wingBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(wings),gl.STATIC_DRAW);wingCount=wings.length/9;},updateField,draw};
  }
  function animate(now){
    frame=0;if(!active||document.hidden)return;const dt=last?Math.min((now-last)/1000,.045):0;last=now;
    const ease=reduced?1:1-Math.exp(-dt*7);yaw+=(targetYaw-yaw)*ease;pitch+=(targetPitch-pitch)*ease;
    let segments=0,points=0;
    if(field){
      updateMetric(now);
      if(now-streamUpdated>140||!streamCount){buildStreamlines();streamUpdated=now;}
      for(const p of particles){
        const [u,v]=sample(p.x,p.y),rate=Math.hypot(u,v)/(field.inlet||.055),oldx=p.x,oldy=p.y;
        if(playing){p.x+=u*dt*35;p.y+=v*dt*35;p.age+=dt;if(p.x>10.8||p.y<-4.3||p.y>4.3||p.age>p.life||rate<.07){seedParticle(p);continue;}p.px=oldx;p.py=oldy;}
        const i=Math.floor((p.x-X0)*CELL)+Math.floor((p.y-Y0)*CELL)*W;if(i<0||i>=mask.length||mask[i]){seedParticle(p);continue;}
        const k=clamp((rate-.65)/1.4,0,1),r=.18+k*.78,g=.66-k*.08,b=.77-k*.45;
        // Short tangent strokes reveal the local field even in the paused view.
        const length=.13+clamp(rate,0,2)*.16,norm=Math.hypot(u,v)||1;
        const bx=p.x-u/norm*length,by=p.y-v/norm*length,bi=Math.floor((bx-X0)*CELL)+Math.floor((by-Y0)*CELL)*W;
        if(bi>=0&&bi<mask.length&&!mask[bi]){trailData.set([bx,by,p.z,r*.55,g*.55,b*.55,p.x,p.y,p.z,r,g,b],segments*12);segments++;}
        pointData.set([p.x,p.y,p.z,r,g,b],points*6);points++;
      }
    }
    renderer?.draw(segments,points);if(playing||Math.abs(targetYaw-yaw)+Math.abs(targetPitch-pitch)>.001)frame=requestAnimationFrame(animate);
  }
  function render(){if(!frame&&active&&!document.hidden){last=0;frame=requestAnimationFrame(animate);}}
  function updatePlay(){const button=root.querySelector('[data-aero-play]');button.textContent=playing?'Ⅱ Pause':'▶ Play';button.setAttribute('aria-pressed',String(playing));}
  function startCalculation(){if(!mask||!worker)return;epoch++;field=null;streamCount=0;root.querySelector('[data-aero-deficit]').textContent='—';resetParticles();loading.hidden=false;loading.textContent='Calculating flow…';worker.postMessage({type:'init',width:W,height:H,mask,speed,epoch,playing:playing&&active&&!document.hidden});}
  async function chooseObject(name){
    if(!Object.hasOwn(titles,name))return;object=name;root.dataset.model=name;const current=++loadId;
    targetYaw=name==='fly'?.28:name==='car'?.27:.18;targetPitch=name==='fly'?.36:name==='car'?.30:.11;
    root.querySelectorAll('[data-aero-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.aeroView==='volume')));
    root.querySelectorAll('[data-object]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.object===name)));
    const title=root.querySelector('#aero-title');title.replaceChildren(document.createTextNode(titles[name][0]+' '),document.createElement('br'),document.createTextNode(titles[name][1]));root.querySelector('[data-aero-caption]').textContent=captions[name];
    loading.hidden=false;loading.textContent='Loading the model…';
    try{
      let data=cache.get(name);if(!data){const response=await fetch('assets/aero/'+name+'.json'+(name==='car'?'?v=f1-15':name==='fly'?'?v=fly-10-final':''));if(!response.ok)throw new Error('Model unavailable');data=await response.json();if(!Array.isArray(data.vertices)||data.vertices.length%27||data.vertices.length>3000000||!data.vertices.every(Number.isFinite)||!data.mask||!Array.isArray(data.mask.data)||data.mask.data.length!==data.mask.width*data.mask.height)throw new Error('Invalid model');if(data.transparentVertices!==undefined&&(!Array.isArray(data.transparentVertices)||data.transparentVertices.length%27||data.transparentVertices.length>1000000||!data.transparentVertices.every(Number.isFinite)))throw new Error('Invalid wing mesh');cache.set(name,data);}
      if(current!==loadId)return;renderer.setMesh(data.vertices,data.transparentVertices??[]);
      const source=data.mask,[xmin,xmax,ymin,ymax]=source.bounds;mask=new Uint8Array(W*H);
      for(let y=0;y<H;y++)for(let x=0;x<W;x++){const wx=X0+x/CELL,wy=Y0+y/CELL,sx=Math.floor((wx-xmin)/(xmax-xmin)*source.width),sy=Math.floor((wy-ymin)/(ymax-ymin)*source.height);if(sx>=0&&sx<source.width&&sy>=0&&sy<source.height)mask[x+y*W]=source.data[sx+sy*source.width]?1:0;}
      startCalculation();render();
    }catch{fail('The model could not load. Press ↺ to try again.');}
  }
  function init(){
    try{renderer=makeRenderer();worker=new Worker('aero-worker.js?v=aero-5');worker.onmessage=event=>{const message=event.data;if(message.epoch!==epoch)return;if(message.type==='error'){fail('The flow became unstable. Lower the inlet speed and press ↺.');return;}if(message.type==='field'){field=message;renderer.updateField();loading.hidden=true;root.querySelector('[data-aero-state]').textContent='2D flow around a side silhouette';render();}};worker.onerror=()=>fail('The flow calculation is unavailable. Refresh to retry.');ready=true;chooseObject(object);updatePlay();}catch{fail('The wind tunnel needs WebGL. Please use a browser with 3D support.');}
  }
  function showScene(name){
    active=name==='aero';document.querySelector('.observatory').hidden=active;root.hidden=!active;document.body.classList.toggle('aero-active',active);window.vortexUI?.closePanel();
    window.dispatchEvent(new Event('vortex-viewchange'));
    document.querySelectorAll('[data-scene]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.scene===name)));
    if(active){if(!ready)init();else{worker?.postMessage({type:'play',value:playing&&!document.hidden});render();}}else{worker?.postMessage({type:'play',value:false});cancelAnimationFrame(frame);frame=0;last=0;}
  }
  document.querySelectorAll('[data-scene]').forEach(button=>button.addEventListener('click',()=>showScene(button.dataset.scene)));
  root.querySelectorAll('[data-object]').forEach(button=>button.addEventListener('click',()=>chooseObject(button.dataset.object)));
  root.querySelectorAll('[data-aero-mode]').forEach(button=>button.addEventListener('click',()=>{mode=button.dataset.aeroMode;root.querySelectorAll('[data-aero-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));root.querySelector('.aero-scale').classList.toggle('vorticity',mode==='vorticity');root.querySelector('[data-aero-low]').textContent=mode==='vorticity'?'Clockwise':'Slower';root.querySelector('[data-aero-high]').textContent=mode==='vorticity'?'Counterclockwise':'Faster';render();}));
  root.querySelector('[data-aero-play]').addEventListener('click',()=>{playing=!playing;updatePlay();worker?.postMessage({type:'play',value:playing});render();});
  root.querySelector('[data-aero-reset]').addEventListener('click',()=>{chooseObject(object);render();});
  let speedTimer=0;root.querySelector('#aero-speed').addEventListener('input',event=>{speed=clamp(Number(event.target.value)||1,.65,1.4);root.querySelector('#aero-speed-value').textContent=speed.toLocaleString('en-US',{maximumFractionDigits:2})+'×';clearTimeout(speedTimer);speedTimer=setTimeout(startCalculation,180);});
  root.querySelectorAll('[data-aero-view]').forEach(button=>button.addEventListener('click',()=>{targetYaw=button.dataset.aeroView==='side'?0:object==='fly'?.28:object==='car'?.27:.24;targetPitch=button.dataset.aeroView==='side'?0:object==='fly'?.36:object==='car'?.30:.13;root.querySelectorAll('[data-aero-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));render();}));
  root.querySelector('[data-aero-info]').addEventListener('click',()=>window.vortexUI?.openPanel('about'));
  canvas.addEventListener('pointerdown',event=>{drag={id:event.pointerId,x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);});canvas.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.id)return;targetYaw=clamp(targetYaw+(event.clientX-drag.x)*.004,-.65,.65);targetPitch=clamp(targetPitch+(event.clientY-drag.y)*.004,-.4,.4);drag.x=event.clientX;drag.y=event.clientY;root.querySelectorAll('[data-aero-view]').forEach(b=>b.setAttribute('aria-pressed','false'));render();});for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>{drag=null;});
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();fail('The 3D view was interrupted. Refresh to resume.');cancelAnimationFrame(frame);frame=0;});
  new ResizeObserver(render).observe(canvas);document.addEventListener('visibilitychange',()=>{worker?.postMessage({type:'play',value:active&&playing&&!document.hidden});if(!document.hidden)render();else{cancelAnimationFrame(frame);frame=0;last=0;}});window.addEventListener('pagehide',()=>{worker?.terminate();cancelAnimationFrame(frame);clearTimeout(speedTimer);});
})();
