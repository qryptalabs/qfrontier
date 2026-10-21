import * as THREE from 'three';
import {finishGraphicsBuild} from './graphics-build.ts';
import {landTerrainHeight,type LandTerrainStateLike} from './land-terrain.ts';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createTree } from './models.ts';
import type { RenderQuality } from './scene-data.ts';
import { continuousGroundHeight, isValleyTreePosition, LANDSCAPE_BOUNDS, LANDSCAPE_HALF_EXTENT, valleyRoadCenter } from './continuous-layout.ts';
import { isSceneryWater, riverCenter, riverWidth, sceneryNoise, sceneryWaterHeight } from './settlement-layout.ts';

export interface ContinuousLandscape {
  group: THREE.Group;
  water: THREE.Mesh;
  bounds: typeof LANDSCAPE_BOUNDS;
  ground: THREE.Mesh;
  dispose(): void;
}

/** The surrounding valley is real geometry, including the river downstream of
 * the village. Shared tree models are batched; distant forest uses voxel LODs.
 * No neighboring player, resource deposit or owned structure is invented here.
 */
export function createContinuousLandscape(quality:RenderQuality,waterMaterial:THREE.Material,clearedForRoad?:(x:number,y:number,padding:number)=>boolean,state?:LandTerrainStateLike):ContinuousLandscape{return finishGraphicsBuild(continuousLandscapeSteps(quality,waterMaterial,clearedForRoad,state));}
export function* continuousLandscapeSteps(quality: RenderQuality, waterMaterial: THREE.Material, clearedForRoad?:(x:number,y:number,padding:number)=>boolean,state?:LandTerrainStateLike): Generator<void,ContinuousLandscape,unknown> {
  const group = new THREE.Group(); group.name = 'continuous-forested-valley';
  const groundHeight=(x:number,y:number)=>landTerrainHeight(state,x,y,continuousGroundHeight(x,y),false);
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  const batches = new Map<string, { material: THREE.Material; geometries: THREE.BufferGeometry[] }>();
  let completed=false;try{
  const low = quality === 'performance', temp = new THREE.Object3D(), cube = new THREE.BoxGeometry(1, 1, 1);
  geometries.add(cube);
  const bounds = LANDSCAPE_BOUNDS;
  const extent = LANDSCAPE_HALF_EXTENT, cell = 1.2, segments = Math.round(extent * 2 / cell);
  const positions: number[] = [], colors: number[] = [], uvs: number[] = [], indices: number[] = [];
  const tint = new THREE.Color();
  for (let row = 0; row <= segments; row++) for (let col = 0; col <= segments; col++) {
    if(col===0&&row%8===0)yield;
    const x = -extent + col * cell, z = -extent + row * cell;
    positions.push(x, groundHeight(x, z) - .14, z);
    const n = sceneryNoise(Math.floor(x * .7), Math.floor(z * .7), 19);
    const road = valleyRoadCenter(x, z), wet = isSceneryWater(x, z);
    tint.setHex(wet ? 0x426b58 : road ? 0xae9c63 : n > .75 ? 0x7c914c : n > .42 ? 0x6f8543 : n > .2 ? 0x697e40 : 0x5c783d);
    colors.push(tint.r, tint.g, tint.b); uvs.push(x / 6, z / 6);
  }
  for (let row = 0; row < segments; row++) for (let col = 0; col < segments; col++) {
    const a = row * (segments + 1) + col, b = a + 1, c = a + segments + 1, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  const groundGeometry = new THREE.BufferGeometry();
  groundGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  groundGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  groundGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  groundGeometry.setIndex(indices); groundGeometry.computeVertexNormals(); groundGeometry.computeBoundingBox(); groundGeometry.computeBoundingSphere(); geometries.add(groundGeometry);
  const groundMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, flatShading: true }); materials.add(groundMaterial);
  const ground = new THREE.Mesh(groundGeometry, groundMaterial); ground.name = 'continuous-valley-ground'; ground.receiveShadow = true; group.add(ground);

  // A continuous ribbon has exact river widths and level changes. It sits just
  // below the detailed village surface, so the two meshes never fight in depth.
  const riverPositions: number[] = [], riverColors: number[] = [], riverUvs: number[] = [], riverIndices: number[] = [];
  const along = .4, across = 8, riverRows = Math.round(extent * 2 / along);
  for (let row = 0; row <= riverRows; row++) {
    if(row%16===0)yield;
    const z = -extent + row * along, center = riverCenter(z), width = riverWidth(z);
    for (let band = 0; band <= across; band++) {
      const t = band / across, x = center + (t - .5) * width;
      riverPositions.push(x, sceneryWaterHeight(z) + .018, z); riverUvs.push(x / 6, z / 6);
      const edge = Math.abs(t - .5) * 2;
      riverColors.push(.66 + edge * .3, .79 + edge * .19, .84 + edge * .14);
    }
  }
  for (let row = 0; row < riverRows; row++) for (let band = 0; band < across; band++) {
    const a = row * (across + 1) + band, b = a + 1, c = a + across + 1, d = c + 1;
    riverIndices.push(a, c, b, b, c, d);
  }
  // The northern inlet joins the main channel instead of ending on a slab edge.
  for (let z = -17.4; z <= -9.5; z += .4) for (let x = -3.5; x < 7.2; x += .4) {
    if (!isSceneryWater(x + .2, z + .2) || Math.abs(x - riverCenter(z)) < riverWidth(z) / 2 + .3) continue;
    const base = riverPositions.length / 3;
    for (const [dx, dz] of [[0, 0], [0, .4], [.4, 0], [.4, .4]]) {
      riverPositions.push(x + dx, sceneryWaterHeight(z) + .018, z + dz); riverUvs.push((x + dx) / 6, (z + dz) / 6); riverColors.push(.8, .9, .95);
    }
    riverIndices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
  }
  const riverGeometry = new THREE.BufferGeometry();
  riverGeometry.setAttribute('position', new THREE.Float32BufferAttribute(riverPositions, 3)); riverGeometry.setAttribute('color', new THREE.Float32BufferAttribute(riverColors, 3)); riverGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(riverUvs, 2)); riverGeometry.setIndex(riverIndices); riverGeometry.computeVertexNormals(); geometries.add(riverGeometry);
  const water = new THREE.Mesh(riverGeometry, waterMaterial); water.name = 'continuous-upstream-and-downstream-river'; water.receiveShadow = true; group.add(water);

  const voxels: { matrix: THREE.Matrix4; color: THREE.Color }[] = [];
  function brick(x: number, y: number, z: number, w: number, h: number, d: number, color: number, ry = 0) {
    temp.position.set(x, y, z); temp.rotation.set(0, ry, 0); temp.scale.set(w, h, d); temp.updateMatrix(); voxels.push({ matrix: temp.matrix.clone(), color: new THREE.Color(color) });
  }
  function detailedTree(x: number, z: number, seed: number, size: number) {
    const model = createTree(seed % 4 === 0 ? 'oak' : 'pine', seed % 3); model.position.set(x, groundHeight(x, z), z); model.scale.setScalar(size); model.rotation.y = seed * .63; model.updateMatrixWorld(true);
    model.traverse(object => {
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
      let batch = batches.get(object.material.uuid); if (!batch) { batch = { material: object.material, geometries: [] }; batches.set(object.material.uuid, batch); }
      batch.geometries.push(object.geometry.clone().applyMatrix4(object.matrixWorld));
    });
  }
  let nearTrees = 0, distantTrees = 0, nearTreeCandidates = 0;
  const spacing = low ? 5.4 : 4.2;
  for (let x = -75; x < 76; x += spacing) for (let z = -75; z < 76; z += spacing) {
    if(z===-75)yield;
    const n = sceneryNoise(x, z, 62), tx = x + (n - .5) * 1.8, tz = z + (sceneryNoise(z, x, 52) - .5) * 1.8;
    if (!isValleyTreePosition(tx, tz) || (Math.abs(tx) < 16.3 && Math.abs(tz) < 13.4)) continue;
    const near = Math.abs(tx) < 28 && Math.abs(tz) < 25;
    if (near && n > .5 && nearTreeCandidates < (low ? 10 : 20)) { const seed=nearTreeCandidates++;if(!clearedForRoad?.(tx,tz,1)){detailedTree(tx,tz,seed,1.1+n*.5);nearTrees++;}continue; }
    if(clearedForRoad?.(tx,tz,1))continue;
    const y = groundHeight(tx, tz), h = 2.3 + n * 1.5, width = 1.15 + n * .55;
    brick(tx, y + h * .34, tz, .19, h * .68, .19, 0x68502e);
    for (let tier = 0; tier < 5; tier++) {
      const w = width * (1 - tier * .15), level = y + h * (.35 + tier * .135), color = tier % 2 ? 0x395d38 : 0x476b3b;
      brick(tx, level, tz, w, .3 + n * .12, w * .7, color);
      if (tier < 4) brick(tx, level + .1, tz, w * .65, .27, w, tier % 2 ? 0x4d703c : 0x55783e);
    }
    brick(tx, y + h + .02, tz, .17, .28, .17, 0x71904a); distantTrees++;
  }
  // A few fine stepping stones mark continuous roads near the parcel. Farther
  // paths are simply part of the terrain colour, avoiding tiny distant meshes.
  for (let x = -29.7; x < 29.7; x += .55) for (let z = -26.7; z < 26.7; z += .55) {
    if(z===-26.7)yield;
    if (!valleyRoadCenter(x, z) || (Math.abs(x) < 15.7 && Math.abs(z) < 12.7)) continue;
    const n = sceneryNoise(x, z, 72);
    brick(x, groundHeight(x, z) + .025, z, .47, .055, .44, n > .5 ? 0xb7a675 : 0xa99a69);
    if (n > .87) brick(x + .1, groundHeight(x, z) + .08, z + .13, .09, .11, .07, 0x849247);
  }
  // Bank rocks and understory continue past the original detailed footprint.
  for (let i = 0; i < 135; i++) {
    const z = -35 + i * .54, side = i % 2 ? 1 : -1, x = riverCenter(z) + side * (riverWidth(z) / 2 + .4);
    if (Math.abs(x) < 15.7 && Math.abs(z) < 12.7) continue;
    if(clearedForRoad?.(x,z,.65))continue;
    const y = groundHeight(x, z), n = sceneryNoise(x, z, 37);
    brick(x, y + .12, z, .29 + n * .4, .3 + n * .4, .31 + n * .36, n > .5 ? 0x7e8772 : 0x697864);
    brick(x, y + .36, z, .25, .07, .28, 0x708442);
    if (i % 3 === 0) for (let blade = 0; blade < 3; blade++) brick(x + blade * .08, y + .23, z + .2, .04, .4 + blade * .07, .04, 0x8a994a);
  }
  const voxelMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .95, flatShading: true }); materials.add(voxelMaterial);
  const forest = new THREE.InstancedMesh(cube, voxelMaterial, voxels.length); forest.name = 'valley-forest-and-roads';
  voxels.forEach((voxel, index) => { forest.setMatrixAt(index, voxel.matrix); forest.setColorAt(index, voxel.color); }); forest.castShadow = true; forest.receiveShadow = true; forest.computeBoundingSphere(); group.add(forest);
  yield;
  for (const batch of batches.values()) {
    yield;
    const geometry = mergeGeometries(batch.geometries, false)!; batch.geometries.forEach(part => part.dispose()); geometries.add(geometry);
    const material = batch.material.clone(); materials.add(material);
    const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'near-valley-foliage'; group.add(mesh);
  }
  batches.clear();completed=true;
  group.userData = { sceneryOnly: true, continuousGround: true, nearTrees, distantTrees, bounds, groundCells: segments * segments };
  return {
    group, water, bounds, ground,
    dispose() { group.traverse(object => { if (object instanceof THREE.InstancedMesh) object.dispose(); }); geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); group.clear(); },
  };
  }finally{if(!completed){group.traverse(object=>{if(object instanceof THREE.InstancedMesh)object.dispose();});for(const batch of batches.values())batch.geometries.forEach(g=>g.dispose());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());group.clear();}}
}
