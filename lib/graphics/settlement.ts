import * as THREE from 'three';
import {finishGraphicsBuild,runGraphicsBuild,type GraphicsBuildOptions} from './graphics-build.ts';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createBuilding, createItem, createRock, createTree } from './models.ts';
import { continuousLandscapeSteps, type ContinuousLandscape } from './continuous-landscape.ts';
import { continuousGroundHeight, LANDSCAPE_BOUNDS } from './continuous-layout.ts';
import { PARCEL_DEPTH, PARCEL_WIDTH } from '../mvp/settlements.ts';
import { houseClearsProceduralTree } from '../mvp/habitable-data.ts';
import {landClearsSceneryAt} from './land-terrain.ts';
import type { PublicPlayer } from '../mvp/view.ts';
import type { RenderQuality } from './scene-data.ts';
import {
  islandContains, isSceneryWater, riverCenter, riverWidth, sceneryNoise,
  sceneryWaterHeight, SETTLEMENT_ANCHORS, SETTLEMENT_CELL, settlementHeightAt,
} from './settlement-layout.ts';

export interface DetailedSettlement {
  group: THREE.Group;
  water: THREE.Mesh[];
  waterfall: THREE.InstancedMesh | null;
  foam: THREE.InstancedMesh | null;
  smokeOrigins: THREE.Vector3[];
  anchors: Record<string, THREE.Vector3>;
  parcelBounds: { xMin: number; xMax: number; zMin: number; zMax: number };
  landscapeBounds: typeof LANDSCAPE_BOUNDS;
  parcelBoundary: THREE.Group;
  setParcelBoundaryVisible(visible: boolean): void;
  animate(timeSeconds: number, reducedMotion: boolean): void;
  dispose(): void;
}

type Brick = { matrix: THREE.Matrix4; color: THREE.Color };
type ModelBatch = { material: THREE.Material; geometry: THREE.BufferGeometry[] };
type FoamParticle = { z: number; offset: number; phase: number; scale: number; origin?: { x: number; z: number; y: number; spread: number } };
const C = {
  soil: [0x5b4432, 0x6b4d34, 0x7a593b, 0x80633f, 0x6b5039],
  grass: [0x6b833e, 0x7b9445, 0x8c9f4c, 0x798c40, 0x91a452, 0x7e9243],
  moss: [0x6c8242, 0x536e37, 0x85994a, 0x9aa957],
  stone: [0x6a7065, 0x7b7d70, 0x898b7d, 0x92927f, 0x5a645a, 0xa3a38e],
  path: [0xb7aa78, 0xc5b680, 0xd1c18b, 0xb2a274, 0xc4b284],
  wood: [0x80522e, 0x95623a, 0xac7c47, 0xb18550, 0x66442b],
};

/**
 * A hand-authored, fully volumetric village in a continuous forested valley. Static model geometry is
 * merged by material, while thousands of landscape voxels share one draw call.
 * Every resource-like prop is scenery, never an undiscovered server deposit.
 */
