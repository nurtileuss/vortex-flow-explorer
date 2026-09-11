'use strict';
// Independent D2Q9 BGK lattice-Boltzmann solver. All quantities are lattice units.
// Half-way bounce-back at the projected body; prescribed far-field and open outflow.
globalThis.AeroFluid=class AeroFluid {
  constructor(width,height,mask,speed=1){
    this.width=width;this.height=height;this.n=width*height;
    if(mask.length!==this.n)throw new Error('Invalid obstacle grid');
    this.mask=new Uint8Array(mask);this.f=new Float32Array(this.n*9);this.post=new Float32Array(this.n*9);this.next=new Float32Array(this.n*9);
    this.ux=new Float32Array(this.n);this.uy=new Float32Array(this.n);this.rho=new Float32Array(this.n);
    this.ex=[0,1,0,-1,0,1,-1,-1,1];this.ey=[0,0,1,0,-1,1,1,-1,-1];this.opp=[0,3,4,1,2,7,8,5,6];this.weights=[4/9,1/9,1/9,1/9,1/9,1/36,1/36,1/36,1/36];
    this.inlet=0.055*Math.max(.65,Math.min(1.4,speed));this.tau=.62;this.steps=0;this.healthy=true;
    for(let i=0;i<this.n;i++){this.rho[i]=1;this.ux[i]=this.mask[i]?0:this.inlet;for(let k=0;k<9;k++)this.f[i*9+k]=this.equilibrium(k,1,this.ux[i],0);}
  }
  equilibrium(k,r,u,v){const cu=3*(this.ex[k]*u+this.ey[k]*v);return this.weights[k]*r*(1+cu+.5*cu*cu-1.5*(u*u+v*v));}
  step(){
    const {width:w,height:h,n,mask,f,post,next,ux,uy,rho,ex,ey,opp,weights}=this;
    const omega=1/this.tau,inlet=this.inlet;
    for(let i=0;i<n;i++){
      const o=i*9;
      if(mask[i]){ux[i]=uy[i]=0;rho[i]=1;continue;}
      let r=0,u=0,v=0;for(let k=0;k<9;k++){const q=f[o+k];r+=q;u+=q*ex[k];v+=q*ey[k];}u/=r;v/=r;
      if(!Number.isFinite(r)||r<.5||r>1.5||u*u+v*v>.16){this.healthy=false;return false;}
      rho[i]=r;ux[i]=u;uy[i]=v;
      const uu=1.5*(u*u+v*v),x=i%w;
      // Absorb disturbances near the outlet rather than reflect them into the wake.
      const sponge=x>w-22?.06*((x-w+22)/22)**2:0;
      for(let k=0;k<9;k++){const cu=3*(ex[k]*u+ey[k]*v),eq=weights[k]*r*(1+cu+.5*cu*cu-uu);let q=f[o+k]+omega*(eq-f[o+k]);if(sponge)q+=(this.equilibrium(k,1,inlet,0)-q)*sponge;post[o+k]=q;}
    }
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=x+y*w,o=i*9;if(mask[i])continue;
      if(x===0||y===0||y===h-1){for(let k=0;k<9;k++)next[o+k]=this.equilibrium(k,1,inlet,0);continue;}
      if(x===w-1){for(let k=0;k<9;k++)next[o+k]=post[(i-1)*9+k];continue;}
      for(let k=0;k<9;k++){const source=x-ex[k]+(y-ey[k])*w;next[o+k]=mask[source]?post[o+opp[k]]:post[source*9+k];}
    }
    this.f=next;this.next=f;this.steps++;return true;
  }
  advance(count){for(let i=0;i<count;i++)if(!this.step())return false;return true;}
  snapshot(){return{ux:new Float32Array(this.ux),uy:new Float32Array(this.uy),rho:new Float32Array(this.rho),steps:this.steps,inlet:this.inlet,healthy:this.healthy};}
};
