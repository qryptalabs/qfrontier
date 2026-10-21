import * as THREE from 'three';
import {finishGraphicsBuild,runGraphicsBuild,type GraphicsBuildOptions} from './graphics-build.ts';
import type { RenderQuality } from './scene-data.ts';
import { PLANET_ANCHOR, PLANET_RADIUS } from './planet-data.ts';
import { planetTerrainAt } from './world-geography.ts';
export { planetTerrainAt } from './world-geography.ts';

export interface PlanetSurface {
  group: THREE.Group;
  planet: THREE.Mesh;
  radius: number;
  animate(time: number, reducedMotion: boolean): void;
  dispose(): void;
}

const DEG = Math.PI / 180;
const clamp = (value: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, value));
const smooth = (lo: number, hi: number, value: number) => { const t = clamp((value - lo) / (hi - lo)); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
function hash(x: number, y: number, z: number) {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ 0x6a09e667;
  n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function noise(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const sx = smooth(0, 1, x - ix), sy = smooth(0, 1, y - iy), sz = smooth(0, 1, z - iz);
  const a = mix(hash(ix, iy, iz), hash(ix + 1, iy, iz), sx), b = mix(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), sx);
  const c = mix(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), sx), d = mix(hash(ix, iy + 1, iz + 1), hash(ix + 1, iy + 1, iz + 1), sx);
  return mix(mix(a, b, sy), mix(c, d, sy), sz);
}
function fbm(x: number, y: number, z: number, octaves = 4) {
  let sum = 0, amplitude = .5, weight = 0;
  for (let octave = 0; octave < octaves; octave++) { sum += noise(x, y, z) * amplitude; weight += amplitude; x = x * 2.03 + 13.1; y = y * 2.01 + 7.7; z = z * 2.02 + 4.3; amplitude *= .49; }
  return sum / weight;
}
function direction(lat: number, lon: number) {
  const cos = Math.cos(lat * DEG); return { x: cos * Math.cos(lon * DEG), y: Math.sin(lat * DEG), z: -cos * Math.sin(lon * DEG) };
}
export function planetTextureWidth(quality: RenderQuality): number { return quality === 'performance' ? 512 : quality === 'auto' ? 1024 : 2048; }