export interface SettlementInput { player: PublicPlayer | null; quality: RenderQuality; showcase: boolean; includeLandscape?: boolean; proceduralClearance?:(x:number,y:number,padding:number)=>boolean }
export function createSettlement(input:SettlementInput):DetailedSettlement{return finishGraphicsBuild(settlementSteps(input));}
export function createSettlementAsync(input:SettlementInput,options:GraphicsBuildOptions={}):Promise<DetailedSettlement>{return runGraphicsBuild(settlementSteps(input),options);}
function* settlementSteps(input:SettlementInput):Generator<void,DetailedSettlement,unknown>{
  const group = new THREE.Group(); group.name = 'detailed-settlement';
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  const bricks: Brick[] = [], batches = new Map<string, ModelBatch>();
  let completed=false,surrounding:ContinuousLandscape|null=null;
  try{
  const cube = new THREE.BoxGeometry(1, 1, 1); geometries.add(cube);
  const temp = new THREE.Object3D(), matrix = new THREE.Matrix4();
  const low = input.quality === 'performance';
  const faction = input.player?.faction ?? 'cartographers';
  const anchors = Object.fromEntries(Object.entries(SETTLEMENT_ANCHORS).map(([name, point]) => [name, new THREE.Vector3(...point)]));
  anchors.bridge.x = riverCenter(anchors.bridge.z);
  const smokeOrigins: THREE.Vector3[] = [];
  const water: THREE.Mesh[] = [];
  const ownMat = <T extends THREE.Material>(mat: T) => { materials.add(mat); return mat; };
  function brick(x: number, y: number, z: number, w: number, h: number, d: number, color: number, ry = 0, rz = 0) {
    temp.position.set(x, y, z); temp.scale.set(w, h, d); temp.rotation.set(0, ry, rz); temp.updateMatrix();
    bricks.push({ matrix: temp.matrix.clone(), color: new THREE.Color(color) });
  }
  function palette(p: number[], x: number, z: number, salt = 0) { return p[Math.min(p.length - 1, Math.floor(sceneryNoise(x, z, salt) * p.length))]; }
  function addModel(model: THREE.Group, x: number, y: number, z: number, size = 1, rotation = 0) {
    temp.position.set(x, y, z); temp.scale.setScalar(size); temp.rotation.set(0, rotation, 0); temp.updateMatrix();
    const parent = temp.matrix.clone(); model.updateMatrixWorld(true);
    model.traverse(object => {
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
      let batch = batches.get(object.material.uuid);
      if (!batch) { batch = { material: object.material, geometry: [] }; batches.set(object.material.uuid, batch); }
      matrix.multiplyMatrices(parent, object.matrixWorld);
      batch.geometry.push(object.geometry.clone().applyMatrix4(matrix));
    });
  }

  // Grass turf over a stratified earthen cross-section. Exposed faces have
  // separate small masonry-like stones instead of vertically stretched cubes.
  const step = SETTLEMENT_CELL;
  for (let x = -16 + step / 2; x < 16; x += step) for (let z = -13 + step / 2; z < 13; z += step) {
    if(z===-13+step/2)yield;
    if (!islandContains(x, z)) continue;
    const y = settlementHeightAt(x, z), wet = isSceneryWater(x, z), n = sceneryNoise(x, z);
    brick(x, (y - .42 - .85) / 2, z, step + .008, y - .42 + .85, step + .008, palette(C.soil, x, z));
    brick(x, y - .23, z, step, .38, step, wet ? 0x4e7265 : palette(C.soil, x, z, 1));
    const beach = z < -9.05 && x < 6.5 && x > -8;
    brick(x, y - .035, z, step + .008, .15, step + .008, wet ? (n > .45 ? 0x668b73 : 0x4d7769) : beach ? palette([0xcdbb73, 0xdbca83, 0xe1ce87], x, z) : palette(C.grass, x, z));
    if (!wet && !beach && n > .52) {
      brick(x + .09, y + .053, z - .07, .2 + n * .12, .035, .15 + n * .12, palette(C.moss, z, x, 8));
      if (n > .91) brick(x - .12, y + .085, z + .1, .07, .09, .07, 0x98ab57);
    }
    for (const [dx, dz] of [[-step, 0], [step, 0], [0, -step], [0, step]]) {
      const neighbor = islandContains(x + dx, z + dz) ? settlementHeightAt(x + dx, z + dz) : -1;
      if (neighbor >= y - .2) continue;
      for (let h = Math.max(-.8, neighbor); h < y - .18; h += .34) {
        const band = Math.round((h + 1) / .34), faceN = sceneryNoise(x + dx * .2, z + dz * .2, band);
        const rocky = y > 3 || faceN > .85, jut = faceN > .72 ? .1 : .025;
        brick(x + dx * (.5 + jut), h + .14, z + dz * (.5 + jut),
          dx ? .09 : step - .025, Math.min(.3, y - .18 - h), dz ? .09 : step - .025,
          rocky ? C.stone[Math.floor(faceN * C.stone.length) % C.stone.length] : C.soil[(band + Math.floor(faceN * 2)) % C.soil.length]);
        if (h > y - .65 && faceN > .52) brick(x + dx * .52, h + .2, z + dz * .52, dx ? .09 : .25, .14, dz ? .09 : .25, palette(C.moss, x, z, band));
      }
    }
  }

  // Fine stepping stones are individually staggered and allow grass through.
  function path(points: [number, number][], width = 1.1) {
    for (let segment = 0; segment < points.length - 1; segment++) {
      const [x1, z1] = points[segment], [x2, z2] = points[segment + 1];
      const distance = Math.hypot(x2 - x1, z2 - z1), count = Math.ceil(distance / .34);
      const angle = Math.atan2(x2 - x1, z2 - z1);
      for (let i = 0; i <= count; i++) for (let side = -Math.floor(width / .34 / 2); side <= Math.floor(width / .34 / 2); side++) {
        const t = i / count, offset = side * .32, stagger = (side % 2) * .12;
        const x = x1 + (x2 - x1) * t + Math.cos(angle) * offset + Math.sin(angle) * stagger;
        const z = z1 + (z2 - z1) * t - Math.sin(angle) * offset + Math.cos(angle) * stagger;
        if (isSceneryWater(x, z) || !islandContains(x, z)) continue;
        brick(x, settlementHeightAt(x, z) + .08, z, .29, .065, .29, palette(C.path, x, z, 4), angle);
      }
    }
  }
  path([[-10.2, .4], [-5, .4], [-1.3, .4], [4.8, .4], [7, 2.4], [8, 4.25]], 1.45);
  path([[-1.3, -7.8], [-1.3, -4.8], [-1.3, .4], [-1.3, 2.1], [1.2, 3], [1.2, 8.5]], 1.15);
  path([[4.8, .4], [5.6, -2], [5.6, -4.9]], .85);
  path([[-6.2, .4], [-6.2, 4.5], [-5.5, 6]], .85);
  path([[1.2, 6.5], [3.4, 6.5], [5.5, 7.8]], .8);
  path([[-6.4, -3], [-6.2, -5.4]], .7);
  path([[2.2, -5.3], [-1.3, -5.3]], .7);

  // The seven workshop types use the real player's upgrade levels. The home,
  // mine portal and landscape are deliberately neutral presentation scenery.
  addModel(createBuilding('home', 1, faction), ...SETTLEMENT_ANCHORS.home, 1.74);
  const buildingTypes = ['workshop', 'garden', 'kitchen', 'laboratory', 'barracks', 'warehouse', 'logistics'] as const;
  const sizes = { workshop: 1.62, garden: 1.42, kitchen: 1.25, laboratory: 1.25, barracks: 1.25, warehouse: 1.72, logistics: 1.14 };
  for (const kind of buildingTypes) {
    yield;
    const level = input.player?.buildings[kind] ?? 1;
    if (level < 1) continue;
    const anchor = anchors[kind];
    // The larger authored wheat plots below provide the garden footprint;
    // the model remains visible as the garden's seed shed behind the beds.
    const shift = kind === 'garden' ? new THREE.Vector3(-2.6, 0, .7) : new THREE.Vector3();
    addModel(createBuilding(kind, level, faction), anchor.x + shift.x, anchor.y, anchor.z + shift.z, sizes[kind]);
    if (kind === 'workshop') smokeOrigins.push(new THREE.Vector3(anchor.x - .67 * sizes[kind], anchor.y + 2.27 * sizes[kind], anchor.z - .23 * sizes[kind]));
    if (kind === 'kitchen') smokeOrigins.push(new THREE.Vector3(anchor.x + .78 * sizes[kind], anchor.y + 1.61 * sizes[kind], anchor.z - .3 * sizes[kind]));
  }

  // Narrow granite spires have unequal vertical shoulders and fracture lines,
  // rather than the concentric courses of a regular stepped pyramid.
  const spires = [[9.3,-10.1,5.9,.8],[10.4,-10.9,5.2,.64],[8.1,-9.6,5.3,.72],[11.5,-9.9,5.6,.75],[12.5,-9.25,4.15,.8],[10.15,-8.55,4.4,.82],[8.7,-8.2,3.55,.66],[7.15,-10.4,4.1,.65],[12,-11.4,3.9,.67],[13.3,-10.4,3.2,.64],[7.1,-8.75,2.5,.62],[12.9,-7.65,2.55,.7],[11.6,-7.4,2.3,.6],[9.2,-7.3,2.1,.63]];
  // Overlapping unequal shoulders form one heavy rock mass under the upper
  // pinnacles. Warped rectangular fracture fields avoid concentric courses.
  let shoulderColumns = 0;
  for (let x = 6.15; x < 14.35; x += .39) for (let z = -12.1; z < -6.08; z += .39) {
    if (!islandContains(x, z) || isSceneryWater(x, z)) continue;
    const wx = x + Math.sin(z * 2.3) * .17, wz = z + Math.sin(x * 2.7) * .14;
    let height = 0;
    for (const [cx, cz, peak, width] of spires) {
      const distance = Math.max(Math.abs(wx - cx) / (1.2 + width), Math.abs(wz - cz) / (1.02 + width * .7));
      if (distance < 1) height = Math.max(height, peak * .57 * (1 - distance * .46));
    }
    // The portal is cut into a substantial connected shoulder, with rock
    // above the timber lintel and clear ground in front of the actual door.
    if (x > 9.25 && x < 12.65 && z > -8.65 && z < -6.15) height = Math.max(height, 3.08 - Math.abs(x - 10.8) * .43 - Math.abs(z + 7.4) * .22);
    if (height < .4) continue;
    const n = sceneryNoise(x, z, 29), base = settlementHeightAt(x, z);
    height = Math.max(.38, Math.round((height + (n - .5) * .42) / .28) * .28);
    shoulderColumns++;
    for (let h = .17; h < height; h += .32) {
      const fracture = sceneryNoise(x + h * .2, z, 41), offset = fracture > .77 ? .055 : -.015;
      brick(x + offset, base + h, z + offset * .6, .4 + offset, Math.min(.315, height - h + .14), .4 + offset, palette(C.stone, x + h, z, 47));
      if (fracture > .88 && h > .6) brick(x + .22, base + h + .03, z + .12, .16, .2, .18, 0x657164);
    }
    brick(x, base + height + .01, z, .41, .12, .41, n > .82 && height > 2.85 ? 0xb8c0ac : palette(C.stone, x, z, 57));
    if (n > .75 && height < 2) brick(x + .03, base + height + .09, z + .03, .32, .055, .3, 0x788742);
  }
  for (let column = 0; column < spires.length; column++) {
    const [cx, cz, height, width] = spires[column], base = settlementHeightAt(cx, cz);
    brick(cx, base + .42, cz, width * 1.8, .84, width * 1.7, palette(C.stone, cx, cz, 8));
    const shoulder = .55 + sceneryNoise(cx, cz, 38) * .24;
    for (let h = .25; h < height; h += .37) {
      const n = sceneryNoise(cx + h, cz, 18), taper = h / height > .77 ? .65 : 1;
      const w = width * taper * (.88 + n * .22);
      const shiftX = h > height * shoulder ? (column % 2 ? -.12 : .13) : 0;
      brick(cx + shiftX, base + h, cz + (n - .5) * .12, w, .35 + n * .08, width * taper * (.8 + n * .22), palette(C.stone, cx + h, cz, 11));
      if (h < height * .8 && n > .62) brick(cx + w * .48, base + h - .04, cz + .16, .16, .24, .26, 0x606b60);
      if (n > .73 && h < height * .52) brick(cx - w * .25, base + h + .2, cz + width * .47, .27, .06, .16, 0x778344);
    }
    const snow = height > 3.6;
    brick(cx + (column % 2 ? -.12 : .13), base + height - .02, cz, width * .69, .17, width * .64, snow ? 0xe4e3d0 : 0x959783);
    if (snow) {
      brick(cx - .14, base + height + .1, cz - .1, width * .4, .12, width * .4, 0xf0eddc);
      brick(cx + width * .3, base + height - .27, cz + .03, .15, .38, width * .45, 0xd2d9ca);
    }
  }
  // Loose talus joins the vertical pillars into a broken, mossy mountain foot.
  for (let i = 0; i < 76; i++) {
    const x = 6.7 + sceneryNoise(i, 3, 70) * 7.2, z = -11.7 + sceneryNoise(i, 8, 80) * 4.8;
    if (!islandContains(x, z) || isSceneryWater(x, z)) continue;
    const n = sceneryNoise(x, z, 16), y = settlementHeightAt(x, z);
    brick(x, y + .15 + n * .4, z, .28 + n * .56, .3 + n * .8, .3 + n * .5, palette(C.stone, x, z));
    if (n > .73) brick(x, y + .66, z, .23, .06, .26, 0x788444);
  }
  const mx = anchors.mine.x, my = anchors.mine.y, mz = anchors.mine.z;
  addModel(createBuilding('mine', 1, faction), mx, my, mz, 1.62);
  brick(mx, my + 1, mz - .24, 1.5, 1.85, .12, 0x20251f);
  for (const side of [-1, 1]) {
    brick(mx + side * .92, my + 1.12, mz + .02, .3, 2.25, .38, 0x68492e);
    brick(mx + side * .88, my + 2.1, mz + .05, .27, .68, .34, 0x987042, 0, -side * .55);
    brick(mx + side * .94, my + .18, mz, .5, .35, .55, 0x686e61);
  }
  brick(mx, my + 2.27, mz, 2.5, .32, .48, 0x996a3c);
  brick(mx, my + 2.47, mz - .04, 2.8, .12, .65, 0xa47b49);
  // Rails are entirely local detail, with ties and a loaded ore cart.
  for (let i = 0; i < 13; i++) {
    const z = mz + .2 + i * .27, grade = Math.max(2.06, my - Math.max(0, z + 4.3) * .7);
    brick(mx, grade + .075, z, 1.4, .09, .12, i % 3 ? 0x795232 : 0x997346);
    for (const side of [-1, 1]) brick(mx + side * .43, grade + .15, z, .07, .075, .32, 0x6d7970);
  }
  addModel(createItem('iron_ore'), mx + .35, my + .3, mz + 1.1, .67);
  for (let i = 0; i < 10; i++) addModel(createRock(i % 3 ? 'stone' : 'iron', i % 3), mx + 1.65 + (i % 3) * .45, my, mz + .3 + Math.floor(i / 3) * .42, .65 + (i % 2) * .15, i * .7);

  function fence(x1: number, z1: number, x2: number, z2: number, height = .74) {
    const length = Math.hypot(x2 - x1, z2 - z1), count = Math.max(1, Math.ceil(length / .86));
    const angle = Math.atan2(x2 - x1, z2 - z1), y = settlementHeightAt((x1 + x2) / 2, (z1 + z2) / 2);
    for (let i = 0; i <= count; i++) {
      const x = x1 + (x2 - x1) * i / count, z = z1 + (z2 - z1) * i / count;
      brick(x, y + height / 2, z, .15, height, .15, 0x765130);
      brick(x, y + height + .025, z, .19, .08, .19, 0xa07d45);
    }
    for (const h of [.25, .56]) brick((x1 + x2) / 2, y + h, (z1 + z2) / 2, .1, .105, length, 0x9b743f, angle);
  }
  function cropPlot(cx: number, cz: number, w: number, d: number, vegetable = false) {
    const y = settlementHeightAt(cx, cz);
    brick(cx, y + .055, cz, w, .08, d, 0x5b4b2e);
    for (let row = 0; row < Math.floor(d / .43); row++) {
      const z = cz - d / 2 + .23 + row * .43;
      brick(cx, y + .09, z, w - .2, .04, .19, 0x79613a);
      for (let col = 0; col < Math.floor(w / .32); col++) {
        const x = cx - w / 2 + .2 + col * .32, n = sceneryNoise(x, z, 62);
        if (vegetable) {
          brick(x, y + .23, z, .2, .17, .19, n > .5 ? 0x849a3e : 0x56823d);
          brick(x + .025, y + .34, z, .11, .08, .14, n > .7 ? 0xd0a64c : 0x9cac4e);
        } else {
          const height = .4 + n * .36;
          brick(x, y + height / 2 + .1, z, .055, height, .055, 0x9d9b38);
          brick(x, y + height + .08, z, .115, .22, .1, n > .45 ? 0xe4bb55 : 0xcfa74b);
          brick(x + .067, y + height - .01, z, .11, .14, .055, 0xdbb349, 0, -.4);
          brick(x - .065, y + height - .1, z, .11, .13, .055, 0xe9c766, 0, .4);
        }
      }
    }
    fence(cx - w / 2 - .1, cz - d / 2 - .13, cx + w / 2 + .1, cz - d / 2 - .13);
    fence(cx - w / 2 - .1, cz + d / 2 + .13, cx + w / 2 + .1, cz + d / 2 + .13);
    fence(cx - w / 2 - .1, cz - d / 2 - .13, cx - w / 2 - .1, cz + d / 2 + .13);
    // A real visual gate remains in the eastern edge.
    fence(cx + w / 2 + .1, cz - d / 2 - .13, cx + w / 2 + .1, cz - .45);
    fence(cx + w / 2 + .1, cz + .45, cx + w / 2 + .1, cz + d / 2 + .13);
  }
  cropPlot(-.95, 4.25, 2.5, 2.5);
  cropPlot(3.15, 3.25, 2.6, 2.4, true);
  // Small parallel wheat terrace behind the main garden.
  cropPlot(-.1, 7.7, 1.25, 1.5);

  // Long timber bridge with individual plank ends, diagonal supports and posts.
  const bx = anchors.bridge.x, bz = anchors.bridge.z, by = anchors.bridge.y;
  const bridgeLength = riverWidth(bz) + 2.45;
  for (let i = 0; i <= 21; i++) {
    const x = bx - bridgeLength / 2 + i * bridgeLength / 21;
    brick(x, by + .12 + Math.sin(i / 21 * Math.PI) * .11, bz, bridgeLength / 21 - .018, .15, 1.5, C.wood[i % C.wood.length]);
    if (i % 5 === 0 || i === 21) for (const side of [-1, 1]) {
      brick(x, by + .5, bz + side * .77, .18, .9, .18, 0x73512f);
      brick(x, by + .99, bz + side * .77, .23, .1, .23, 0xb18b50);
    }
  }
  for (const side of [-1, 1]) {
    brick(bx, by + .6, bz + side * .78, bridgeLength, .11, .1, 0xb0874e);
    brick(bx, by - .12, bz + side * .63, bridgeLength, .2, .2, 0x61462e);
  }
  for (const side of [-1, 1]) for (const edge of [-1, 1]) {
    brick(bx + edge * bridgeLength * .31, 1.36, bz + side * .57, .34, 1.9, .34, 0x735238);
    brick(bx + edge * bridgeLength * .24, 1.64, bz + side * .57, 1.5, .15, .18, 0x987044, 0, edge * .7);
  }
  path([[bx + bridgeLength / 2 + .1, bz], [14.6, 4.3], [14.6, 7.5]], .7);
  path([[14.6, 4.3], [14.6, -2.3], [12.7, -3.3], [11.7, -3.3]], .7);
  // A timber stair reaches the elevated mine terrace from the right bank.
  for (let i = 0; i < 7; i++) {
    const y = 2.25 + i * .205, z = -3.55 - i * .16;
    brick(12.05, y, z, 1.05, .12, .23, C.wood[i % C.wood.length]);
    for (const side of [-1, 1]) brick(12.05 + side * .48, (y + 2.15) / 2, z, .1, Math.max(.1, y - 2.15), .1, 0x6c5235);
  }

  // Riverside stones, moss, reeds and deliberately varied forest silhouettes.
  // The right bank has a rocky spring shelf with a real high waterfall, a
  // separate silhouette from the shallow rapids at the island's lower edge.
  const spring = { x: 12, z: 2.15, upper: 4.22, lower: 1.3, width: 1.35 };
  for (let i = 0; i < 34; i++) {
    const x = 12.05 + sceneryNoise(i, 1, 24) * 2.1, z = -.85 + sceneryNoise(i, 4, 27) * 2.7;
    const n = sceneryNoise(x, z, 23), y = settlementHeightAt(x, z);
    if (x < 12.45 && z > .55) continue;
    brick(x, y + .2 + n * .7, z, .35 + n * .5, .4 + n * 1.4, .34 + n * .5, palette(C.stone, x, z));
    brick(x, y + .55 + n * 1.4, z, .32, .08, .35, 0x738547);
  }
  brick(12.15, 3.96, 1.1, 1.5, .36, 2.1, 0x647264);
  for (const x of [spring.x - .67, spring.x + .67]) {
    brick(x, 4.24, 1.1, .23, .26, 2.1, 0x7a8372);
    brick(x, 4.42, .4, .28, .15, .63, 0x94a081);
  }
  // Small projecting fractures and mossy shelves break the spring's large
  // structural stones; the waterfall opening itself stays unobstructed.
  for (let i = 0; i < 68; i++) {
    const n = sceneryNoise(i, 9, 67), x = 12.65 + sceneryNoise(i, 6, 37) * 1.4;
    const z = 1.54 + sceneryNoise(i, 3, 27) * .34, y = 1.9 + n * 2.4;
    brick(x, y, z, .2 + n * .2, .18 + sceneryNoise(i, 12, 87) * .35, .16 + n * .23, palette(C.stone, x + y, z, 29));
    if (i % 5 === 0) brick(x, y + .18, z + .07, .23, .055, .24, 0x768540);
  }
  for (let i = 0; i < 18; i++) {
    const x = 12.7 + sceneryNoise(i, 6, 84) * 1.7, z = 1.95 + sceneryNoise(i, 8, 34) * .6;
    const y = settlementHeightAt(x, z), n = sceneryNoise(x, z, 26);
    brick(x, y + .2 + n * .35, z, .3 + n * .35, .4 + n * .5, .35 + n * .35, palette(C.stone, x, z, 39));
    brick(x, y + .45 + n * .5, z, .23, .08, .28, 0x7d8b48);
  }
  for (let i = 0; i < 78; i++) {
    const z = -11.9 + i * .3, side = i % 2 ? -1 : 1;
    const x = riverCenter(z) + side * (riverWidth(z) / 2 + .16 + sceneryNoise(i, z) * .4);
    if (!islandContains(x, z)) continue;
    const y = settlementHeightAt(x, z);
    if (z < -5.5 && side === 1) continue;
    if (landClearsSceneryAt(input.player?.habitable, x, z)) continue;
    addModel(createRock('stone', i % 3), x, y - .08, z, .42 + sceneryNoise(x, z, 8) * .4, i * .6);
    if (i % 3 === 0) {
      for (let j = 0; j < 4; j++) {
        const rx = x + (j - 1.5) * .11, rz = z + j * .08;
        brick(rx, y + .23, rz, .045, .48 + j * .06, .045, j % 2 ? 0x6e863e : 0x8a994d);
        if (j % 2) brick(rx, y + .54, rz, .08, .18, .08, 0x9f7f41);
      }
    }
  }
  let treeIndex = 0, clearedTrees = 0;
  for (let x = -14.6; x <= 14.6; x += low ? 1.9 : 1.48) for (let z = -11.8; z <= 11.6; z += low ? 1.9 : 1.5) {
    const n = sceneryNoise(x, z, 91), tx = x + (n - .5) * .75, tz = z + (sceneryNoise(z, x, 93) - .5) * .65;
    if (!islandContains(tx, tz) || isSceneryWater(tx, tz)) continue;
    if (tx > 11.6 && tx < 14.7 && tz > -1.6 && tz < 2.3) continue;
    const forest = tx < -9.3 || tz > 9.5 || (tz < -7.9 && tx < -6.7) || (tx > 12.7 && tz > -5.7);
    const grove = (tx < -7.6 && tz > 2.1 && tz < 6.2) || (tx > 5.7 && tx < 7.4 && tz > -3.7 && tz < -.7);
    if (!(forest || grove) || n < .12) continue;
    const mountain = tx > 5 && tz < -6.5;
    if (mountain) continue;
    const kind = n > .72 ? 'oak' : 'pine', size = kind === 'pine' ? 1.18 + n * .65 : .98 + n * .52;
    const variant = treeIndex++ % 3;
    // Clearing follows confirmed structures, gateway and roads. Advance the seed index
    // even when omitted so every surviving tree and composed courtyard stays identical.
    if (input.player?.habitable && houseClearsProceduralTree(input.player.habitable, tx, tz) || input.proceduralClearance?.(tx,tz,1)) { clearedTrees++; continue; }
    yield;addModel(createTree(kind, variant), tx, settlementHeightAt(tx, tz) + .03, tz, size, n * Math.PI * 2);
  }
  // Composed courtyard trees; these are intentionally placed away from doors.
  for (const [x, z, size, kind] of [[-8.3, -5.7, 1.5, 'pine'], [5.3, -6.3, 1.42, 'oak'], [5.1, -.7, 1.3, 'oak'], [-8.35, 6.7, 1.4, 'pine'], [6, 6.8, 1.2, 'oak']] as const) {
    addModel(createTree(kind, treeIndex++ % 3), x, settlementHeightAt(x, z), z, size, x);
  }
  // Beach palms and a small dock make the northern shoreline readable.
  for (const [x, z] of [[-6.8, -10.6], [-4.9, -8.8], [4.4, -11.7]]) {
    if (!isSceneryWater(x, z)) addModel(createTree('palm', 1), x, settlementHeightAt(x, z), z, 1.15, x);
  }
  for (let i = 0; i < 12; i++) brick(-.4 + i * .22, 1.65, -10.25, .2, .15, 1.05, C.wood[i % 4]);
  for (const x of [-.5, 1.9]) for (const z of [-10.75, -9.75]) brick(x, 1.4, z, .15, 1.2, .15, 0x684c32);

  // Stacked sawlogs with bark, end grain and individual growth-ring pixels.
  function logPile(cx: number, cz: number, rows = 3) {
    const y = settlementHeightAt(cx, cz);
    for (let row = 0; row < rows; row++) for (let col = 0; col < rows - row; col++) {
      const x = cx + (col - (rows - row - 1) / 2) * .43, h = y + .23 + row * .37;
      brick(x, h, cz, .38, .35, 1.5, (row + col) % 2 ? 0x79502e : 0x936037);
      brick(x, h, cz + .76, .32, .29, .035, 0xc09b60);
      brick(x, h, cz + .781, .17, .13, .025, 0xa17a44);
      brick(x, h, cz + .795, .06, .045, .01, 0xd2b16d);
      brick(x - .11, h + .15, cz, .035, .025, 1.4, 0xb08348);
    }
    for (const x of [cx - .8, cx + .8]) brick(x, y + .15, cz, .12, .3, 1.85, 0x674c31);
  }
  logPile(-7.3, 2.4); logPile(-5.4, 2.6, 2);
  function crate(x: number, z: number, size = .55, elevation = 0) {
    const y = settlementHeightAt(x, z) + elevation;
    brick(x, y + size / 2, z, size, size, size, 0x956e42);
    for (const side of [-1, 1]) {
      brick(x + side * size * .38, y + size / 2, z, size * .1, size + .03, size + .035, 0x574731);
      brick(x, y + size / 2, z + side * size * .51, size * .94, size * .1, size * .04, 0xbd955b, 0, .72);
    }
    brick(x, y + size + .025, z, size * .96, .04, .1, 0xbf995e);
  }
  for (const [x, z, size] of [[5.15, -2.6, .65], [5.8, -2.2, .5], [5.2, -1.85, .55], [-4.9, -4.4, .5], [2.8, 7.9, .5], [4.8, 7.6, .55]]) crate(x, z, size);
  crate(5.14, -2.6, .48, .65);
  function barrel(x: number, z: number, size = .56) {
    const y = settlementHeightAt(x, z);
    brick(x, y + size / 2, z, size * .85, size, size * .85, 0x88613c);
    for (const h of [.18, .76]) brick(x, y + size * h, z, size * .9, .06, size * .9, 0x4f594a);
    brick(x, y + size + .025, z, size * .78, .05, size * .78, 0xb08a50);
  }
  barrel(4.65, -4.25); barrel(5.22, -4.25, .48); barrel(-7.5, -4.4, .5);
  for (const [x, z] of [[-4.3, -.6], [2.2, -.45], [5.7, 4.1], [13.6, 4.25], [-2.3, 6.7], [11.5, -4.3]]) {
    const y = settlementHeightAt(x, z);
    brick(x, y + .8, z, .12, 1.6, .12, 0x6d5333);
    brick(x + .17, y + 1.57, z, .4, .1, .1, 0x6d5333);
    brick(x + .32, y + 1.35, z, .16, .3, .16, 0xf9c76c);
    for (const h of [1.18, 1.52]) brick(x + .32, y + h, z, .24, .06, .24, 0x514c35);
  }
  // Broken retaining walls protect the terrace without enclosing the player.
  for (let i = 0; i < 21; i++) {
    const x = -7.3 + i * .58, z = -7.75;
    if (x > -2 && x < -.7) continue;
    const y = settlementHeightAt(x, z);
    brick(x, y + .27, z, .55, .48, .37, palette(C.stone, x, z, 22));
    if (i % 3 !== 0) brick(x - .12, y + .56, z, .39, .14, .4, 0xa5a78c);
    if (i % 4 === 0) brick(x - .14, y + .39, z + .2, .3, .18, .08, 0x6e8343);
  }
  for (let i = 0; i < 190; i++) {
    const x = -14.5 + sceneryNoise(i, 7, 28) * 29, z = -11 + sceneryNoise(i, 13, 48) * 22;
    if (!islandContains(x, z) || isSceneryWater(x, z)) continue;
    // Keep the village paths, gardens and doorway approaches distinct.
    if (x > -8.4 && x < 5.8 && z > -7.4 && z < 8.7) continue;
    const y = settlementHeightAt(x, z);
    brick(x, y + .15, z, .045, .23, .045, 0x637f3d);
    const color = i % 5 === 0 ? 0xc995a6 : i % 3 === 0 ? 0xeac366 : 0xe9e3bb;
    brick(x, y + .29, z, .17, .06, .07, color);
    brick(x, y + .29, z, .07, .06, .17, color);
    brick(x, y + .33, z, .055, .035, .055, 0xc6a34a);
  }

  // Fern fans and tufted grasses soften the open ground, with clear doorways
  // and stone paths. They are volumes, so warm side light catches each blade.
  for (let i = 0; i < (low ? 260 : 580); i++) {
    const x = -14.7 + sceneryNoise(i, 11, 71) * 29.4, z = -11.6 + sceneryNoise(i, 19, 92) * 23.2;
    if (!islandContains(x, z) || isSceneryWater(x, z)) continue;
    if (Object.values(anchors).some(anchor => Math.hypot(anchor.x - x, anchor.z - z) < 1.65)) continue;
    if ((Math.abs(z - .4) < .85 && x > -10.5 && x < 8) || (Math.abs(x + 1.3) < .74 && z < 3 && z > -7.9)) continue;
    if (x > -3 && x < 4.8 && z > 2 && z < 8.5) continue;
    const y = settlementHeightAt(x, z), n = sceneryNoise(x, z, 39);
    brick(x, y + .025, z, .34, .035, .28, n > .5 ? 0x7d8b3e : 0x6b813d);
    for (let blade = 0; blade < 3; blade++) {
      const h = .13 + sceneryNoise(i, blade, 51) * .24;
      brick(x + (blade - 1) * .065, y + h / 2, z + (blade % 2) * .05, .035, h, .04, blade % 2 ? 0x9ca64c : 0x65823d, 0, (blade - 1) * .2);
    }
    if (!low && i % 9 === 0) {
      for (let branch = 0; branch < 6; branch++) for (let leaf = 0; leaf < 3; leaf++) {
        const a = branch * Math.PI / 3, radius = .1 + leaf * .075;
        brick(x + Math.cos(a) * radius, y + .25 - leaf * .055, z + Math.sin(a) * radius, .09, .035, .18 - leaf * .02, branch % 2 ? 0x829b46 : 0x456f3b, -a);
      }
    }
    if (i % 8 === 0) {
      const flower = i % 3 ? 0xeee3b8 : 0xcfadb4;
      brick(x + .08, y + .28, z, .14, .055, .065, flower);
      brick(x + .08, y + .28, z, .065, .055, .14, flower);
    }
  }
  // Broken crags and hanging turf interrupt the exposed island cross-section.
  for (let i = 0; i < 58; i++) {
    const edge = i % 3, x = edge === 0 ? -15.1 : -13.8 + sceneryNoise(i, 3, 85) * 27.6;
    const z = edge === 0 ? -10.5 + sceneryNoise(i, 6, 75) * 21 : edge === 1 ? 11.7 : -11.7;
    if (!islandContains(x, z) || isSceneryWater(x, z)) continue;
    const y = settlementHeightAt(x, z), n = sceneryNoise(x, z, 29), h = .4 + n * 1.1;
    brick(x, y - h * .35, z, .4 + n * .45, h, .4 + n * .4, palette(C.stone, x, z, 16));
    brick(x + .04, y + .13, z, .45 + n * .4, .16, .48 + n * .3, palette(C.moss, x, z));
    if (n > .55) brick(x - .12, y - .25, z + .24, .17, .5, .12, 0x5e7d3e);
  }

  // World-aligned small teal mosaics follow depth shading and the curved banks.
  // The riverbed is darker in the channel, lighter near the shallow shelves.
  const waterTexture = waterPixels(); textures.add(waterTexture);
  // A restrained sheen keeps the small teal clusters legible. UVs are world
  // aligned, so a tiny entire texture is never repeated on every ground voxel.
  const waterMat = ownMat(new THREE.MeshStandardMaterial({ color: 0xb8ddd2, map: waterTexture, roughness: .68, metalness: .04, vertexColors: true, flatShading: true }));
  surrounding = input.includeLandscape === false ? null : yield* continuousLandscapeSteps(input.quality, waterMat, (x,z,padding)=>landClearsSceneryAt(input.player?.habitable,x,z)||!!input.proceduralClearance?.(x,z,padding),input.player?.habitable);
  if (surrounding) group.add(surrounding.group);
  const waterParts: THREE.BufferGeometry[] = [];
  let riverExitZ = 12;
  for (let x = -16 + step / 2; x < 16; x += step) for (let z = -13 + step / 2; z < 13; z += step) {
    if (!islandContains(x, z) || !isSceneryWater(x, z)) continue;
    if (z > riverExitZ) riverExitZ = z;
    temp.position.set(x, sceneryWaterHeight(z), z); temp.scale.set(step + .005, .085, step + .005); temp.rotation.set(0, 0, 0); temp.updateMatrix();
    const part = cube.clone().applyMatrix4(temp.matrix);
    const positions = part.getAttribute('position'), uvs = part.getAttribute('uv');
    const colors = new Float32Array(positions.count * 3);
    for (let vertex = 0; vertex < positions.count; vertex++) {
      const vx = positions.getX(vertex), vz = positions.getZ(vertex), edge = Math.min(1, Math.abs(vx - riverCenter(vz)) / (riverWidth(vz) / 2));
      uvs.setXY(vertex, vx / 6, vz / 6);
      colors[vertex * 3] = .66 + edge * .3; colors[vertex * 3 + 1] = .79 + edge * .19; colors[vertex * 3 + 2] = .84 + edge * .14;
    }
    part.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    waterParts.push(part);
  }
  if (waterParts.length) {
    const geometry = mergeGeometries(waterParts, false)!; waterParts.forEach(part => part.dispose()); geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, waterMat); mesh.name = 'flowing-turquoise-river'; mesh.receiveShadow = true; group.add(mesh); water.push(mesh);
  }
  if (surrounding) water.push(surrounding.water);
  const foamMaterial = ownMat(new THREE.MeshStandardMaterial({ color: 0xc7e6db, roughness: 1, transparent: true, opacity: .65, depthWrite: false }));
  const particles: FoamParticle[] = [];
  for (let i = 0; i < (low ? 24 : 48); i++) particles.push({ z: -12.4 + sceneryNoise(i, 2, 62) * 25, offset: (i % 2 ? 1 : -1) * (.3 + sceneryNoise(i, 4, 8) * .13), phase: sceneryNoise(i, 6, 18), scale: .18 + sceneryNoise(i, 8, 28) * .2 });
  const falling: { x: number; z: number; y: number; height: number; phase: number; scale: number }[] = [];
  const sheetParts: THREE.BufferGeometry[] = [];
  function sheet(x: number, y: number, z: number, w: number, h: number, d: number) {
    temp.position.set(x, y, z); temp.rotation.set(0, 0, 0); temp.scale.set(w, h, d); temp.updateMatrix();
    sheetParts.push(cube.clone().applyMatrix4(temp.matrix));
  }
  // Continuous translucent-blue volumes sit behind falling white streaks. The
  // ribbons remain connected from lip to plunge pool, including when paused.
  for (const [z, upper, lower] of [[9.02, 1.3, .89], [11.52, .89, .43], [riverExitZ + .14, .43, -1.38]]) {
    const cx = riverCenter(z), width = riverWidth(z);
    for (let i = 0; i < (low ? 12 : 24); i++) {
      const x = cx - width / 2 + (i + .5) * width / (low ? 12 : 24);
      sheet(x, (upper + lower) / 2, z, width / (low ? 12 : 24) + .012, upper - lower + .08, .13);
      falling.push({ x, z, y: upper, height: upper - lower, phase: sceneryNoise(i, z, 101), scale: .05 + sceneryNoise(i, z, 5) * .055 });
      if (i % 2 === 0) particles.push({ z, offset: 0, phase: sceneryNoise(i, z, 77), scale: .19 + sceneryNoise(i, z, 27) * .22, origin: { x, z: z + .2, y: lower + .1, spread: .24 } });
    }
  }
  // Side spring cascades nearly three units down a high rocky right bank.
  sheet(spring.x, spring.upper, spring.z - .62, spring.width, .09, 1.34);
  for (let i = 0; i < 12; i++) {
    const x = spring.x - spring.width / 2 + (i + .5) * spring.width / 12;
    sheet(x, (spring.upper + spring.lower) / 2, spring.z, spring.width / 12 + .012, spring.upper - spring.lower, .14);
    falling.push({ x, z: spring.z + .055, y: spring.upper, height: spring.upper - spring.lower, phase: sceneryNoise(i, 3, 25), scale: .07 });
    particles.push({ z: spring.z, offset: 0, phase: sceneryNoise(i, 7, 35), scale: .19 + (i % 3) * .07, origin: { x, z: spring.z + .2, y: spring.lower + .09, spread: .44 } });
  }
  const sheetGeometry = mergeGeometries(sheetParts, false)!; sheetParts.forEach(part => part.dispose()); geometries.add(sheetGeometry);
  const sheetMaterial = ownMat(new THREE.MeshStandardMaterial({ color: 0x6aaeb1, emissive: 0x163d3d, emissiveIntensity: .15, roughness: .72, transparent: true, opacity: .93 }));
  const cascadeSheets = new THREE.Mesh(sheetGeometry, sheetMaterial); cascadeSheets.name = 'continuous-cascade-sheets'; group.add(cascadeSheets);
  const cascadeMaterial = ownMat(new THREE.MeshStandardMaterial({ color: 0xb3e1da, emissive: 0x234d4a, emissiveIntensity: .1, roughness: 1, transparent: true, opacity: .66, depthWrite: false }));
  const waterfall = new THREE.InstancedMesh(cube, cascadeMaterial, falling.length); waterfall.name = 'stepped-waterfall'; waterfall.frustumCulled = false; group.add(waterfall);
  const foam = new THREE.InstancedMesh(cube, foamMaterial, particles.length); foam.name = 'river-whitewater'; foam.frustumCulled = false; group.add(foam);
  const rippleMaterial = ownMat(new THREE.MeshStandardMaterial({ color: 0xc1dfd3, roughness: 1, transparent: true, opacity: .45, depthWrite: false }));
  const ripples = new THREE.InstancedMesh(cube, rippleMaterial, low ? 18 : 38); ripples.name = 'moving-river-ripples'; ripples.frustumCulled = false; group.add(ripples);

  const voxelMat = ownMat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .94, flatShading: true }));
  const landscape = new THREE.InstancedMesh(cube, voxelMat, bricks.length); landscape.name = 'authored-island-voxels';
  bricks.forEach((part, index) => { landscape.setMatrixAt(index, part.matrix); landscape.setColorAt(index, part.color); });
  landscape.castShadow = true; landscape.receiveShadow = true; landscape.computeBoundingSphere(); group.add(landscape);
  yield;
  for (const batch of batches.values()) {
    yield;
    const geometry = mergeGeometries(batch.geometry, false)!; batch.geometry.forEach(part => part.dispose()); geometries.add(geometry);
    const mat = batch.material.clone(); materials.add(mat);
    const mesh = new THREE.Mesh(geometry, mat); mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'village-detail'; group.add(mesh);
  }
  batches.clear();
  const parcelBounds = { xMin: -PARCEL_WIDTH / 2, xMax: PARCEL_WIDTH / 2, zMin: -PARCEL_DEPTH / 2, zMax: PARCEL_DEPTH / 2 };
  const parcelBoundary = new THREE.Group(); parcelBoundary.name = 'selected-owned-parcel-boundary'; parcelBoundary.visible = false;
  const boundaryMaterial = ownMat(new THREE.MeshBasicMaterial({ color: 0xd1b466, transparent: true, opacity: .55, depthWrite: false }));
  const boundaryParts: THREE.BufferGeometry[] = [];
  for (const x of [parcelBounds.xMin, parcelBounds.xMax]) for (const z of [parcelBounds.zMin, parcelBounds.zMax]) {
    for (const [dx, dz, w, d] of [[x < 0 ? .95 : -.95, 0, 1.9, .065], [0, z < 0 ? .95 : -.95, .065, 1.9]]) {
      const px = x + dx, pz = z + dz;
      if (isSceneryWater(px, pz)) continue;
      temp.position.set(px, continuousGroundHeight(px, pz) + .075, pz); temp.rotation.set(0, 0, 0); temp.scale.set(w, .035, d); temp.updateMatrix(); boundaryParts.push(cube.clone().applyMatrix4(temp.matrix));
    }
  }
  const boundaryGeometry = mergeGeometries(boundaryParts, false)!; boundaryParts.forEach(part => part.dispose()); geometries.add(boundaryGeometry);
  parcelBoundary.add(new THREE.Mesh(boundaryGeometry, boundaryMaterial)); group.add(parcelBoundary);
  // Interior lantern surfaces gently glow, without a point light per fixture.
  group.userData = { sceneryOnly: true, terrainVoxels: bricks.length, forestTrees: treeIndex-clearedTrees, clearedProceduralTrees: clearedTrees, groundHeight: 2, bounds: { width: 168, depth: 168, maxHeight: 16 }, version: 'continuous-voxel-valley-3', continuousCascades: 4, mountainSpires: spires.length, mountainShoulders: shoulderColumns, continuousGround: true, parcelBounds };
  function animate(timeSeconds: number, reducedMotion: boolean) {
    const time = reducedMotion ? 0 : timeSeconds;
    waterTexture.offset.set(Math.sin(time * .13) * .007, -time * .012);
    particles.forEach((p, index) => {
      const phase = p.phase * Math.PI * 2 + time * 1.2;
      const z = p.origin ? p.origin.z + Math.cos(phase) * p.origin.spread : -12.6 + ((p.z + 12.6 + time * .26) % Math.max(1, riverExitZ + 12.3));
      const x = p.origin ? p.origin.x + Math.sin(phase) * p.origin.spread : riverCenter(z) + p.offset * riverWidth(z);
      temp.position.set(x, (p.origin?.y ?? sceneryWaterHeight(z) + .07) + Math.sin(phase) * .012, z);
      temp.scale.set(p.scale, .018, p.scale * (p.origin ? .7 : .32)); temp.rotation.set(0, Math.sin(z * .23) * -.2, 0); temp.updateMatrix(); foam.setMatrixAt(index, temp.matrix);
    });
    foam.instanceMatrix.needsUpdate = true;
    falling.forEach((p, index) => {
      const progress = (p.phase + time * .9) % 1, height = Math.min(.62, p.height * .5);
      temp.position.set(p.x, p.y - progress * p.height, p.z + .045);
      temp.scale.set(p.scale, height, .12 + progress * .07); temp.rotation.set(0, 0, 0); temp.updateMatrix(); waterfall.setMatrixAt(index, temp.matrix);
    });
    waterfall.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < ripples.count; i++) {
      const z = -11.8 + ((sceneryNoise(i, 5, 45) * 23.4 + time * .29) % 23.4), offset = (sceneryNoise(i, 7, 55) - .5) * .65;
      const x = riverCenter(z) + offset * riverWidth(z), swell = .5 + Math.sin(time * 1.4 + i) * .2;
      temp.position.set(x, sceneryWaterHeight(z) + .066, z); temp.scale.set(.28 + swell * .22, .012, .045); temp.rotation.set(0, -.12 + Math.sin(z * .23) * .2, 0); temp.updateMatrix(); ripples.setMatrixAt(i, temp.matrix);
    }
    ripples.instanceMatrix.needsUpdate = true;
  }
  animate(0, true);completed=true;let disposed=false;
  return {
    group, water, waterfall, foam, smokeOrigins, anchors, animate, parcelBounds, landscapeBounds: LANDSCAPE_BOUNDS, parcelBoundary,
    setParcelBoundaryVisible(visible) { parcelBoundary.visible = visible && !!input.player && !input.showcase; },
    dispose() {
      if(disposed)return;disposed=true;
      surrounding?.dispose();
      // InstancedMesh owns GPU-side instance matrix/colour buffers separately
      // from the shared BoxGeometry and must emit its disposal event as well.
      group.traverse(object => { if (object instanceof THREE.InstancedMesh) object.dispose(); });
      geometries.forEach(geometry => geometry.dispose()); materials.forEach(mat => mat.dispose()); textures.forEach(texture => texture.dispose()); group.clear();
    },
  };
  }finally{if(!completed){surrounding?.dispose();group.traverse(object=>{if(object instanceof THREE.InstancedMesh)object.dispose();});for(const batch of batches.values())batch.geometry.forEach(g=>g.dispose());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());group.clear();}}
}

