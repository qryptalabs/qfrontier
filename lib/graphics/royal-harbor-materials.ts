import * as THREE from 'three';

export type RoyalSurfaceKind='masonry'|'landscape'|'wood';
type SurfaceBinding={kind:RoyalSurfaceKind;compile:THREE.MeshStandardMaterial['onBeforeCompile'];cacheKey:string};
const bindings=new WeakMap<THREE.MeshStandardMaterial,SurfaceBinding>();

const functions=/* glsl */`
varying vec3 vRoyalDetailPosition;
float royalHash(vec2 p){p=fract(p*vec2(.1031,.11369));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
float royalNoise(vec2 p){
  vec2 cell=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(royalHash(cell),royalHash(cell+vec2(1.0,0.0)),f.x),mix(royalHash(cell+vec2(0.0,1.0)),royalHash(cell+vec2(1.0)),f.x),f.y);
}
vec3 royalBrick(vec2 position){
  vec2 p=position/vec2(1.35,.68);p.x+=mod(floor(p.y),2.0)*.5;
  vec2 width=max(fwidth(p),vec2(.00001)),edge=min(fract(p),1.0-fract(p));
  vec2 joints=1.0-smoothstep(vec2(.018),vec2(.018)+width*.8,edge);
  float joint=max(joints.x,joints.y)*(1.0-smoothstep(.3,1.6,max(width.x,width.y)));
  float grain=(royalNoise(position*7.0)-.5)/(1.0+dot(fwidth(position*7.0),fwidth(position*7.0)));
  float block=royalHash(floor(p));
  return vec3(.94+block*.12-joint*.24+grain*.055,-joint*.035+grain*.007,joint);
}
vec3 royalMasonry(vec3 p,vec3 n){
  vec3 weights=pow(abs(n),vec3(5.0));weights/=max(dot(weights,vec3(1.0)),.00001);
  return royalBrick(p.zy)*weights.x+royalBrick(p.xz)*weights.y+royalBrick(p.xy)*weights.z;
}
vec3 royalWood(vec3 p,vec3 n){
  vec3 weights=abs(n);weights/=max(dot(weights,vec3(1.0)),.00001);
  vec2 grainPosition=vec2(p.x+p.z*.74,p.y)*weights.y+vec2(p.x+p.z,p.y)* (1.0-weights.y);
  float footprint=max(length(fwidth(grainPosition)),.00001);
  float longGrain=sin(grainPosition.x*34.0+royalNoise(grainPosition*vec2(3.0,.19))*5.0)/(1.0+footprint*22.0);
  float weather=royalNoise(grainPosition*vec2(.7,.16))-.5;
  float pores=royalNoise(grainPosition*vec2(22.0,1.3))-.5;
  return vec3(.96+weather*.15+longGrain*.055+pores*.025,-longGrain*.003+weather*.006,.0);
}
vec3 royalLandscape(vec3 p,vec3 n,vec3 colour){
  float up=smoothstep(.38,.85,abs(n.y));
  float green=smoothstep(.012,.13,colour.g-max(colour.r,colour.b)*.94);
  float broad=royalNoise(p.xz*.17)*.62+royalNoise(vec2(p.x+p.z*.4,p.y)*.61)*.38;
  float footprint=length(fwidth(p.xz*3.2));
  float fine=(royalNoise(p.xz*3.2)-.5)/(1.0+footprint*footprint);
  float strata=sin(p.y*2.1+royalNoise(vec2(p.x+p.z*.6,p.y)*.25)*2.2);
  float rock=.94+(broad-.5)*.18+strata*.055;
  float ground=.94+(broad-.5)*.23+fine*mix(.055,.11,green);
  return vec3(mix(rock,ground,up),mix(strata*.022+fine*.008,fine*.011,up),green*up);
}
vec3 royalBump(vec3 p,vec3 n,float height){
  vec3 dx=dFdx(p),dy=dFdy(p),rx=cross(dy,n),ry=cross(n,dx);
  float determinant=dot(dx,rx);
  vec3 gradient=(dFdx(height)*rx+dFdy(height)*ry)*sign(determinant)/max(abs(determinant),.00000001);
  // Filtered grain must remain a small surface detail, not turn a whole wall black.
  float slope=length(gradient);gradient*=min(1.0,.32/max(slope,.00001));
  return normalize(n-gradient);
}
`;

/** Adds only surface shading. Positions, silhouettes, UVs and collision geometry are unchanged. */
export function applyRoyalSurfaceDetail(material:THREE.MeshStandardMaterial,kind:RoyalSurfaceKind):void {
  const existing=bindings.get(material);if(existing?.kind===kind)return;
  const binding:SurfaceBinding={kind,compile:existing?.compile??material.onBeforeCompile,cacheKey:existing?.cacheKey??material.customProgramCacheKey()};bindings.set(material,binding);
  material.onBeforeCompile=(shader,renderer)=>{
    binding.compile.call(material,shader,renderer);
    shader.vertexShader=`varying vec3 vRoyalDetailPosition;\n${shader.vertexShader}`;
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
      vec4 royalDetailPosition=vec4(transformed,1.0);
      #ifdef USE_BATCHING
        royalDetailPosition=batchingMatrix*royalDetailPosition;
      #endif
      #ifdef USE_INSTANCING
        royalDetailPosition=instanceMatrix*royalDetailPosition;
      #endif
      vRoyalDetailPosition=(modelMatrix*royalDetailPosition).xyz;`);
    shader.fragmentShader=`${functions}\n${shader.fragmentShader}`;
    const sample=kind==='masonry'?'royalMasonry(vRoyalDetailPosition,royalWorldNormal)':kind==='wood'?'royalWood(vRoyalDetailPosition,royalWorldNormal)':'royalLandscape(vRoyalDetailPosition,royalWorldNormal,diffuseColor.rgb)';
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      vec3 royalWorldNormal=inverseTransformDirection(normal,viewMatrix);
      vec3 royalFinish=${sample};
      diffuseColor.rgb*=royalFinish.x;
      ${kind==='landscape'?'diffuseColor.rgb*=mix(vec3(1.0),vec3(.97,1.015,.96),royalFinish.z);':''}
      roughnessFactor=clamp(roughnessFactor+${kind==='wood'?'-.015':'.015'}+royalFinish.z*.025,.35,.98);
      royalWorldNormal=royalBump(vRoyalDetailPosition,royalWorldNormal,royalFinish.y);
      normal=normalize(mat3(viewMatrix)*royalWorldNormal);`);
  };
  material.customProgramCacheKey=()=>`${binding.cacheKey}|royal-surface-${kind}-v1`;material.needsUpdate=true;
}
