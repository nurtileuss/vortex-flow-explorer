
window.initializeVortex = () => {
  'use strict';
  const root = document.getElementById('vortex-app');
  if (!root || root.dataset.ready==='true') return;
  const DURATION=30,ASSEMBLY=18;
  const canvas = root.querySelector('canvas');
  const status = root.querySelector('.ns-status');
  const gl = canvas.getContext('webgl', { antialias:true, alpha:true, premultipliedAlpha:false });
  if (!gl) { status.textContent = '3D is unavailable in this browser. Open Films instead.'; status.setAttribute('role','alert'); root.querySelector('.scene-fallback').hidden=false; canvas.hidden=true; return; }
  const vertexSource = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    attribute vec4 aInfo;
    uniform vec2 uAngle;
    uniform float uDistance;
    uniform float uAspect;
    uniform float uRoll;
    uniform mat3 uCamera;
    uniform float uAssemble, uPointScale;
    uniform float uMotionTime, uCurl;
    uniform vec2 uViewport;
    uniform mediump float uMode;
    varying mediump vec3 vNormal;
    varying mediump vec4 vInfo;
    varying mediump vec3 vPosition;
    varying mediump vec2 vDust;
    varying mediump float vRibbon;
    float random(vec2 seed) {
      vec3 q=fract(vec3(seed.xyx)*0.1031);
      q+=dot(q,q.yzx+33.33);
      return fract((q.x+q.y)*q.z);
    }
    vec3 turn(vec3 p) {
      return uCamera*p;
    }
    float twist(vec3 p){return uMotionTime*0.075+uCurl*(0.18*sin(0.65*p.y-uMotionTime*0.32)+0.075*sin(1.55*p.y-uMotionTime*0.56));}
    vec3 sway(float y){return uCurl*vec3(0.038*sin(1.15*y-uMotionTime*0.45),0.0,0.025*cos(1.15*y-uMotionTime*0.45));}
    vec3 flow(vec3 p){
      float angle=twist(p),c=cos(angle),s=sin(angle);
      return vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z)+sway(p.y);
    }
    vec3 flowNormal(vec3 p,vec3 n,vec3 q){
      float angle=twist(p),c=cos(angle),s=sin(angle);
      vec3 rn=vec3(c*n.x+s*n.z,n.y,-s*n.x+c*n.z);
      float derivative=uCurl*(0.18*0.65*cos(0.65*p.y-uMotionTime*0.32)+0.075*1.55*cos(1.55*p.y-uMotionTime*0.56));
      vec3 base=q-sway(p.y);
      float wave=1.15*p.y-uMotionTime*0.45;
      rn.y-=(derivative*base.z+uCurl*0.038*1.15*cos(wave))*rn.x+(-derivative*base.x-uCurl*0.025*1.15*sin(wave))*rn.z;
      return normalize(rn);
    }
    void main() {
      vec3 position=flow(aPosition);
      vDust=vec2(1.0,0.0);
      if(uMode>2.5) {
        float seed=random(vec2(aInfo.z,aInfo.y));
        float height=random(vec2(aInfo.z+17.2,aInfo.y))*2.0-1.0;
        float gather=smoothstep(0.01+aInfo.w*0.22+seed*0.13,0.64+aInfo.w*0.22+seed*0.13,uAssemble);
        float theta=atan(position.z,position.x)+(1.0-gather)*(3.2+seed*3.4);
        float radius=mix(2.6+seed*1.8,length(position.xz),gather);
        position=vec3(cos(theta)*radius,mix(height*3.5,position.y,gather),sin(theta)*radius);
        position.y+=sin(gather*3.141593)*sin(seed*23.7)*0.24;
        vDust=vec2(gather,seed);
      }
      vec3 p=turn(position);p.z-=uDistance;
      gl_Position=vec4(p.x*2.62/uAspect,p.y*2.62,-1.01258*p.z-0.80503,-p.z);
      vRibbon=0.0;
      if(uMode>0.5&&uMode<1.5){
        vec3 next=turn(flow(aPosition+aNormal));next.z-=uDistance;
        vec2 nextScreen=vec2(next.x*2.62/uAspect,next.y*2.62)/(-next.z);
        vec2 direction=(nextScreen-gl_Position.xy/gl_Position.w)*uViewport;
        direction/=max(length(direction),0.00001);
        vec2 normal=vec2(-direction.y,direction.x);
        vRibbon=sign(aInfo.z);
        gl_Position.xy+=normal*vRibbon*0.65*uPointScale*2.0/uViewport*gl_Position.w;
      }
      gl_PointSize=uMode>1.5?clamp(18.0/(-p.z),1.1,3.5)*uPointScale:1.0;
      if(uMode>2.5)gl_PointSize=clamp((9.0+vDust.y*15.0)/max(0.4,-p.z),1.1,11.0)*uPointScale;
      vPosition=p; vNormal=turn(flowNormal(aPosition,aNormal,position)); vInfo=aInfo;
      if(uMode>0.5&&uMode<1.5)vInfo.z=abs(aInfo.z)-1.0;
    }`;
  const fragmentSource = `
    precision mediump float;
    uniform vec3 uCold, uMid, uWarm, uInk, uBg;
    uniform float uTime, uMoving, uReveal;
    uniform float uDustAlpha;
    uniform mediump float uMode;
    varying mediump vec3 vNormal, vPosition;
    varying mediump vec4 vInfo;
    varying mediump vec2 vDust;
    varying mediump float vRibbon;
    void main() {
      if(uMode>2.5) {
        float radial=length(gl_PointCoord-vec2(0.5));
        if(radial>0.5)discard;
        float hot=pow(vDust.y,12.0);
        float k=clamp(vInfo.x,0.0,1.0);
        vec3 color=mix(uCold,uMid,smoothstep(0.10,0.55,k));
        color=mix(color,uWarm,smoothstep(0.76,0.94,k));
        color=mix(color,vec3(0.91,0.97,1.0),hot*0.45);
        float core=exp(-radial*radial*38.0);
        float halo=exp(-radial*9.0)*0.16;
        gl_FragColor=vec4(color*(1.0+hot*0.5),(core+halo)*(0.34+hot*0.46)*uDustAlpha);
        return;
      }
      if (vInfo.x<0.0) { gl_FragColor=vec4(mix(uBg,uInk,0.09),1.0); return; }
      float delay=fract(vInfo.z*0.37)*0.16;
      float front=clamp((uReveal-delay)/0.84,0.0,1.0);
      if(vInfo.w>front && uReveal<0.999) discard;
      vec3 n=normalize(vNormal);
      vec3 light=normalize(vec3(-0.6,0.9,1.1));
      float diffuse=max(dot(n,light),0.0);
      float rim=pow(1.0-abs(dot(n,normalize(-vPosition))),3.0);
      float k=clamp(vInfo.x,0.0,1.0);
      vec3 color=mix(uCold,uMid,smoothstep(0.10,0.55,k));
      color=mix(color,uWarm,smoothstep(0.76,0.94,k));
      float spec=pow(max(dot(reflect(-light,n),normalize(-vPosition)),0.0),62.0);
      float pulse=pow(max(cos((vInfo.y-uTime)*3.2+vInfo.z),0.0),64.0)*uMoving;
      float tip=(1.0-smoothstep(0.001,0.018,abs(vInfo.w-front)))*(1.0-step(0.999,uReveal));
      if(uMode>1.5){
        float radial=length(gl_PointCoord-vec2(0.5));
        if(radial>0.5)discard;
        float spark=max(pulse,tip);
        if(spark<0.82)discard;
        gl_FragColor=vec4(mix(color,vec3(0.91,0.97,1.0),0.3),pow(1.0-radial*2.0,1.7)*spark*0.20);
        return;
      }
      if(uMode>0.5){float coverage=1.0-smoothstep(0.40,1.0,abs(vRibbon));float taper=smoothstep(0.0,0.12,vInfo.w)*(1.0-smoothstep(0.82,1.0,vInfo.w));gl_FragColor=vec4(color*(0.84+pulse*0.35+tip*0.7),coverage*taper*0.08);return;}
      vec3 fillLight=normalize(vec3(0.8,-0.2,0.5));
      float fill=max(dot(n,fillLight),0.0);
      float coat=pow(max(dot(n,normalize(light+normalize(-vPosition))),0.0),90.0);
      float sweep=pow(max(0.0,1.0-abs(vInfo.w-fract(uTime*0.43+vInfo.z*0.013))/0.065),3.0)*uMoving*smoothstep(0.96,1.0,uReveal);
      vec3 lit=color*(0.19+0.85*diffuse+0.25*fill)+vec3(0.86,0.95,1.0)*(0.48*spec+0.42*coat)+color*(0.24*rim+0.24*sweep);
      lit=mix(lit,vec3(0.91,0.97,1.0),max(pulse*0.12,tip*0.52));
      gl_FragColor=vec4(lit,1.0);
    }`;
  function compile(type,source) {
    const shader=gl.createShader(type); gl.shaderSource(shader,source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }
  let program;
  try {
    program=gl.createProgram();
    gl.attachShader(program,compile(gl.VERTEX_SHADER,vertexSource));
    gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error('Shader link');
  } catch (_) { status.textContent='The 3D view could not start. Open Films instead.'; status.setAttribute('role','alert');root.querySelector('.scene-fallback').hidden=false;canvas.hidden=true;return; }
  const cosmos=window.createVortexCosmos?.(gl,canvas);
  gl.useProgram(program);
  const attributes=['aPosition','aNormal','aInfo'].map(name=>gl.getAttribLocation(program,name));
  const uniforms={};
  for (const name of ['uAngle','uDistance','uAspect','uRoll','uAssemble','uMotionTime','uCurl','uPointScale','uViewport','uDustAlpha','uCold','uMid','uWarm','uInk','uBg','uTime','uMoving','uReveal','uMode']) uniforms[name]=gl.getUniformLocation(program,name);
  uniforms.uCamera=gl.getUniformLocation(program,'uCamera');
  const cameraMatrix=new Float32Array(9);
  const tubeBatches=[];
  const filamentBuffer=gl.createBuffer();let filamentCount=0;
  const particleBuffer=gl.createBuffer();let particleCount=0;
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0,0,0,0);
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let yaw=-0.68, pitch=0.27, targetYaw=yaw, targetPitch=pitch, distance=8.9, clock=0, moving=!reducedMotion, visible=true;
  let roll=-0.12,targetRoll=roll,pixelRatio=1;
  let formationTime=reducedMotion?DURATION:0,formationPlaying=!reducedMotion,reveal=reducedMotion?1:0.035,uiSecond=-1;
  let motionTime=reducedMotion?DURATION:0;
  let formationCameraFree=false,exploring=false;
  let frameId=0, lastTime=0, rebuildFrame=0,renderScale=1,frameAverage=16.7,frameSamples=0;
  const settings={spin:1,stretch:1,viscosity:1};
  const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
  const unit=v=>{const l=Math.hypot(...v)||1; return v.map(x=>x/l);};
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  function bindGeometry(value){gl.bindBuffer(gl.ARRAY_BUFFER,value);attributes.forEach((location,i)=>{gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,i===2?4:3,gl.FLOAT,false,40,i*12);});}
  function rebuild() {
    rebuildFrame=0;
    for(const batch of tubeBatches){gl.deleteBuffer(batch.vertices);gl.deleteBuffer(batch.indices);}
    tubeBatches.length=0;
    let data=[],indices=[];
    const particles=[];
    // Indexed batches share ring vertices and remain compatible with WebGL 1.
    function flushTubes(){
      if(!indices.length)return;
      const vertices=gl.createBuffer(),elements=gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER,vertices);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,elements);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);
      tubeBatches.push({vertices,indices:elements,count:indices.length});data=[];indices=[];
    }
    const a=0.65*settings.stretch, nu=0.048*settings.viscosity, gamma=8.4*settings.spin;
    const core2=4*nu/a;
    const angular=r=>gamma/(2*Math.PI)*(-Math.expm1(-r*r/core2))/(r*r);
    // Art-directed proportions keep the broad middle and narrow both axial stems.
    const contour=p=>{const t=clamp((Math.abs(p[1])-0.55)/1.85,0,1),s=1-(p[1]>0?0.34:0.28)*t*t*(3-2*t);return [p[0]*s,p[1],p[2]*s];};
    const append=(p,n,k,t,phase,progress)=>data.push(...p,...n,k,t,phase,progress);
    function tube(points,radius,phase,sides=12,flat=false) {
      if(data.length/10+points.length*sides>65535)flushTubes();
      const base=data.length/10;
      const surface=new Float64Array(points.length*sides*3),around=new Float64Array(surface.length);
      let previousNormal=[0,1,0],previousTangent=null;
      for (let i=0;i<points.length;i++) {
        const p=points[i], before=points[Math.max(i-1,0)], after=points[Math.min(i+1,points.length-1)];
        const tangent=unit(after.p.map((v,j)=>v-before.p[j]));
        if(previousTangent){
          const axis=cross(previousTangent,tangent),cosine=previousTangent.reduce((sum,v,k)=>sum+v*tangent[k],0);
          if(cosine>-0.999){const first=cross(axis,previousNormal),second=cross(axis,first);previousNormal=previousNormal.map((v,k)=>v+first[k]+second[k]/(1+cosine));}
        }
        let binormal=unit(cross(tangent,previousNormal));
        if (Math.hypot(...cross(tangent,previousNormal))<0.01) binormal=unit(cross(tangent,[1,0,0]));
        let normal=unit(cross(binormal,tangent));previousNormal=normal;previousTangent=tangent;
        const progress=i/(points.length-1);
        const easeEnd=value=>{value=clamp(value,0,1);return value*value*(3-2*value);};
        const taper=0.006+0.994*Math.min(easeEnd(progress/0.14),easeEnd((1-progress)/0.10));
        if(flat){
          const roll=phase*0.55+0.65*Math.sin(progress*Math.PI*1.2+phase)*Math.sin(progress*Math.PI),c=Math.cos(roll),s=Math.sin(roll);
          const n=normal;normal=n.map((v,k)=>v*c+binormal[k]*s);binormal=binormal.map((v,k)=>v*c-n[k]*s);
        }
        const width=radius*taper,thickness=width*(flat?0.20:1);
        for (let j=0;j<sides;j++) {
          const angle=j/sides*Math.PI*2,c=Math.cos(angle),s=Math.sin(angle),offset=(i*sides+j)*3;
          for(let k=0;k<3;k++){
            surface[offset+k]=p.p[k]+normal[k]*c*width+binormal[k]*s*thickness;
            around[offset+k]=-normal[k]*s*width+binormal[k]*c*thickness;
          }
        }
      }
      // Surface derivatives preserve the light on tapered, twisting ribbons.
      for(let i=0;i<points.length;i++)for(let j=0;j<sides;j++){
        const offset=(i*sides+j)*3,before=(Math.max(0,i-1)*sides+j)*3,after=(Math.min(points.length-1,i+1)*sides+j)*3;
        const along=[0,1,2].map(k=>surface[after+k]-surface[before+k]);
        const normal=unit(cross(Array.from(around.subarray(offset,offset+3)),along));
        const p=points[i];append(Array.from(surface.subarray(offset,offset+3)),normal,p.k,p.t,phase,i/(points.length-1));
      }
      for (let i=0;i<points.length-1;i++) for(let j=0;j<sides;j++) {
        const next=(j+1)%sides;
        const start=base+i*sides,after=start+sides;
        indices.push(start+j,after+j,start+next,start+next,after+j,after+next);
      }
    }
    // Flat ribbons and their three fine companions form closely interleaved flow bundles.
    for (let i=0;i<288;i++) {
      const bundle=Math.floor(i/4),member=i%4,offset=member-1.5,sign=bundle%2===0?1:-1,ring=Math.floor(bundle/2);
      const outer=bundle<32,core=bundle>=52,flat=member===(bundle%2?1:2),phase=bundle*0.71+member*0.08;
      const variation=0.5+0.5*Math.sin(ring*2.39996+bundle*0.11);
      const r0=((outer?2.08:core?0.90:1.55)+(outer?0.31:core?0.33:0.40)*variation)*(1+offset*0.009);
      const y0=sign*((core?0.09:outer?0.095:0.035)+(outer?0.18:0.085)*(0.5+0.5*Math.sin(ring*1.713+bundle*0.29)));
      let theta=ring*2.39996+(sign>0?0:0.63)+offset*0.095;
      const height=(core?2.84:2.38)+(core?0.34:0.66)*(0.5+0.5*Math.sin(ring*2.39996+bundle*0.31))+offset*0.015;
      const end=Math.log(height/Math.abs(y0))/a;
      const maxOmega=angular(0.1),steps=Math.min(480,Math.max(280,Math.ceil(end*maxOmega/0.11)));
      const dt=end/steps, points=[];
      for(let j=0;j<=steps;j++) {
        const t=j*dt;
        const r=r0*Math.exp(-a*t/2), y=y0*Math.exp(a*t);
        if(j>0) theta+=angular(r0*Math.exp(-a*(t-dt/2)/2))*dt;
        const ratio=r*r/core2;
        const k=(-Math.expm1(-ratio))/ratio;
        const position=contour([r*Math.cos(theta),y,-r*Math.sin(theta)]);
        points.push({p:position,k:Math.pow(k,0.8),t});
        if(j%2===0)particles.push(...position,Math.cos(theta),0,-Math.sin(theta),Math.pow(k,0.8),t,phase,j/steps);
      }
      tube(points,flat?0.019+0.005*variation:0.0065+0.0045*variation,phase,flat?12:10,flat);
    }
    const axis=[{p:[0,-3.25,0],k:-1,t:0},{p:[0,3.25,0],k:-1,t:0}];
    tube(axis,0.002,0);
    flushTubes();
    const filaments=[];
    const appendRibbon=(v,tangent,side)=>filaments.push(v[0],v[1],v[2],...tangent,v[6],v[7],side*(v[8]+1),v[9]);
    for(let i=0;i<32;i++){
      const sign=i%2===0?1:-1,ring=Math.floor(i/2),outer=i<38;
      const r0=(outer?2.42:1.65)+(outer?0.17:0.21)*Math.sin(ring*2.39996);
      const y0=sign*((outer?0.045:0.048)+(outer?0.030:0.025)*(0.5+0.5*Math.sin(ring*1.713)));
      const height=2.52+0.55*(0.5+0.5*Math.sin(ring*2.39996+0.7));
      const end=Math.log(height/Math.abs(y0))/a,steps=Math.min(480,Math.max(280,Math.ceil(end*angular(0.1)/0.11))),dt=end/steps;
      let theta=ring*2.39996+(sign>0?0:0.08),previous=null;
      for(let j=0;j<=steps;j++){
        const t=j*dt,r=r0*Math.exp(-a*t/2),y=y0*Math.exp(a*t);
        if(j)theta+=angular(r0*Math.exp(-a*(t-dt/2)/2))*dt;
        const ratio=r*r/core2,k=Math.pow(-Math.expm1(-ratio)/ratio,0.8),p=contour([r*Math.cos(theta),y,-r*Math.sin(theta)]);
        const vertex=[...p,Math.cos(theta),0,-Math.sin(theta),k,t,i*0.47,j/steps];
        if(previous){
          const tangent=p.map((v,k)=>v-previous[k]);
          for(const [v,side]of [[previous,-1],[vertex,-1],[previous,1],[previous,1],[vertex,-1],[vertex,1]])appendRibbon(v,tangent,side);
        }
        previous=vertex;
      }
    }
    filamentCount=filaments.length/10;
    gl.bindBuffer(gl.ARRAY_BUFFER,filamentBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(filaments),gl.STATIC_DRAW);
    particleCount=particles.length/10;
    gl.bindBuffer(gl.ARRAY_BUFFER,particleBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(particles),gl.STATIC_DRAW);
    status.textContent='BURGERS MODEL · RELATIVE PARAMETERS';
    draw();
  }
  const swatchCanvas=document.createElement('canvas'); swatchCanvas.width=swatchCanvas.height=1;
  const swatchContext=swatchCanvas.getContext('2d',{willReadFrequently:true});
  function theme() {
    gl.useProgram(program);
    for(const [name,key] of [['uCold','cold'],['uMid','mid'],['uWarm','warm'],['uInk','text'],['uBg','bg']]) {
      swatchContext.clearRect(0,0,1,1);
      swatchContext.fillStyle=getComputedStyle(root.querySelector('[data-color="'+key+'"]')).color;
      swatchContext.fillRect(0,0,1,1);
      const rgb=swatchContext.getImageData(0,0,1,1).data;
      gl.uniform3f(uniforms[name],rgb[0]/255,rgb[1]/255,rgb[2]/255);
    }
    draw();
  }
  function draw() {
    if(!root.isConnected) return;
    cosmos?.begin();
    gl.useProgram(program);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);
    gl.viewport(0,0,canvas.width,canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.uniform2f(uniforms.uAngle,yaw,pitch);
    gl.uniform1f(uniforms.uDistance,distance);
    gl.uniform1f(uniforms.uAspect,canvas.width/canvas.height);
    gl.uniform1f(uniforms.uRoll,roll);
    const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),cr=Math.cos(roll),sr=Math.sin(roll);
    cameraMatrix.set([cr*cy-sr*sp*sy,sr*cy+cr*sp*sy,-cp*sy,-sr*cp,cr*cp,sp,cr*sy+sr*sp*cy,sr*sy-cr*sp*cy,cp*cy]);
    gl.uniformMatrix3fv(uniforms.uCamera,false,cameraMatrix);
    gl.uniform1f(uniforms.uAssemble,clamp(0.08+formationTime/ASSEMBLY*0.92,0,1));
    gl.uniform1f(uniforms.uMotionTime,exploring?0:Math.max(0,motionTime-16)*smooth((formationTime-16)/6));
    gl.uniform1f(uniforms.uCurl,exploring?0:smooth((formationTime-16)/6));
    gl.uniform1f(uniforms.uPointScale,pixelRatio);
    gl.uniform2f(uniforms.uViewport,canvas.width,canvas.height);
    gl.uniform1f(uniforms.uDustAlpha,1-smooth((formationTime-17)/4));
    gl.uniform1f(uniforms.uTime,clock);
    gl.uniform1f(uniforms.uMoving,moving?1:0);
    gl.uniform1f(uniforms.uReveal,reveal);
    gl.disable(gl.BLEND);gl.depthMask(true);gl.uniform1f(uniforms.uMode,0);
    for(const batch of tubeBatches){bindGeometry(batch.vertices);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,batch.indices);gl.drawElements(gl.TRIANGLES,batch.count,gl.UNSIGNED_SHORT,0);}
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.depthMask(false);bindGeometry(filamentBuffer);
    gl.uniform1f(uniforms.uMode,1);gl.drawArrays(gl.TRIANGLES,0,filamentCount);
    if(formationTime<21){bindGeometry(particleBuffer);gl.uniform1f(uniforms.uMode,3);gl.drawArrays(gl.POINTS,0,particleCount);}
    gl.depthMask(true);gl.disable(gl.BLEND);
    cosmos?.finish(yaw,pitch,pixelRatio);
  }
  function resize() {
    const size=canvas.getBoundingClientRect();
    const maxDimension=Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE),gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
    const requested=Math.min(window.devicePixelRatio||1,1.75)*renderScale;
    pixelRatio=Math.min(requested,Math.sqrt(4000000/Math.max(1,size.width*size.height)),maxDimension/Math.max(1,size.width,size.height));
    const width=Math.max(1,Math.round(size.width*pixelRatio)),height=Math.max(1,Math.round(size.height*pixelRatio));
    if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;
    if(!formationCameraFree&&formationPlaying)updateFormation();
    else if(!formationCameraFree&&formationTime>=ASSEMBLY)distance=Math.max(distance,fitDistance(8.9));
    draw();
  }
  const formationButton=root.querySelector('[data-action="formation"]');
  const timeline=root.querySelector('#formation-time');
  timeline.max=String(DURATION);
  const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
  function fitDistance(base) {
    const aspect=Math.max(0.25,canvas.width/canvas.height);
    return Math.max(base,3.3*Math.sqrt(1+Math.pow(2.62/(aspect*0.92),2)));
  }
  function updateFormation(camera=true) {
    const gathering=clamp(formationTime/ASSEMBLY,0,1);
    reveal=0.035+0.965*(0.3*gathering+0.7*smooth(gathering));
    timeline.value=String(formationTime);
    const second=Math.floor(formationTime);
    if(second!==uiSecond){
      root.querySelector('[data-time]').textContent='00:'+String(second).padStart(2,'0');
      root.querySelector('[data-formation-stage]').textContent=formationTime<3?'A field of particles':formationTime<18?'Particles trace the spiral':formationTime<24?'The structure unfolds':'An unfolding motion study';
      uiSecond=second;
    }
    if(camera){
      const orbit=smooth(formationTime/28),arrival=smooth(formationTime/19),settle=smooth((formationTime-20)/12);
      const drift=Math.max(0,motionTime-DURATION);
      yaw=-0.78+orbit*0.70+Math.sin(drift*0.06)*0.12;
      pitch=0.36-settle*0.09+Math.sin(drift*0.045)*0.025;
      const wide=fitDistance(8.8),close=fitDistance(6.5);
      distance=close+arrival*(wide-close);
      roll=-0.12+settle*0.055;
      targetYaw=yaw;targetPitch=pitch;targetRoll=roll;
    }
    root.querySelector('.ns-axial').hidden=Math.abs(pitch)>0.7;
    root.querySelector('.ns-inward').hidden=Math.abs(pitch)>0.7;
  }
  function updateFormationButton(seek=false){
    formationButton.replaceChildren();
    const icon=document.createElement('span');icon.setAttribute('aria-hidden','true');icon.textContent=formationPlaying?'Ⅱ':'▶';
    formationButton.append(icon,formationPlaying?'Pause':'Play');
    formationButton.setAttribute('aria-pressed',String(formationPlaying));
    window.dispatchEvent(new CustomEvent('vortex-playback',{detail:{playing:formationPlaying,time:motionTime,seek}}));
  }
  function ensureFrame(){if(!frameId&&visible&&!document.hidden){lastTime=0;frameId=requestAnimationFrame(tick);}}
  function tick(now) {
    frameId=0;
    if(!visible||document.hidden||!root.isConnected) {lastTime=0;return;}
    const elapsed=lastTime?Math.max((now-lastTime)/1000,0):0;
    if(elapsed>0&&elapsed<0.15){
      frameAverage=frameAverage*0.95+elapsed*1000*0.05;frameSamples++;
      if(frameSamples%60===0)canvas.dataset.fps=String(Math.round(1000/frameAverage));
      if(frameSamples%180===0&&frameAverage>27&&renderScale>0.7){renderScale=Math.max(0.7,renderScale*0.85);resize();}
    }
    const dt=Math.min(elapsed,0.07);
    if(moving&&(formationPlaying||exploring))clock+=dt*0.16;
    if(formationPlaying){
      motionTime+=elapsed;
      formationTime=Math.min(DURATION,formationTime+elapsed);updateFormation(!formationCameraFree);
    }else{
      const ease=1-Math.exp(-dt*5);
      yaw+=(targetYaw-yaw)*ease;pitch+=(targetPitch-pitch)*ease;roll+=(targetRoll-roll)*ease;
    }
    lastTime=now;draw();
    if(formationPlaying||(exploring&&moving)||Math.abs(targetYaw-yaw)+Math.abs(targetPitch-pitch)+Math.abs(targetRoll-roll)>0.0005)frameId=requestAnimationFrame(tick);
  }
  formationButton.addEventListener('click',()=>{
    formationPlaying=!formationPlaying;updateFormation(!formationCameraFree);updateFormationButton();ensureFrame();draw();
  });
  root.querySelector('[data-action="replay"]').addEventListener('click',()=>{formationTime=0;motionTime=0;clock=0;formationPlaying=true;formationCameraFree=false;updateFormation();updateFormationButton(true);ensureFrame();});
  timeline.addEventListener('input',()=>{const value=Number(timeline.value);if(!Number.isFinite(value))return;formationTime=clamp(value,0,DURATION);motionTime=formationTime;clock=motionTime*0.16;formationPlaying=false;formationCameraFree=false;updateFormation();updateFormationButton(true);ensureFrame();});
  const motion=root.querySelector('[data-action="motion"]');
  motion.addEventListener('click',()=>{
    moving=!moving; motion.setAttribute('aria-pressed',String(moving));
    motion.textContent='Light pulses';
    lastTime=0;
    ensureFrame();
    draw();
  });
  for(const key of ['spin','stretch','viscosity']) {
    const control=root.querySelector('[data-control="'+key+'"]');
    control.addEventListener('input',()=>{
      const value=Number(control.value);
      if(!Number.isFinite(value))return;
      settings[key]=clamp(value,Number(control.min),Number(control.max));
      root.querySelectorAll('[data-preset]').forEach(button=>{button.classList.remove('active');button.setAttribute('aria-pressed','false');});
      root.querySelector('[data-value="'+key+'"]').textContent=settings[key].toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+'×';
      if(rebuildFrame)clearTimeout(rebuildFrame);
      rebuildFrame=setTimeout(rebuild,100);
    });
  }
  root.querySelector('[data-control="view"]').addEventListener('change',event=>{
    const view=event.target.value;
    formationPlaying=false;formationCameraFree=true;updateFormationButton();
    targetYaw=view==='angle'?-0.68:0;targetPitch=view==='top'?Math.PI/2:view==='front'?0:0.27;targetRoll=view==='angle'?-0.12:0;
    if(reducedMotion){yaw=targetYaw;pitch=targetPitch;roll=targetRoll;}
    root.querySelector('.ns-axial').hidden=view==='top';
    root.querySelector('.ns-inward').hidden=view==='top';
    ensureFrame();draw();
  });
  const presets={balance:{spin:1,stretch:1,viscosity:1},wide:{spin:1,stretch:1,viscosity:2.5},stretch:{spin:1,stretch:1.85,viscosity:1}};
  root.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{
    const values=presets[button.dataset.preset];if(!values)return;
    for(const [key,value] of Object.entries(values)){
      const input=root.querySelector('[data-control="'+key+'"]');input.value=String(value);input.dispatchEvent(new Event('input'));
    }
    button.classList.add('active');button.setAttribute('aria-pressed','true');
  }));
  root.querySelector('[data-action="reset-camera"]').addEventListener('click',()=>{formationPlaying=false;formationTime=DURATION;motionTime=DURATION;reveal=1;formationCameraFree=false;targetYaw=-0.68;targetPitch=0.27;targetRoll=-0.12;distance=fitDistance(8.9);if(reducedMotion){yaw=targetYaw;pitch=targetPitch;roll=targetRoll;}root.querySelector('[data-control="view"]').value='angle';updateFormation(false);updateFormationButton();ensureFrame();});
  function zoom(factor){formationCameraFree=true;distance=clamp(distance*factor,3.6,Math.max(16,fitDistance(16)));ensureFrame();}
  root.querySelector('[data-action="zoom-in"]').addEventListener('click',()=>zoom(0.88));
  root.querySelector('[data-action="zoom-out"]').addEventListener('click',()=>zoom(1.14));
  let drag=null;
  canvas.addEventListener('pointerdown',event=>{formationCameraFree=true;drag={id:event.pointerId,x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener('pointermove',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    yaw+=(event.clientX-drag.x)*0.008;pitch=clamp(pitch+(event.clientY-drag.y)*0.008,-1.55,1.55);
    targetYaw=yaw;targetPitch=pitch;
    drag.x=event.clientX;drag.y=event.clientY;
    root.querySelector('.ns-axial').hidden=Math.abs(pitch)>0.7;
    root.querySelector('.ns-inward').hidden=Math.abs(pitch)>0.7;
    ensureFrame();
  });
  canvas.addEventListener('pointerup',()=>{drag=null;});
  canvas.addEventListener('pointercancel',()=>{drag=null;});
  canvas.addEventListener('wheel',event=>{event.preventDefault();zoom(Math.exp(clamp(event.deltaY,-100,100)*0.0015));},{passive:false});
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();moving=false;formationPlaying=false;cancelAnimationFrame(frameId);frameId=0;status.textContent='The 3D view was interrupted. Refresh or open Films.';status.setAttribute('role','alert');root.querySelector('.scene-fallback').hidden=false;canvas.hidden=true;});
  let resizeTimer=0;
  const resizeObserver=new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(resize,120);}); resizeObserver.observe(canvas);
  const visibilityObserver=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)ensureFrame();});
  visibilityObserver.observe(canvas);
  const themeObserver=new MutationObserver(theme);
  themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['class','style','data-theme']});
  const colorScheme=window.matchMedia('(prefers-color-scheme: dark)');colorScheme.addEventListener('change',theme);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)ensureFrame();});
  motion.setAttribute('aria-pressed',String(moving));motion.textContent='Light pulses';
  updateFormation(!reducedMotion);updateFormationButton();resize();theme();rebuild();ensureFrame();
  root.dataset.ready='true';
  window.vortexControls={
    duration:DURATION,
    play:()=>{formationPlaying=true;updateFormationButton();ensureFrame();},
    getState:()=>({parameters:{...settings},formationTime,formationPlaying,motionTime,moving,exploring,view:root.querySelector('[data-control="view"]').value}),
    setExplorer:enabled=>{
      if(typeof enabled!=='boolean')throw new Error('Invalid mode');
      if(exploring===enabled)return;
      exploring=enabled;
      if(enabled){
        formationTime=DURATION;motionTime=DURATION;formationPlaying=false;formationCameraFree=true;
        yaw=targetYaw=-0.68;pitch=targetPitch=0.27;roll=targetRoll=-0.12;distance=fitDistance(9.5);
        root.querySelector('[data-control="view"]').value='angle';
        updateFormation(false);updateFormationButton();
      }
      ensureFrame();draw();
    },
    setParameter:(name,value)=>{if(!Object.hasOwn(settings,name)||typeof value!=='number'||!Number.isFinite(value))throw new Error('Invalid parameter');const input=root.querySelector('[data-control="'+name+'"]');input.value=String(clamp(value,Number(input.min),Number(input.max)));input.dispatchEvent(new Event('input'));return {...settings};},
    setFormationTime:value=>{if(typeof value!=='number'||!Number.isFinite(value))throw new Error('Invalid time');timeline.value=String(clamp(value,0,DURATION));timeline.dispatchEvent(new Event('input'));return formationTime;},
    setView:view=>{if(!['angle','front','top'].includes(view))throw new Error('Invalid camera view');const input=root.querySelector('[data-control="view"]');input.value=view;input.dispatchEvent(new Event('change'));return view;}
  };
};