type PlanetMaps = { color: THREE.DataTexture; bump: THREE.DataTexture; roughness: THREE.DataTexture; emission: THREE.DataTexture; width: number };
function texture(data: Uint8Array, width: number, height: number, name: string, color = false) {
  const map = new THREE.DataTexture(data, width, height, THREE.RGBAFormat); map.name = name;
  map.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  map.wrapS = THREE.RepeatWrapping; map.wrapT = THREE.ClampToEdgeWrapping;
  // Generated rows start at the north pole; SphereGeometry has v=1 there.
  map.flipY = true;
  map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter; map.generateMipmaps = true; map.needsUpdate = true;
  return map;
}
function* buildPlanetMaps(width: number): Generator<void,PlanetMaps,unknown> {
  const height = width / 2, baseWidth = Math.min(512, width / 2), baseHeight = baseWidth / 2;
  const elevations = new Float32Array(baseWidth * baseHeight), moisture = new Float32Array(baseWidth * baseHeight);
  for (let row = 0; row < baseHeight; row++) for (let col = 0; col < baseWidth; col++) {
    if(col===0&&row%4===0)yield;
    const sample = planetTerrainAt(90 - row / (baseHeight - 1) * 180, col / baseWidth * 360 - 180), index = row * baseWidth + col;
    elevations[index] = sample.elevation; moisture[index] = sample.moisture;
  }
  const sample = (map: Float32Array, u: number, v: number) => {
    const x = u * baseWidth, y = clamp(v) * (baseHeight - 1), x0 = Math.floor(x) % baseWidth, y0 = Math.floor(y), x1 = (x0 + 1) % baseWidth, y1 = Math.min(baseHeight - 1, y0 + 1);
    return mix(mix(map[y0 * baseWidth + x0], map[y0 * baseWidth + x1], x - Math.floor(x)), mix(map[y1 * baseWidth + x0], map[y1 * baseWidth + x1], x - Math.floor(x)), y - y0);
  };
  const colorData = new Uint8Array(width * height * 4), bumpData = new Uint8Array(colorData.length), roughnessData = new Uint8Array(colorData.length), emissionData = new Uint8Array(colorData.length);
  const deep = [13, 43, 75], ocean = [20, 76, 111], shallows = [45, 128, 137], beach = [183, 168, 108];
  const blendColor = (a: number[], b: number[], t: number) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    if(col===0&&row%4===0)yield;
    const u = col / width, v = row / (height - 1), e = sample(elevations, u, v), wet = sample(moisture, u, v), lat = Math.abs(90 - v * 180);
    const n = hash(col >> 1, row >> 1, 97), index = (row * width + col) * 4;
    let rgb: number[];
    if (e <= 0) {
      rgb = blendColor(deep, ocean, 1 - smooth(.04, .82, -e));
      const shallow = 1 - smooth(.015, .19, -e); rgb = blendColor(rgb, shallows, shallow * .82);
    } else {
      const hot = 1 - lat / 90, desert = lat > 11 && lat < 42 && wet < .45;
      rgb = desert ? blendColor([151,121,72],[196,162,103],n * .55 + .25) : wet > .55 ? blendColor([28,73,49],[50,111,65],hot * .7 + n * .2) : blendColor([91,118,62],[135,146,77],(1 - wet) * .75);
      if (e < .065) rgb = blendColor(beach, rgb, smooth(.009, .065, e));
      if (e > .43) rgb = blendColor(rgb, [112,117,105], smooth(.43, .67, e));
      const snow = smooth(.7 - Math.max(0, lat - 46) * .009, .86 - Math.max(0, lat - 46) * .009, e);
      rgb = blendColor(rgb, [224,232,223], snow);
      if (lat > 64) rgb = blendColor(rgb,[154,164,139],smooth(64,77,lat) * .7);
    }
    // The ground sampler treats latitude 77° onward as permanent sea ice.
    // Finish the soft, irregular margin there so descending from an icy cap
    // never replaces a visibly blue orbital ocean with white glacial ground.
    const ice = smooth(75 + (n - .5) * .8, 77, lat); rgb = blendColor(rgb, [218,232,225], ice * .94);
    const shade = .95 + n * .1;
    colorData[index] = clamp(rgb[0] * shade,0,255); colorData[index + 1] = clamp(rgb[1] * shade,0,255); colorData[index + 2] = clamp(rgb[2] * shade,0,255); colorData[index + 3] = 255;
    // A restrained blue floor keeps the ocean readable on the night side.
    // Land receives less fill so relief and the day/night boundary stay clear.
    const fill = mix(e <= 0 ? .95 : .36, .36, ice);
    emissionData[index] = Math.round(colorData[index] * fill); emissionData[index + 1] = Math.round(colorData[index + 1] * fill); emissionData[index + 2] = Math.round(colorData[index + 2] * fill); emissionData[index + 3] = 255;
    const h = clamp(Math.max(Math.max(0,e) * .85 + (e > 0 ? n * .018 : 0), ice * (.012 + n * .012)));
    bumpData[index] = bumpData[index + 1] = bumpData[index + 2] = Math.round(h * 255); bumpData[index + 3] = 255;
    const rough = Math.round(mix(e > 0 ? .89 : .43 + n * .035, .92, ice) * 255);
    roughnessData[index] = roughnessData[index + 1] = roughnessData[index + 2] = rough; roughnessData[index + 3] = 255;
  }
  return { color: texture(colorData,width,height,'qfrontier-fictional-geography',true), bump: texture(bumpData,width,height,'qfrontier-mountain-relief'), roughness: texture(roughnessData,width,height,'qfrontier-ocean-roughness'), emission: texture(emissionData,width,height,'qfrontier-ocean-night-fill',true), width };
}

function* cloudMap(width: number):Generator<void,THREE.DataTexture,unknown> {
  const height = width / 2, data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    if(col===0&&row%2===0)yield;
    const lat = 90 - row / (height - 1) * 180, lon = col / width * 360 - 180, p = direction(lat,lon);
    const curl = fbm(p.x * 2.2 + 13, p.y * 2.2 + 37, p.z * 2.2 + 7, 3);
    const mass = fbm(p.x * 5.4 + curl * 1.8, p.y * 5.4 + Math.sin(lon * DEG * 3) * .4, p.z * 5.4 + curl, 3);
    const edgeDetail = fbm(p.x * 14 + 23,p.y * 14 + 31,p.z * 14 + 11,2);
    const latitudeBand = .025 * Math.cos(lat * DEG * 6), alpha = smooth(.51 + latitudeBand,.69,mass + (edgeDetail - .5) * .075) * .76;
    const index = (row * width + col) * 4;
    data[index] = 243; data[index + 1] = 249; data[index + 2] = 248; data[index + 3] = Math.round(alpha * 255);
  }
  return texture(data,width,height,'qfrontier-soft-clouds',true);
}

function atmosphereMaterial(strength: number, power: number) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    uniforms: { strength: { value: strength }, power: { value: power }, sunDirection: { value: new THREE.Vector3(-.8,.45,1).normalize() } },
    vertexShader: `varying vec3 vWorldNormal; varying vec3 vWorldPosition;
      void main(){vec4 world=modelMatrix*vec4(position,1.0);vWorldPosition=world.xyz;vWorldNormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader: `uniform float strength;uniform float power;uniform vec3 sunDirection;varying vec3 vWorldNormal;varying vec3 vWorldPosition;
      void main(){vec3 n=normalize(vWorldNormal);vec3 eye=normalize(cameraPosition-vWorldPosition);float rim=pow(1.0-abs(dot(n,eye)),power);float day=.3+.7*max(dot(n,sunDirection),0.0);vec3 blue=mix(vec3(.08,.3,.58),vec3(.28,.65,.86),day);gl_FragColor=vec4(blue,rim*strength*day);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
}