function waterPixels(): THREE.DataTexture {
  const size = 64, pixels = new Uint8Array(size * size * 4);
  const colors = [new THREE.Color(0x26636d), new THREE.Color(0x2f737c), new THREE.Color(0x347e85), new THREE.Color(0x418c90), new THREE.Color(0x4e9999), new THREE.Color(0x65a9a4)];
  for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
    const clusterX = Math.floor(col / 3), clusterY = Math.floor(row / 3), n = sceneryNoise(clusterX, clusterY, 51);
    const color = colors[Math.floor(n * colors.length) % colors.length], offset = (row * size + col) * 4;
    pixels[offset] = Math.round(THREE.MathUtils.clamp(THREE.ColorManagement.workingToColorSpace(color.clone(), THREE.SRGBColorSpace).r, 0, 1) * 255);
    pixels[offset + 1] = Math.round(THREE.MathUtils.clamp(THREE.ColorManagement.workingToColorSpace(color.clone(), THREE.SRGBColorSpace).g, 0, 1) * 255);
    pixels[offset + 2] = Math.round(THREE.MathUtils.clamp(THREE.ColorManagement.workingToColorSpace(color.clone(), THREE.SRGBColorSpace).b, 0, 1) * 255);
    pixels[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat); texture.name = 'flowing-pixel-water';
  texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestMipmapNearestFilter;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.generateMipmaps = true; texture.needsUpdate = true; return texture;
}
