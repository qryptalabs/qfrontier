import * as THREE from 'three';

const PERIOD=4096,A=2*Math.PI*997/PERIOD,B=2*Math.PI*641/PERIOD;
export function maritimeTime(seconds:number):number{return Number.isFinite(seconds)?((seconds%PERIOD)+PERIOD)%PERIOD:0;}
/** The exact same small wave field drives the sea surface and vessel poses. */
export function maritimeWave(x:number,y:number,seconds:number):{height:number;dx:number;dy:number}{
  const t=maritimeTime(seconds),a=x*.14+y*.08-A*t,b=x*-.09+y*.17-B*t;
  return{height:Math.sin(a)*.12+Math.sin(b)*.06,dx:Math.cos(a)*.0168-Math.cos(b)*.0054,dy:Math.cos(a)*.0096+Math.cos(b)*.0102};
}
export function maritimeBoatPose(x:number,y:number,seconds:number,yaw:number){
  const wave=maritimeWave(x,y,seconds),forward=wave.dx*Math.sin(yaw)+wave.dy*Math.cos(yaw),right=wave.dx*Math.cos(yaw)-wave.dy*Math.sin(yaw);
  return{height:wave.height,pitch:-Math.atan(forward),roll:Math.atan(right)};
}
export function createMaritimeWaterTexture(ground:THREE.Texture):THREE.Texture{
  const size=64,pixels=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const hash=Math.imul(x+17,374761393)^Math.imul(y+31,668265263),crest=y%13<2&&(x+Math.floor(y/13)*11)%29<7,value=239+((hash>>>0)%5)-2+(crest?(y%13===0?9:4):0),index=(y*size+x)*4;pixels.set([value,value,Math.min(255,value+2),255],index);}
  const texture=new THREE.DataTexture(pixels,size,size);texture.name='independent-world-water';texture.colorSpace=ground.colorSpace;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestMipmapNearestFilter;texture.generateMipmaps=true;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.needsUpdate=true;return texture;
}
/** Soft, broken foam patches replace opaque rectangular wake bars. Caller owns it. */
export function createMaritimeFoamTexture(){
  const width=64,height=32,pixels=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const u=(x+.5)/width*2-1,v=(y+.5)/height,hash=(Math.imul(x+17,374761393)^Math.imul(y+31,668265263))>>>0,noise=hash%101/100,envelope=Math.pow(Math.max(0,1-u*u),1.5)*Math.pow(Math.sin(v*Math.PI),.8),alpha=Math.round(Math.max(0,Math.min(1,(noise*.85+.25)*envelope-.12))*210),index=(y*width+x)*4;pixels.set([220,239,231,alpha],index);}
  const texture=new THREE.DataTexture(pixels,width,height);texture.name='broken-maritime-foam';texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;return texture;
}
export interface MaritimeWaterOptions {depthAttribute?:boolean;skyColor?:THREE.ColorRepresentation}
/** A single-pass surface: real wave slopes, depth tint and a procedural sky reflection. */
export function createMaritimeWaterMotion(material:THREE.MeshStandardMaterial,options:MaritimeWaterOptions={}){
  const uniforms={qSeaTime:{value:0},qWorldOrigin:{value:new THREE.Vector2()},qWaterSky:{value:new THREE.Color(options.skyColor??0x9fc6d2)},qWaterSun:{value:new THREE.Vector3(-75,130,80).normalize()}};
  const depth=options.depthAttribute?'max(0.0,waterDepth)':'8.0';
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=`uniform float qSeaTime; uniform vec2 qWorldOrigin; attribute float seaWave; ${options.depthAttribute?'attribute float waterDepth;':''}
      varying vec4 vQWaterPoint;\n${shader.vertexShader}`;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vec2 qSeaPoint=(modelMatrix*vec4(transformed,1.0)).xz+qWorldOrigin;
      transformed.y+=seaWave*(sin(dot(qSeaPoint,vec2(.14,.08))-${A.toPrecision(13)}*qSeaTime)*.12+sin(dot(qSeaPoint,vec2(-.09,.17))-${B.toPrecision(13)}*qSeaTime)*.06);
      vQWaterPoint=vec4(qSeaPoint,seaWave,${depth});`);
    shader.fragmentShader=`uniform float qSeaTime; uniform vec3 qWaterSky; uniform vec3 qWaterSun; varying vec4 vQWaterPoint;\n${shader.fragmentShader}`;
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      // Evaluate derivatives per fragment: a coarse sea mesh still has a lit,
      // continuously moving surface. Fine ripples change normals, never the
      // shared CPU/GPU height on which vessels and gangways are grounded.
      vec2 qWaterP=vQWaterPoint.xy;
      float qWaveA=dot(qWaterP,vec2(.14,.08))-${A.toPrecision(13)}*qSeaTime;
      float qWaveB=dot(qWaterP,vec2(-.09,.17))-${B.toPrecision(13)}*qSeaTime;
      float qDetailFade=1.0/(1.0+dot(fwidth(qWaterP),fwidth(qWaterP))*.3);
      vec2 qSlope=(cos(qWaveA)*vec2(.0168,.0096)+cos(qWaveB)*vec2(-.0054,.0102))*mix(.35,1.0,vQWaterPoint.z);
      qSlope+=qDetailFade*(cos(dot(qWaterP,vec2(.47,.29))-${A.toPrecision(13)}*qSeaTime)*vec2(.1175,.0725)+cos(dot(qWaterP,vec2(-.23,.55))+${B.toPrecision(13)}*qSeaTime)*vec2(-.0483,.1155));
      normal=normalize(mat3(viewMatrix)*vec3(-qSlope.x,1.0,-qSlope.y));
      float qOpticalDepth=1.0-exp(-vQWaterPoint.w*.68);
      float qShore=1.0-smoothstep(.08,1.25,vQWaterPoint.w);
      float qFoamBand=sin(vQWaterPoint.w*8.5-qSeaTime*1.4+sin(dot(qWaterP,vec2(.43,.29)))*.7);
      float qFoam=qShore*smoothstep(.18,.76,qFoamBand)*.62;
      qFoam+=smoothstep(.13,.18,sin(qWaveA)*.12+sin(qWaveB)*.06)*.045*vQWaterPoint.z;
      diffuseColor.rgb=mix(diffuseColor.rgb*vec3(1.0,1.3,1.18),diffuseColor.rgb*vec3(.1,.32,.62),qOpticalDepth);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.66,.82,.77),qFoam);
      roughnessFactor=clamp(roughnessFactor*.62+qFoam*.34,.16,.7);
      vec3 qViewDir=isOrthographic?vec3(0.0,0.0,1.0):normalize(vViewPosition);
      float qFresnel=.02+.98*pow(1.0-clamp(dot(normal,qViewDir),0.0,1.0),5.0);
      diffuseColor.a*=clamp(mix(.68,1.0,1.0-exp(-vQWaterPoint.w*.24))+qFresnel*.12+qFoam*.16,.68,1.0);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      vec3 qWorldNormal=inverseTransformDirection(normal,viewMatrix);
      vec3 qWorldView=inverseTransformDirection(-qViewDir,viewMatrix);
      vec3 qSkyRay=reflect(qWorldView,qWorldNormal);
      vec3 qSkyReflection=mix(qWaterSky*.63+vec3(.07,.08,.075),qWaterSky,clamp(qSkyRay.y*.7+.3,0.0,1.0));
      outgoingLight=mix(outgoingLight,qSkyReflection,qFresnel*.68*(1.0-qFoam));
      // Reuse the standard material's shadowed direct light: no extra shadow
      // lookups or bright sun glitter underneath an opaque wharf.
      float qSunExposure=clamp(dot(reflectedLight.directDiffuse,vec3(.333333))/max(dot(diffuseColor.rgb,vec3(.333333)),.0001)*2.0,0.0,1.0);
      vec3 qSunHalf=normalize(qWaterSun-qWorldView);
      float qSunFacing=max(dot(qWorldNormal,qSunHalf),0.0);
      float qSunGlitter=pow(qSunFacing,56.0)*.3+pow(qSunFacing,200.0)*.8;
      outgoingLight+=vec3(.95,.85,.68)*qSunGlitter*qSunExposure*(1.0-qFoam);
      #include <opaque_fragment>`);
  };
  material.customProgramCacheKey=()=> `qfrontier-maritime-surface-v3-${options.depthAttribute?'depth':'uniform'}`;
  return{update(seconds:number,origin:{x:number;y:number}){uniforms.qSeaTime.value=maritimeTime(seconds);uniforms.qWorldOrigin.value.set(origin.x,origin.y);},setSkyColor(color:THREE.ColorRepresentation){uniforms.qWaterSky.value.set(color);},setSunDirection(direction:{x:number;y:number;z:number}){if(Number.isFinite(direction.x+direction.y+direction.z)&&Math.hypot(direction.x,direction.y,direction.z)>1e-8)uniforms.qWaterSun.value.set(direction.x,direction.y,direction.z).normalize();}};
}
