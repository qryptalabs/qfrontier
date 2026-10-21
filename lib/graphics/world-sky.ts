import * as THREE from 'three';
import type {WorldBiome} from './world-geography.ts';

/** A camera-centred atmosphere; no second render, downloads or simulated weather. */
export function createWorldSky(){
 const uniforms={zenith:{value:new THREE.Color(0x427fae)},horizon:{value:new THREE.Color(0xd8e6e8)},sunTint:{value:new THREE.Color(0xffefd0)},sunDirection:{value:new THREE.Vector3(.45,.7,.3).normalize()},clock:{value:0},cloudCover:{value:.42}};
 const material=new THREE.ShaderMaterial({name:'world-atmosphere',side:THREE.BackSide,depthTest:false,depthWrite:false,uniforms,
  vertexShader:'varying vec3 skyDirection; void main(){skyDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:`varying vec3 skyDirection; uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunTint; uniform vec3 sunDirection; uniform float clock; uniform float cloudCover;
   float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
   float clouds(vec2 p){return noise(p)*.54+noise(p*2.03)*.27+noise(p*4.11)*.13+noise(p*8.17)*.06;}
   void main(){vec3 d=normalize(skyDirection);float up=max(d.y,0.);vec3 color=mix(horizon,zenith,pow(up,.48));
    float sun=max(dot(d,normalize(sunDirection)),0.);color+=sunTint*(pow(sun,480.)*.9+pow(sun,18.)*.12);
    vec2 uv=d.xz/max(d.y+.15,.14)*2.9+vec2(clock*.0017,clock*.0006);float n=clouds(uv),mask=smoothstep(.56-cloudCover*.1,.77,n)*smoothstep(.035,.18,d.y);
    vec3 cloud=mix(horizon*.87,vec3(.98,.99,1.),smoothstep(.56,.78,n));color=mix(color,cloud,mask*.86);
    gl_FragColor=vec4(color,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`});
 const geometry=new THREE.SphereGeometry(4000,24,12),mesh=new THREE.Mesh(geometry,material);mesh.name='world-gradient-atmosphere';mesh.frustumCulled=false;mesh.renderOrder=-1000;
 let disposed=false;
 return{mesh,setBiome(biome:WorldBiome){uniforms.zenith.value.set(biome==='ice'?0x608cad:biome==='desert'?0x5184a4:0x427fae);uniforms.horizon.value.set(biome==='ice'?0xe2edf0:biome==='desert'?0xe8dac0:0xd8e6e8);uniforms.cloudCover.value=biome==='desert'?.16:.42;},update(camera:THREE.Camera,sun:THREE.Vector3,seconds:number){mesh.position.copy(camera.position);uniforms.sunDirection.value.copy(sun).normalize();uniforms.clock.value=Number.isFinite(seconds)?seconds%4096:0;},dispose(){if(disposed)return;disposed=true;mesh.removeFromParent();geometry.dispose();material.dispose();}};
}