/** A stable fictional planet. Only the transparent cloud shells move; surface
 * coordinates, the playable region and picked player markers never rotate away.
 */
export function createPlanetSurface(quality:RenderQuality):PlanetSurface{return finishGraphicsBuild(planetSurfaceSteps(quality));}
export function createPlanetSurfaceAsync(quality:RenderQuality,options:GraphicsBuildOptions={}):Promise<PlanetSurface>{return runGraphicsBuild(planetSurfaceSteps(quality),options);}
function* planetSurfaceSteps(quality:RenderQuality):Generator<void,PlanetSurface,unknown>{
  const group = new THREE.Group(); group.name = 'qfrontier-living-planet';
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  let completed=false;try{
  const maps = yield* buildPlanetMaps(planetTextureWidth(quality));
  for (const map of [maps.color,maps.bump,maps.roughness,maps.emission]) { textures.add(map); map.anisotropy = quality === 'performance' ? 2 : 4; }
  const segments = quality === 'performance' ? 96 : quality === 'auto' ? 160 : 256;
  const geometry = new THREE.SphereGeometry(PLANET_RADIUS,segments,segments / 2); geometries.add(geometry);
  const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
  for (let vertex = 0; vertex < positions.count; vertex++) {
    if(vertex%128===0)yield;
    const x = normals.getX(vertex), y = normals.getY(vertex), z = normals.getZ(vertex), lat = Math.asin(clamp(y,-1,1)) / DEG, lon = Math.atan2(-z,x) / DEG;
    const height = Math.max(0,planetTerrainAt(lat,lon).elevation) * .95;
    positions.setXYZ(vertex,x * (PLANET_RADIUS + height),y * (PLANET_RADIUS + height),z * (PLANET_RADIUS + height));
  }
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, map: maps.color, bumpMap: maps.bump, bumpScale: .56, roughnessMap: maps.roughness, roughness: 1, metalness: 0, emissive: 0xffffff, emissiveMap: maps.emission, emissiveIntensity: .14 });
  materials.add(material);
  const planet = new THREE.Mesh(geometry,material); planet.name = 'qfrontier-planet-surface'; planet.castShadow = false; planet.receiveShadow = true; group.add(planet);
  const clouds = yield* cloudMap(quality === 'performance' ? 256 : 512); textures.add(clouds);
  const cloudGeometry = new THREE.SphereGeometry(PLANET_RADIUS + 1.55,quality === 'performance' ? 64 : 128,quality === 'performance' ? 32 : 64); geometries.add(cloudGeometry);
  const cloudMaterial = new THREE.MeshStandardMaterial({ map:clouds,color:0xffffff,transparent:true,opacity:.55,depthWrite:false,roughness:1,emissive:0x30485b,emissiveIntensity:.1 }); materials.add(cloudMaterial);
  const cloudShell = new THREE.Mesh(cloudGeometry,cloudMaterial); cloudShell.name = 'planet-low-clouds'; cloudShell.renderOrder=2; group.add(cloudShell);
  const highGeometry = new THREE.SphereGeometry(PLANET_RADIUS + 2.05,64,32); geometries.add(highGeometry);
  const highMaterial = cloudMaterial.clone(); highMaterial.opacity=.055; materials.add(highMaterial);
  const highClouds = new THREE.Mesh(highGeometry,highMaterial); highClouds.name='planet-cirrus';highClouds.rotation.set(.09,.7,.04);highClouds.renderOrder=3;group.add(highClouds);
  const airGeometry = new THREE.SphereGeometry(PLANET_RADIUS+2.7,96,48);geometries.add(airGeometry);
  const airMaterial=atmosphereMaterial(.68,3.2);materials.add(airMaterial);
  const air=new THREE.Mesh(airGeometry,airMaterial);air.name='planet-atmosphere';air.renderOrder=4;group.add(air);
  const haloGeometry=new THREE.SphereGeometry(PLANET_RADIUS+5.2,64,32);geometries.add(haloGeometry);
  const haloMaterial=atmosphereMaterial(.17,5);materials.add(haloMaterial);
  const halo=new THREE.Mesh(haloGeometry,haloMaterial);halo.name='planet-outer-haze';halo.renderOrder=5;group.add(halo);
  group.userData={fictionalGeography:true,textureWidth:maps.width,planetRadius:PLANET_RADIUS,surfaceFixed:true,anchor:{...PLANET_ANCHOR},quality};
  let disposed=false;completed=true;
  return {
    group,planet,radius:PLANET_RADIUS,
    animate(time,reducedMotion){if(disposed)return;const t=reducedMotion?0:time;cloudShell.rotation.y=t*.0015;highClouds.rotation.y=.7+t*.0007;},
    dispose(){if(disposed)return;disposed=true;geometries.forEach(item=>item.dispose());materials.forEach(item=>item.dispose());textures.forEach(item=>item.dispose());group.clear();},
  };
  }finally{if(!completed){geometries.forEach(item=>item.dispose());materials.forEach(item=>item.dispose());textures.forEach(item=>item.dispose());group.clear();}}
}
