/* Original cinematic lighting. These screen effects do not alter the flow field. */
(() => {
  'use strict';
  window.createVortexCosmos = (gl, canvas) => {
    const depthTexture=gl.getExtension('WEBGL_depth_texture');
    const uvPrecision=(gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT)?.precision??0)>0?'highp':'mediump';
    const vertex = `
      attribute vec2 aQuad;
      varying ${uvPrecision} vec2 vUv;
      void main() { vUv=aQuad*0.5+0.5; gl_Position=vec4(aQuad,0.0,1.0); }`;
    const precision = `
      #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      #else
      precision mediump float;
      #endif
      varying ${uvPrecision} vec2 vUv;`;
    const blur = precision + `
      uniform sampler2D uImage;
      uniform vec2 uStep;
      uniform float uExtract;
      vec3 sampleLight(vec2 uv) {
        vec3 light=texture2D(uImage,uv).rgb;
        float peak=max(light.r,max(light.g,light.b));
        return light*mix(1.0,smoothstep(0.62,1.0,peak),uExtract);
      }
      void main() {
        vec3 light=sampleLight(vUv)*0.227027;
        light+=(sampleLight(vUv+uStep*1.384615)+sampleLight(vUv-uStep*1.384615))*0.316216;
        light+=(sampleLight(vUv+uStep*3.230769)+sampleLight(vUv-uStep*3.230769))*0.070270;
        gl_FragColor=vec4(light,1.0);
      }`;
    const composite = precision + `
      uniform sampler2D uScene, uGlow;
      uniform vec2 uResolution;
      vec3 sceneColor() {
        vec2 pixel=1.0/uResolution;
        vec3 center=texture2D(uScene,vUv).rgb;
        vec3 luma=vec3(0.299,0.587,0.114);
        float nw=dot(texture2D(uScene,vUv-pixel).rgb,luma);
        float ne=dot(texture2D(uScene,vUv+vec2(1.0,-1.0)*pixel).rgb,luma);
        float sw=dot(texture2D(uScene,vUv+vec2(-1.0,1.0)*pixel).rgb,luma);
        float se=dot(texture2D(uScene,vUv+pixel).rgb,luma);
        float middle=dot(center,luma);
        float lo=min(middle,min(min(nw,ne),min(sw,se)));
        float hi=max(middle,max(max(nw,ne),max(sw,se)));
        if(hi-lo<max(0.035,hi*0.12))return center;
        vec2 direction=vec2(-((nw+ne)-(sw+se)),(nw+sw)-(ne+se));
        float reduce=max((nw+ne+sw+se)*0.03125,0.0078125);
        direction=clamp(direction/(min(abs(direction.x),abs(direction.y))+reduce),vec2(-8.0),vec2(8.0))*pixel;
        vec3 a=(texture2D(uScene,vUv-direction/6.0).rgb+texture2D(uScene,vUv+direction/6.0).rgb)*0.5;
        vec3 b=a*0.5+(texture2D(uScene,vUv-direction*0.5).rgb+texture2D(uScene,vUv+direction*0.5).rgb)*0.25;
        float result=dot(b,luma);
        return result<lo||result>hi?a:b;
      }
      void main() {
        vec3 scene=sceneColor();
        vec3 bloom=texture2D(uGlow,vUv).rgb;
        vec3 color=scene+bloom*0.10;
        // A restrained shoulder preserves filament detail in overlapping highlights.
        color=color/(vec3(1.0)+max(color-0.72,0.0)*0.42);
        gl_FragColor=vec4(color,1.0);
      }`;
    const programs=[];
    const resources=[];
    let quad=null, targets=[], width=0, height=0, enabled=true;
    function makeProgram(fragment, names) {
      const program=gl.createProgram();
      const shaders=[];
      try {
        for (const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]) {
          const shader=gl.createShader(type); shaders.push(shader);
          gl.shaderSource(shader,source); gl.compileShader(shader);
          if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error('Cosmic shader');
          gl.attachShader(program,shader);
        }
        gl.bindAttribLocation(program,0,'aQuad'); gl.linkProgram(program);
        if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error('Cosmic program');
        programs.push(program);
        return {program, uniforms:Object.fromEntries(names.map(name=>[name,gl.getUniformLocation(program,name)]))};
      } catch (error) { gl.deleteProgram(program); throw error; }
      finally { for (const shader of shaders) gl.deleteShader(shader); }
    }
    function releaseTargets() {
      for (const [kind,resource] of resources.splice(0)) {
        if (kind==='texture') gl.deleteTexture(resource);
        else if (kind==='depth') gl.deleteRenderbuffer(resource);
        else gl.deleteFramebuffer(resource);
      }
      targets=[];
    }
    function target(w,h,depth) {
      const texture=gl.createTexture();if(!texture)throw new Error('Cosmic texture');resources.push(['texture',texture]);
      gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      const framebuffer=gl.createFramebuffer();if(!framebuffer)throw new Error('Cosmic framebuffer');resources.push(['framebuffer',framebuffer]);
      gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
      if (depth) {
        let hasDepth=false;
        if(depthTexture){
          const depthBuffer=gl.createTexture();if(!depthBuffer)throw new Error('Cosmic depth texture');resources.push(['texture',depthBuffer]);
          gl.bindTexture(gl.TEXTURE_2D,depthBuffer);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
          gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_STENCIL,w,h,0,gl.DEPTH_STENCIL,depthTexture.UNSIGNED_INT_24_8_WEBGL,null);
          gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_STENCIL_ATTACHMENT,gl.TEXTURE_2D,depthBuffer,0);
          hasDepth=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
          if(!hasDepth){gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_STENCIL_ATTACHMENT,gl.TEXTURE_2D,null,0);gl.deleteTexture(depthBuffer);resources.pop();}
        }
        if(!hasDepth){
          const renderbuffer=gl.createRenderbuffer();if(!renderbuffer)throw new Error('Cosmic depth');resources.push(['depth',renderbuffer]);
          gl.bindRenderbuffer(gl.RENDERBUFFER,renderbuffer);
          gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,w,h);
          gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,renderbuffer);
        }
        canvas.dataset.depthBits=String(gl.getParameter(gl.DEPTH_BITS));
      }
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw new Error('Cosmic target');
      return {texture,framebuffer,width:w,height:h};
    }
    let blurPass, finalPass;
    try {
      blurPass=makeProgram(blur,['uImage','uStep','uExtract']);
      finalPass=makeProgram(composite,['uScene','uGlow','uResolution']);
      quad=gl.createBuffer();if(!quad)throw new Error('Cosmic quad');gl.bindBuffer(gl.ARRAY_BUFFER,quad);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    } catch (_) {
      for (const program of programs) gl.deleteProgram(program);
      if (quad) gl.deleteBuffer(quad);
      return null;
    }
    const attributeCount=gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
    function pass(shader, destination) {
      gl.bindFramebuffer(gl.FRAMEBUFFER,destination?.framebuffer??null);
      gl.viewport(0,0,destination?.width??width,destination?.height??height);
      gl.useProgram(shader.program);
      gl.bindBuffer(gl.ARRAY_BUFFER,quad);
      gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    }
    function textureAt(texture,slot,uniform) {
      gl.activeTexture(gl.TEXTURE0+slot);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(uniform,slot);
    }
    return {
      begin() {
        if (!enabled) { gl.bindFramebuffer(gl.FRAMEBUFFER,null);return; }
        if (canvas.width!==width||canvas.height!==height) {
          releaseTargets();width=canvas.width;height=canvas.height;
          try {
            targets=[target(width,height,true),target(Math.max(1,width>>2),Math.max(1,height>>2),false),target(Math.max(1,width>>2),Math.max(1,height>>2),false)];
          } catch (_) { releaseTargets();enabled=false;gl.bindFramebuffer(gl.FRAMEBUFFER,null);return; }
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER,targets[0].framebuffer);
      },
      finish() {
        if (!enabled) return;
        gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.depthMask(false);
        for (let i=0;i<attributeCount;i++) gl.disableVertexAttribArray(i);
        pass(blurPass,targets[1]);
        textureAt(targets[0].texture,0,blurPass.uniforms.uImage);
        gl.uniform2f(blurPass.uniforms.uStep,0.9/targets[1].width,0);
        gl.uniform1f(blurPass.uniforms.uExtract,1);gl.drawArrays(gl.TRIANGLES,0,6);
        pass(blurPass,targets[2]);
        textureAt(targets[1].texture,0,blurPass.uniforms.uImage);
        gl.uniform2f(blurPass.uniforms.uStep,0,0.9/targets[2].height);
        gl.uniform1f(blurPass.uniforms.uExtract,0);gl.drawArrays(gl.TRIANGLES,0,6);
        pass(finalPass,null);
        textureAt(targets[0].texture,0,finalPass.uniforms.uScene);
        textureAt(targets[2].texture,1,finalPass.uniforms.uGlow);
        gl.uniform2f(finalPass.uniforms.uResolution,width,height);
        gl.drawArrays(gl.TRIANGLES,0,6);
        gl.activeTexture(gl.TEXTURE0);gl.depthMask(true);
      }
    };
  };
})();
