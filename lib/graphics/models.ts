import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BuildingType, Faction, ItemId } from '../mvp/types.ts';
import { VOXEL_COLORS, type VoxelColor } from './palette.ts';
import {stoneRockModelBoxes} from './landmark-model-data.ts';

// Assets are built once, merged by material and cloned with shared geometry.
// The renderer can instance the resulting ordinary Mesh children across tiles.
const materialPool = new Map<VoxelColor, THREE.MeshStandardMaterial>();
type TextureFamily = 'wood' | 'stone' | 'roof' | 'cloth' | 'leaf';
const texturePool = new Map<TextureFamily, THREE.DataTexture>();
const templates = new Map<string, THREE.Group>();
const geometries = new Set<THREE.BufferGeometry>();
const box = new THREE.BoxGeometry(1, 1, 1);
const transform = new THREE.Matrix4();
const position = new THREE.Vector3();
const scale = new THREE.Vector3();
const rotation = new THREE.Quaternion();
const euler = new THREE.Euler();

function textureFamily(color: VoxelColor): TextureFamily | undefined {
  if (['wood', 'woodLight', 'woodDark', 'endGrain'].includes(color)) return 'wood';
  if (['stone', 'stoneLight', 'stoneDark', 'stoneWarm', 'stoneMoss', 'soil'].includes(color)) return 'stone';
  if (['roof', 'roofLight', 'roofDark', 'teal', 'tealDark', 'red'].includes(color)) return 'roof';
  if (['cream', 'canvas'].includes(color)) return 'cloth';
  if (['leaf', 'leafLight', 'leafDark', 'grass', 'pine', 'pineLight', 'pineDark'].includes(color)) return 'leaf';
}

/** Tiny clustered greyscale maps preserve the palette and work without a DOM. */
function pixelTexture(family: TextureFamily) {
  let texture = texturePool.get(family);
  if (texture) return texture;
  const size = 16, pixels = new Uint8Array(size * size * 4);
  // Every visible mark occupies a 2x2 pixel cluster. Five discrete brightness
  // levels avoid photographic noise, including after perspective minification.
  const brightness = [226, 234, 242, 249, 255];
  const seed = { wood: 11, stone: 23, roof: 37, cloth: 47, leaf: 59 }[family];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const cx = x >> 1, cy = y >> 1;
    const hash = ((Math.imul(cx + seed, 374761393) ^ Math.imul(cy + 19, 668265263)) >>> 0);
    let shade: number;
    if (family === 'wood') {
      const grain = cy % 4 === 0 ? 1 : 3;
      const knot = (cx === 5 || cx === 6) && (cy === 2 || cy === 3);
      shade = knot ? 0 : Math.min(4, grain + (hash % 5 === 0 ? 1 : 0));
    } else if (family === 'stone') {
      shade = hash % 7 === 0 ? 0 : hash % 3 + 2;
    } else if (family === 'roof') {
      shade = cy % 4 === 3 ? 1 : (cx + (cy >> 2) * 3) % 5 === 0 ? 2 : 4;
    } else if (family === 'cloth') {
      shade = cx % 4 === 0 || cy % 4 === 0 ? 2 : 4;
    } else {
      shade = hash % 5 === 0 ? 1 : hash % 3 + 2;
    }
    const offset = (y * size + x) * 4, value = brightness[shade];
    pixels[offset] = value; pixels[offset + 1] = value; pixels[offset + 2] = value; pixels[offset + 3] = 255;
  }
  texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = `qfrontier-pixel-${family}`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapNearestFilter;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  texturePool.set(family, texture);
  return texture;
}

function material(color: VoxelColor) {
  let result = materialPool.get(color);
  if (!result) {
    const family = textureFamily(color);
    result = new THREE.MeshStandardMaterial({
      color: VOXEL_COLORS[color], roughness: color === 'water' || color === 'crystal' ? .36 : .88,
      metalness: ['iron', 'ironDark', 'copper', 'gold'].includes(color) ? .32 : .02,
      flatShading: true,
      ...(family ? { map: pixelTexture(family) } : {}),
      ...(color === 'glow' ? { emissive: VOXEL_COLORS.glow, emissiveIntensity: .48 } : {}),
      ...(color === 'crystal' ? { emissive: VOXEL_COLORS.teal, emissiveIntensity: .13 } : {}),
    });
    materialPool.set(color, result);
  }
  return result;
}

class Bricks {
  private batches = new Map<VoxelColor, THREE.BufferGeometry[]>();
  add(color: VoxelColor, x: number, y: number, z: number, w: number, h: number, d: number, rx = 0, ry = 0, rz = 0) {
    const part = box.clone();
    transform.compose(position.set(x, y, z), rotation.setFromEuler(euler.set(rx, ry, rz)), scale.set(w, h, d));
    part.applyMatrix4(transform);
    const batch = this.batches.get(color) ?? [];
    batch.push(part); this.batches.set(color, batch);
    return this;
  }
  finish(name: string) {
    const group = new THREE.Group(); group.name = name;
    for (const [color, parts] of this.batches) {
      const geometry = mergeGeometries(parts, false)!;
      parts.forEach(part => part.dispose());
      geometry.computeBoundingBox(); geometry.computeBoundingSphere(); geometries.add(geometry);
      const mesh = new THREE.Mesh(geometry, material(color));
      mesh.name = `${name}:${color}`; mesh.castShadow = true; mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }
}

function cached(key: string, build: () => THREE.Group) {
  let base = templates.get(key);
  if (!base) { base = build(); templates.set(key, base); }
  return base.clone(true);
}
function random(seed: number) {
  let state = (seed ^ 0x9e3779b9) >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
function factionColor(faction: Faction): VoxelColor {
  return faction === 'forgers' ? 'red' : faction === 'custodians' ? 'leaf' : 'teal';
}
function barrel(b: Bricks, x: number, y: number, z: number, size = 1) {
  b.add('woodDark', x, y + .2 * size, z, .3 * size, .4 * size, .3 * size)
    .add('endGrain', x, y + .41 * size, z, .27 * size, .025 * size, .27 * size);
  for (let i = 0; i < 5; i++) for (const side of [-1, 1]) {
    b.add(i % 2 ? 'wood' : 'woodLight', x + (i - 2) * .059 * size, y + .21 * size, z + side * .152 * size, .052 * size, .34 * size, .025 * size)
      .add(i % 2 ? 'woodLight' : 'wood', x + side * .152 * size, y + .21 * size, z + (i - 2) * .059 * size, .025 * size, .34 * size, .052 * size);
  }
  for (const h of [.08, .31]) b.add('ironDark', x, y + h * size, z, .32 * size, .035 * size, .32 * size);
  b.add('woodDark', x + .055 * size, y + .43 * size, z, .06 * size, .025 * size, .06 * size);
}
function crate(b: Bricks, x: number, y: number, z: number, size = .36) {
  b.add('woodLight', x, y + size / 2, z, size, size, size);
  for (const side of [-1, 1]) {
    b.add('woodDark', x + side * size * .39, y + size / 2, z, size * .13, size * 1.04, size * 1.03);
    b.add('wood', x, y + size * .5, z + side * size * .51, size * .95, size * .13, size * .05, 0, 0, .62);
  }
}
function ingot(b: Bricks, color: VoxelColor, x: number, y: number, z: number, s = 1) {
  b.add(color, x, y + .09 * s, z, .58 * s, .13 * s, .3 * s)
    .add(color, x, y + .18 * s, z, .45 * s, .06 * s, .24 * s);
}
function crystal(b: Bricks, x: number, y: number, z: number, s = 1, color: VoxelColor = 'crystal') {
  b.add(color, x, y + .24 * s, z, .18 * s, .4 * s, .18 * s)
    .add(color, x, y + .46 * s, z, .12 * s, .1 * s, .12 * s)
    .add(color, x, y + .53 * s, z, .055 * s, .05 * s, .055 * s)
    .add('tealDark', x, y + .06 * s, z, .21 * s, .09 * s, .21 * s);
}
function roof(b: Bricks, y: number, width = 1.76, depth = 1.55) {
  // Each staggered shingle has a real edge and overhang. All tiles still merge
  // into only three material meshes rather than one draw call per shingle.
  const courses = 7, columns = 8, tileWidth = width / columns;
  for (let row = 0; row < courses; row++) {
    const h = y + row * .077, remaining = depth * (1 - row / courses);
    b.add('roofDark', 0, h - .018, 0, width + .08, .055, remaining + .05);
    for (const end of [-1, 1]) {
      b.add(row % 3 ? 'wood' : 'woodLight', end * (width / 2 - .04), h + .015, 0,
        .045, .079, Math.max(.08, remaining - .12));
    }
    for (const side of [-1, 1]) {
      const z = side * (depth / 2 - (row + .5) * depth / (courses * 2));
      for (let column = 0; column <= columns; column++) {
        const start = -width / 2 + (column - (row % 2) * .5) * tileWidth;
        const left = Math.max(-width / 2, start), right = Math.min(width / 2, start + tileWidth);
        if (right - left < .01) continue;
        const shade: VoxelColor = (column * 3 + row * 7 + side) % 6 === 0 ? 'roofLight' : (column + row * 3) % 7 === 0 ? 'roofDark' : 'roof';
        b.add(shade, (left + right) / 2, h + .035, z, right - left - .012, .075, depth / (courses * 2) + .033);
      }
      b.add('woodDark', side * (width / 2 + .025), h + .04, 0, .065, .105, remaining + .12);
    }
  }
  b.add('woodLight', 0, y + .565, 0, width + .15, .08, .12);
  for (const x of [-width / 2, width / 2]) {
    b.add('endGrain', x, y + .565, 0, .035, .09, .14)
      .add('woodDark', x, y + .25, 0, .075, .53, .065);
  }
}
function barrelRoof(b: Bricks, y: number, width: number, depth: number) {
  const rows = 14, columns = 8;
  for (let row = 0; row < rows; row++) {
    const z = (row / (rows - 1) - .5) * depth;
    const rise = Math.sqrt(Math.max(0, 1 - Math.pow(z / (depth * .56), 2))) * .53;
    b.add('roofDark', 0, y + rise - .02, z, width + .08, .07, depth / rows + .035);
    for (let column = 0; column < columns; column++) {
      b.add((column + row * 2) % 5 === 0 ? 'roofLight' : 'roof', (column + .5 - columns / 2) * width / columns,
        y + rise + .025, z, width / columns - .012, .065, depth / rows + .012);
    }
    for (const x of [-width / 2, width / 2]) {
      b.add('woodDark', x, y + rise + .055, z, .06, .055, depth / rows + .025)
        .add(row % 3 === 0 ? 'woodLight' : 'wood', x, y + rise / 2, z, .055, rise, depth / rows - .01);
    }
  }
  for (const z of [-depth * .52, depth * .52]) b.add('woodLight', 0, y + .18, z, width + .14, .1, .065);
}
function masonryWalls(b: Bricks, height: number, style: BuildingType | 'home') {
  b.add('stoneDark', 0, .21 + height / 2, 0, 1.48, height, 1.23);
  const rows = Math.ceil(height / .16);
  const finish = (column: number, row: number): VoxelColor => {
    if (style === 'warehouse' || (style === 'home' && row > 2)) return (column + row) % 4 ? 'wood' : 'woodLight';
    const shade = (column * 7 + row * 3) % 11;
    return shade === 0 ? 'stoneMoss' : shade < 3 ? 'stoneWarm' : shade < 5 ? 'stoneLight' : 'stone';
  };
  for (let row = 0; row < rows; row++) {
    const y = .24 + row * .15;
    for (const side of [-1, 1]) {
      for (let column = 0; column < 8; column++) {
        const x = -.685 + column * .194 - (row % 2) * .065;
        const width = Math.max(.08, Math.min(.18, (.75 - Math.abs(x)) * 2));
        b.add(finish(column, row), x, y, side * .63 + ((column + row) % 3 - 1) * .005, width, .125 + column % 3 * .003, .062);
      }
      for (let column = 0; column < 6; column++) {
        const z = -.495 + column * .197 - (row % 2) * .06;
        b.add(finish(column + 3, row), side * .751, y, z, .055, .125 + column % 3 * .003, .181);
      }
    }
  }
  for (const y of [.27, height + .22]) {
    b.add('woodDark', 0, y, .66, 1.6, .075, .075)
      .add('woodDark', 0, y, -.66, 1.6, .075, .075)
      .add('woodDark', -.77, y, 0, .075, .075, 1.32)
      .add('woodDark', .77, y, 0, .075, .075, 1.32);
  }
  for (const side of [-1, 1]) {
    b.add('wood', side * .77, .63, -.23, .065, .07, .85, -.61)
      .add('woodLight', side * .77, .73, .3, .08, .72, .075);
    if (style === 'home' || style === 'warehouse') {
      b.add('woodDark', side * .78, .7, 0, .08, .075, 1.19);
      for (const z of [-.39, .04, .47]) b.add('woodDark', side * .78, .71, z, .075, .65, .065);
    }
  }
}
function window(b: Bricks, x: number, y: number, z: number, width = .3, lit = false) {
  b.add('woodDark', x, y, z, width + .07, .36, .065)
    .add(lit ? 'glow' : 'tealLight', x, y, z + .04, width, .28, .025)
    .add('woodLight', x, y, z + .06, .025, .3, .03)
    .add('woodLight', x, y, z + .06, width, .025, .03)
    .add('woodLight', x, y - .19, z + .075, width + .13, .055, .15)
    .add('wood', x, y + .2, z + .05, width + .11, .055, .1);
  for (const side of [-1, 1]) b.add('ironDark', x + side * (width / 2 + .025), y, z + .055, .022, .31, .025);
}
function lantern(b: Bricks, x: number, y: number, z: number) {
  b.add('ironDark', x, y + .17, z, .06, .17, .06)
    .add('glow', x, y + .04, z, .12, .18, .12)
    .add('ironDark', x, y + .14, z, .16, .035, .16)
    .add('ironDark', x, y - .06, z, .16, .035, .16);
}
function fence(b: Bricks, x: number, z: number, length: number, across = true) {
  for (let i = 0; i <= 4; i++) {
    const t = (i / 4 - .5) * length;
    b.add('wood', x + (across ? t : 0), .2, z + (across ? 0 : t), .075, .4, .075);
  }
  for (const y of [.15, .31]) b.add('woodLight', x, y, z, across ? length : .055, .055, across ? .055 : length);
}
function wagon(b: Bricks, x: number, y: number, z: number, s = 1) {
  for (let i = 0; i < 5; i++) b.add(i % 2 ? 'wood' : 'woodLight', x + (i - 2) * .1 * s, y + .24 * s, z, .092 * s, .065 * s, .55 * s);
  for (const side of [-1, 1]) {
    b.add('woodDark', x, y + .17 * s, z + side * .17 * s, .74 * s, .05 * s, .05 * s);
    for (let row = 0; row < 3; row++) {
      b.add(row % 2 ? 'wood' : 'woodLight', x + side * .28 * s, y + (.3 + row * .09) * s, z, .045 * s, .075 * s, .62 * s)
        .add('wood', x, y + (.3 + row * .09) * s, z - .28 * s, .57 * s, .075 * s, .045 * s);
    }
    for (const end of [-1, 1]) {
      const wx = x + side * .36 * s, wz = z + end * .18 * s;
      b.add('woodDark', wx, y + .16 * s, wz, .07 * s, .28 * s, .21 * s)
        .add('woodDark', wx, y + .16 * s, wz, .07 * s, .2 * s, .29 * s)
        .add('woodLight', wx + side * .04 * s, y + .16 * s, wz, .025 * s, .19 * s, .035 * s)
        .add('woodLight', wx + side * .04 * s, y + .16 * s, wz, .025 * s, .035 * s, .19 * s)
        .add('iron', wx + side * .055 * s, y + .16 * s, wz, .03 * s, .055 * s, .055 * s);
    }
    b.add('woodLight', x + side * .18 * s, y + .22 * s, z + .46 * s, .045 * s, .045 * s, .43 * s);
  }
}

export function createTree(kind: 'pine' | 'oak' | 'palm' | 'dead', seed = 0): THREE.Group {
  return cached(`tree:${kind}:${seed % 7}`, () => {
    const b = new Bricks(), rand = random(seed % 7), variation = .88 + rand() * .18;
    b.add('woodDark', 0, .12, 0, .3, .24, .3)
      .add('wood', 0, .65 * variation, 0, .17, 1.3 * variation, .17);
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5 + .3;
      b.add('woodDark', Math.cos(angle) * .14, .075, Math.sin(angle) * .14, .29, .1, .075, 0, -angle)
        .add('woodLight', -.087, .2 + i * .18, .025, .02, .1, .1);
    }
    if (kind === 'pine') {
      // Individual branch fans replace broad foliage disks. Staggered radial
      // clusters leave small dark gaps and expose the branch/trunk silhouette.
      for (let layer = 0; layer < 9; layer++) {
        const radius = .46 - layer * .041, y = (.57 + layer * .156) * variation;
        const branches = layer < 6 ? 7 : 5;
        b.add('pineDark', 0, y + .02, 0, radius * .92, .17, radius * .92);
        for (let branch = 0; branch < branches; branch++) {
          const angle = branch * Math.PI * 2 / branches + layer * .52 + seed * .1;
          const dx = Math.cos(angle), dz = Math.sin(angle), jitter = (rand() - .5) * .05;
          b.add('woodDark', dx * radius * .4, y - .035, dz * radius * .4, radius * .9, .026, .028, 0, -angle);
          for (let tip = 0; tip < 3; tip++) {
            const reach = radius * (.44 + tip * .27), w = .105 + rand() * .035;
            const c: VoxelColor = tip === 2 && branch % 3 === 0 ? 'pineLight' : (branch + layer) % 4 === 0 ? 'pineDark' : 'pine';
            b.add(c, dx * reach, y - tip * .025 + jitter, dz * reach, w, .11 + rand() * .025, w);
            if (tip === 1 && layer % 2 === 0) b.add('pineLight', dx * reach - dz * .075, y + .065, dz * reach + dx * .075, .105, .09, .105);
          }
        }
      }
      b.add('pine', 0, 1.96 * variation, 0, .085, .2, .085)
        .add('pineLight', 0, 2.065 * variation, 0, .07, .095, .07);
    } else if (kind === 'oak') {
      b.add('wood', -.18, 1.0, 0, .12, .5, .12, 0, 0, -.65)
        .add('woodLight', .2, 1.12, .04, .12, .48, .12, 0, 0, .7)
        .add('wood', 0, 1.06, -.22, .1, .55, .1, -.75);
      for (const [x, y, z, radius] of [[0, 1.56, 0, 2.55], [-.35, 1.32, .06, 2], [.35, 1.4, .09, 2.1], [.04, 1.45, -.31, 2], [.05, 1.5, .33, 1.85]]) {
        for (let ix = -2; ix <= 2; ix++) for (let iy = -2; iy <= 2; iy++) for (let iz = -2; iz <= 2; iz++) {
          const distance = ix * ix + iy * iy * 1.25 + iz * iz;
          if (distance > radius * radius || distance < (radius - .95) ** 2 || (distance > (radius - .3) ** 2 && rand() > .85)) continue;
          const c: VoxelColor = iy >= 1 && rand() > .3 ? 'leafLight' : rand() > .45 ? 'leaf' : 'leafDark';
          const size = .12 + rand() * .025;
          b.add(c, x + ix * .135, y * variation + iy * .13, z + iz * .135, size, size, size);
          if (iy === 1 && (ix + iz) % 3 === 0) b.add('leafLight', x + ix * .135 + .04, y * variation + iy * .13 + .11, z + iz * .135, .09, .09, .09);
        }
      }
    } else if (kind === 'palm') {
      for (let i = 0; i < 7; i++) b.add(i % 2 ? 'woodLight' : 'wood', .025 * i, .15 + i * .2, 0, .2, .18, .2);
      for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3;
        for (let j = 0; j < 4; j++) {
          const length = .18 + j * .18;
          b.add(j % 2 ? 'leafLight' : 'leaf', .16 + Math.cos(angle) * length, 1.54 - j * .055, Math.sin(angle) * length, .29 - j * .035, .1, .17, 0, -angle, -.18);
        }
      }
      b.add('woodDark', .12, 1.39, .12, .2, .18, .18);
    } else {
      b.add('woodDark', 0, 1.02, 0, .14, .66, .14)
        .add('wood', -.22, .92, 0, .12, .61, .12, 0, 0, -.9)
        .add('woodLight', .21, 1.13, 0, .1, .65, .1, 0, 0, .65)
        .add('woodDark', -.38, 1.1, 0, .075, .3, .075)
        .add('woodDark', .05, .77, -.23, .09, .53, .09, -.9);
    }
    return b.finish(`tree-${kind}`);
  });
}

export function createRock(kind: 'stone' | 'iron' | 'copper' | 'crystal' = 'stone', seed = 0): THREE.Group {
  return cached(`rock:${kind}:${seed % 5}`, () => {
    if(kind==='stone'){const b=new Bricks();for(const part of stoneRockModelBoxes(seed))b.add(part.color as VoxelColor,part.x,part.y,part.z,part.width,part.height,part.depth);return b.finish(`rock-${kind}`);}
    const b = new Bricks(), rand = random(seed % 5);
    b.add('stoneDark', 0, .12, 0, .79, .24, .66)
      .add('stone', -.04, .31, -.03, .65, .28, .53)
      .add('stoneLight', -.13, .48, -.08, .4, .1, .33)
      .add('stone', .37, .14, .16, .3, .27, .28);
    for (let i = 0; i < 5; i++) {
      const x = rand() * .52 - .26, z = rand() * .42 - .21;
      if (kind === 'crystal') crystal(b, x, .3, z, .4 + rand() * .55);
      else b.add(kind === 'copper' ? 'copper' : 'iron', x, .49 + rand() * .035, z, .12 + rand() * .07, .07, .09);
    }
    return b.finish(`rock-${kind}`);
  });
}

export function createBuilding(type: BuildingType | 'home' | 'mine' | 'outpost' | 'bridge', level = 1, faction: Faction = 'cartographers'): THREE.Group {
  const tier = Math.max(1, Math.min(3, Math.floor(level)));
  return cached(`building:${type}:${tier}:${faction}`, () => {
    const b = new Bricks(), accent = factionColor(faction);
    if (type === 'bridge') {
      for (const x of [-.7, .7]) b.add('stoneDark', x, .13, 0, .3, .26, .9);
      for (let i = 0; i < 12; i++) b.add(i % 3 === 0 ? 'wood' : 'woodLight', -.92 + i * .167, .3, 0, .15, .09, .86);
      for (const z of [-.45, .45]) {
        for (const x of [-.87, 0, .87]) b.add('woodDark', x, .56, z, .09, .58, .09);
        b.add('wood', 0, .8, z, 1.9, .08, .08);
      }
      return b.finish('bridge');
    }
    // Foundation stones and a front doorstep tie every structure to the terrain.
    b.add('stoneDark', 0, .065, 0, 1.76, .13, 1.55);
    for (let i = 0; i < 6; i++) b.add(i % 2 ? 'stone' : 'stoneLight', -.72 + i * .29, .17, .69, .265, .14, .18);
    b.add('stone', 0, .11, .87, .58, .13, .24);

    if (type === 'garden') {
      b.add('soil', 0, .18, 0, 1.48, .12, 1.23);
      for (const x of [-.45, 0, .45]) {
        b.add('woodLight', x, .24, 0, .035, .15, 1.3);
        for (let j = 0; j < 5; j++) {
          const z = -.48 + j * .23, h = .25 + (j % 3) * .055;
          b.add('leaf', x - .08, h + .13, z, .12, .26, .08)
            .add(j % 2 ? 'gold' : 'leafLight', x - .08, h + .29, z, .15, .1, .14)
            .add('leafDark', x + .02, h + .12, z, .15, .06, .13, 0, 0, .5);
        }
      }
      fence(b, 0, -.73, 1.75); fence(b, -.86, 0, 1.5, false);
      barrel(b, .64, .18, .52, .77);
      if (tier >= 2) {
        for (const x of [-.68, .68]) for (const z of [-.59, .59]) b.add('cream', x, .77, z, .055, 1.12, .055);
        for (const z of [-.57, 0, .57]) b.add('water', 0, 1.35, z, 1.46, .04, .36);
        b.add('cream', 0, 1.4, 0, .055, .07, 1.56);
      }
      if (tier === 3) {
        b.add('woodDark', .73, .69, -.58, .24, 1.02, .24)
          .add('water', .73, 1.3, -.58, .4, .27, .4)
          .add('ironDark', .73, 1.47, -.58, .44, .06, .44);
      }
      return b.finish(`garden-${tier}`);
    }

    if (type === 'mine') {
      b.add('stoneDark', 0, .7, -.15, 1.62, 1.24, 1.13)
        .add('black', 0, .56, .44, .75, .89, .12);
      for (const x of [-.48, .48]) b.add('wood', x, .6, .5, .19, 1.04, .25);
      b.add('woodLight', 0, 1.12, .5, 1.21, .2, .26)
        .add('copper', 0, 1.29, .5, .5, .12, .2);
      for (const x of [-.2, .2]) b.add('iron', x, .18, .7, .055, .045, .93);
      for (let i = 0; i < 5; i++) b.add('woodDark', 0, .15, .3 + i * .18, .65, .045, .07);
      b.add('ironDark', .22, .4, .87, .46, .28, .43);
      for (const x of [.04, .4]) for (const z of [.72, 1.02]) b.add('black', x, .24, z, .1, .14, .08);
      for (let i = 0; i < 3; i++) b.add('iron', .1 + i * .1, .57, .87, .11, .11, .13);
      lantern(b, -.56, 1.05, .68);
      return b.finish(`mine-${tier}`);
    }

    if (type === 'outpost' || type === 'logistics') {
      const high = type === 'outpost' ? 1.05 : .82;
      for (const x of [-.56, .56]) for (const z of [-.47, .47]) b.add('woodDark', x, .15 + high / 2, z, .12, high, .12);
      b.add('woodLight', 0, high + .19, 0, 1.44, .13, 1.27);
      for (let i = 0; i < 7; i++) b.add('wood', -.72, .21 + i * .15, .67, .35, .05, .07);
      for (const x of [-.89, -.55]) b.add('woodLight', x, .7, .67, .05, 1.12, .07);
      for (const z of [-.61, .61]) {
        for (const x of [-.66, .66]) b.add('wood', x, high + .55, z, .07, .65, .07);
        b.add('woodLight', 0, high + .68, z, 1.38, .07, .065);
      }
      b.add(accent, 0, high + .65, -.62, .62, .35, .025);
      if (type === 'outpost') {
        roof(b, high + .94, 1.51, 1.4);
        b.add('wood', .6, high + 1.34, 0, .065, .69, .065)
          .add(accent, .83, high + 1.58, 0, .4, .22, .035);
        fence(b, 0, -.76, 1.75);
      } else {
        b.add('woodDark', .47, high + .6, -.27, .12, 1.14, .12)
          .add('woodLight', .1, high + 1.11, -.27, 1.18, .1, .12)
          .add('ironDark', -.38, high + .69, -.27, .035, .79, .035)
          .add('iron', -.38, high + .26, -.27, .12, .09, .1);
        crate(b, .42, .18, .6, .4); barrel(b, -.5, .18, -.55, .8);
        wagon(b, .06, .16, .83, .72);
        if (tier >= 2) { crate(b, .42, .59, .6, .32); barrel(b, -.03, .36, .83, .42); }
        if (tier === 3) {
          for (const x of [-.27, .27]) b.add('wood', x, .78, .83, .035, .64, .035);
          b.add('canvas', 0, 1.11, .83, .7, .065, .56)
            .add(accent, 0, 1.15, .83, .14, .035, .57);
          b.add('cream', -.3, high + .88, -.35, .83, .1, .64);
        }
      }
      return b.finish(`${type}-${tier}`);
    }

    const height = .88 + (tier - 1) * .08;
    masonryWalls(b, height, type);
    for (const x of [-.75, .75]) for (const z of [-.63, .63]) b.add('woodDark', x, .19 + height / 2, z, .1, height + .09, .1);
    b.add('wood', 0, .56, .642, .37, .68, .045)
      .add('woodDark', 0, .25, .68, .46, .07, .08)
      .add('gold', .11, .54, .68, .035, .035, .025);
    for (let plank = 0; plank < 4; plank++) b.add(plank % 2 ? 'woodLight' : 'wood', -.139 + plank * .092, .56, .675, .08, .66, .025);
    for (const y of [.35, .76]) b.add('woodDark', 0, y, .7, .39, .055, .025);
    b.add('gold', .11, .54, .721, .035, .035, .025);
    if (type !== 'workshop') window(b, -.48, .77, .64, .26, type === 'home' || type === 'kitchen');
    window(b, .48, .77, .64, .26, type === 'laboratory');
    if (type === 'warehouse') barrelRoof(b, height + .16, 1.8, 1.58);
    else if (type === 'workshop') roof(b, height + .21, 1.69, 1.36);
    else if (type === 'kitchen') roof(b, height + .24, 1.57, 1.46);
    else if (type === 'laboratory') roof(b, height + .22, 1.45, 1.49);
    else if (type === 'barracks') roof(b, height + .29, 1.81, 1.43);
    else roof(b, height + .27, 1.76, 1.61);
    b.add(accent, -.48, .47, .7, .2, .19, .025);
    lantern(b, .78, .93, .71);

    if (type === 'workshop') {
      b.add('stoneDark', -.54, .43, .77, .77, .59, .63)
        .add('black', -.54, .45, 1.095, .56, .35, .025)
        .add('glow', -.54, .31, 1.116, .49, .105, .025)
        .add('stoneLight', -.54, .73, .92, .83, .11, .47)
        .add('stoneDark', -.67, 1.18, -.23, .44, 1.96, .43)
        .add('stoneLight', -.67, 2.2, -.23, .53, .1, .52)
        .add('black', -.67, 2.26, -.23, .31, .025, .3);
      for (let row = 0; row < 12; row++) {
        const y = .39 + row * .153;
        for (const side of [-1, 1]) for (let col = 0; col < 2; col++) {
          b.add((row + col + side) % 4 ? 'stone' : 'stoneLight', -.67 + side * .23, y, -.33 + col * .215, .035, .134, .197)
            .add((row + col * 3) % 5 ? 'stoneWarm' : 'stoneLight', -.78 + col * .22, y, -.005, .203, .134, .035);
        }
      }
      // A stepped stone hood and a recessed black throat give the forge actual
      // depth; small fire voxels sit behind its pale masonry jambs.
      b.add('stone', -.54, .87, .9, .59, .18, .43)
        .add('stoneWarm', -.54, 1.02, .77, .43, .14, .39)
        .add('stoneDark', -.54, .22, 1.08, .87, .12, .22);
      for (let brick = 0; brick < 5; brick++) b.add(brick % 2 ? 'stoneLight' : 'stoneWarm', -.87 + brick * .165, .16, .96, .147, .1, .3);
      for (let row = 0; row < 3; row++) for (const side of [-1, 1]) b.add(row % 2 ? 'stone' : 'stoneLight', -.54 + side * .325, .32 + row * .13, 1.11, .11, .112, .08);
      for (let ember = 0; ember < 6; ember++) b.add(ember % 2 ? 'glow' : 'red', -.73 + ember * .075, .37 + ember % 3 * .025, 1.12, .06, .06 + ember % 2 * .06, .035);
      b.add('wood', .6, .52, .87, .66, .09, .34);
      for (const x of [.37, .82]) b.add('woodDark', x, .31, .87, .07, .39, .07);
      b.add('ironDark', .56, .62, .87, .27, .12, .18)
        .add('iron', .56, .7, .87, .41, .07, .2);
      b.add('woodDark', .73, .75, -.36, .11, .91, .11)
        .add('woodLight', .73, .68, .04, .11, .09, .91)
        .add('wood', .73, .75, -.04, .08, .075, .75, -.55);
      for (let rack = 0; rack < 3; rack++) b.add('wood', .78, .53 + rack * .15, -.36, .05, .035, .41);
      if (tier >= 2) {
        b.add('copper', -.67, .87, .12, .57, .1, .69);
        b.add('woodDark', .72, .58, .45, .45, .06, .065);
        for (let tool = 0; tool < 3; tool++) b.add('iron', .54 + tool * .16, .76, .47, .055, .29, .055);
      }
      if (tier === 3) {
        b.add('ironDark', .76, 1.14, -.3, .11, 1.47, .11)
          .add('copper', .76, 1.79, -.3, .51, .13, .25);
        crystal(b, .76, 1.85, -.3, .36);
      }
    } else if (type === 'kitchen') {
      b.add('stone', .78, .43, -.25, .58, .58, .62)
        .add('black', .78, .43, .08, .31, .25, .035)
        .add('glow', .78, .37, .11, .24, .075, .03)
        .add('red', .78, .82, -.3, .42, .2, .46)
        .add('stoneDark', .78, 1.23, -.3, .22, .76, .22);
      barrel(b, -.72, .17, .66, .8);
      b.add('woodLight', .56, .42, .93, .64, .06, .31)
        .add('gold', .48, .5, .93, .16, .1, .12)
        .add('cream', .69, .51, .93, .16, .12, .12);
      if (tier >= 2) b.add('canvas', .13, 1.02, .92, 1.2, .085, .51);
      if (tier === 3) {
        for (let i = 0; i < 3; i++) b.add('red', -.27 + i * .27, 1.07, 1.02, .16, .04, .64);
        b.add('woodDark', .67, .65, 1.12, .06, .93, .06);
      }
    } else if (type === 'laboratory') {
      b.add('stoneLight', -.63, .88, -.38, .6, 1.49, .59)
        .add('tealDark', -.63, 1.68, -.38, .7, .13, .68)
        .add('water', -.63, 1.84, -.38, .48, .21, .48)
        .add('crystal', -.63, 1.99, -.38, .28, .11, .28);
      for (let row = 0; row < 8; row++) for (const side of [-1, 1]) {
        b.add(row % 3 === 0 ? 'stoneLight' : 'stone', -.63 + side * .315, .35 + row * .15, -.38, .035, .132, .55);
      }
      b.add('woodDark', -.63, 1.37, -.065, .27, .35, .045)
        .add('glow', -.63, 1.38, -.035, .19, .25, .025)
        .add('woodLight', -.63, 1.18, -.015, .34, .055, .12)
        .add('wood', -.63, 1.37, -.015, .025, .28, .025);
      b.add('ironDark', .66, .63, .89, .37, .83, .25)
        .add('tealLight', .66, .83, 1.03, .25, .21, .025);
      if (tier >= 2) {
        b.add('copper', -.63, 2.22, -.38, .055, .45, .055)
          .add('copper', -.63, 2.36, -.38, .41, .05, .05);
        crystal(b, -.63, 2.41, -.38, .3);
      }
      if (tier === 3) for (const x of [-.2, .2]) b.add('blue', x + .37, 1.61, -.35, .3, .05, .53, 0, 0, -.27);
    } else if (type === 'barracks') {
      for (const x of [-.73, .73]) {
        b.add('stone', x, .8, -.42, .37, 1.29, .38)
          .add('stoneLight', x, 1.49, -.42, .45, .13, .46);
        for (const dx of [-.15, .15]) b.add('stoneLight', x + dx, 1.62, -.42, .12, .2, .44);
      }
      b.add(accent, -.75, 1.22, .42, .035, .5, .3);
      for (const side of [-1, 1]) {
        b.add('woodDark', side * .55, 1.13, .76, .38, .055, .06)
          .add(accent, side * .55, .87, .77, .25, .46, .035)
          .add('gold', side * .55, .88, .796, .09, .17, .015)
          .add('gold', side * .55, .88, .796, .16, .045, .015)
          .add('gold', side * .55, .64, .77, .29, .035, .05);
      }
      for (let i = 0; i < 3; i++) {
        b.add('wood', .37 + i * .15, .49, .94, .035, .7, .035)
          .add('iron', .37 + i * .15, .89, .94, .07, .17, .035);
      }
      b.add('woodDark', .52, .4, .94, .59, .065, .08);
      if (tier >= 2) b.add('ironDark', 0, 1.27, .8, .41, .45, .06);
      if (tier === 3) {
        b.add('gold', 0, 1.27, .845, .19, .24, .025)
          .add('woodDark', 0, 1.98, -.1, .065, .72, .065)
          .add(accent, .23, 2.16, -.1, .43, .29, .04);
      }
    } else if (type === 'warehouse') {
      b.add('wood', 0, .61, .67, .74, .83, .05);
      for (let i = 0; i < 5; i++) b.add('woodLight', -.3 + i * .15, .61, .71, .026, .79, .025);
      b.add('ironDark', 0, 1.05, .75, .91, .06, .07);
      crate(b, -.65, .18, .86, .39); crate(b, .65, .18, .86, .38);
      if (tier >= 2) {
        crate(b, -.65, .58, .86, .32); barrel(b, .81, .19, -.25, .9);
        b.add('woodLight', .89, .89, -.25, .46, .08, .8);
      }
      if (tier === 3) {
        b.add('woodDark', .85, 1.04, -.42, .09, 1.7, .09)
          .add('wood', .51, 1.89, -.42, .91, .09, .09)
          .add('ironDark', .12, 1.57, -.42, .025, .59, .025);
        crate(b, .12, 1.15, -.42, .28);
      }
    } else {
      // The station home is a distinct welcoming landmark, with a lit porch.
      b.add('woodLight', 0, .24, .91, 1.29, .11, .52);
      for (let plank = 0; plank < 7; plank++) b.add(plank % 3 ? 'woodLight' : 'wood', -.555 + plank * .185, .3, .91, .174, .035, .54);
      for (const x of [-.58, .58]) b.add('wood', x, .68, 1.1, .075, .91, .075);
      // Rustic lean-to shingles replace the broad flat porch canvas.
      for (let row = 0; row < 4; row++) for (let column = 0; column < 8; column++) b.add((row + column) % 5 ? 'roof' : 'roofLight', -.61 + column * .175, 1.17 - row * .055, .72 + row * .14, .163, .065, .17);
      for (const side of [-1, 1]) {
        b.add('woodLight', side * .61, .57, .95, .045, .055, .46);
        for (const z of [.77, .94, 1.11]) b.add('wood', side * .61, .44, z, .035, .29, .035);
      }
      b.add('stone', .58, 1.37, -.4, .23, .85, .27);
      barrel(b, -.79, .19, .61, .64);
      // Low compound walls leave the front entrance open. Their corner piers,
      // inset timber panels and separate caps read clearly from an isometric view.
      for (const side of [-1, 1]) {
        for (let section = 0; section < 4; section++) {
          const z = -.64 + section * .47;
          b.add(section % 2 ? 'stoneWarm' : 'stone', side * .98, .23, z, .13, .31, .42)
            .add('stoneLight', side * .98, .41, z, .17, .075, .43);
        }
        for (const z of [-.83, 1.13]) {
          b.add('stoneDark', side * .98, .25, z, .24, .43, .23)
            .add('stoneLight', side * .98, .5, z, .28, .09, .27)
            .add('stoneWarm', side * .98, .58, z, .19, .075, .19);
        }
        b.add('stone', side * .71, .23, 1.15, .37, .31, .13)
          .add('woodLight', side * .71, .43, 1.15, .38, .07, .15);
      }
      b.add('woodDark', -.69, 1.72, -.48, .045, .91, .045)
        .add(accent, -.49, 1.98, -.48, .38, .25, .035)
        .add('gold', -.49, 1.99, -.455, .07, .11, .015);
      if (tier >= 2) {
        b.add(accent, -.5, 1.73, 0, .43, .18, .035);
        for (let pot = 0; pot < 3; pot++) {
          b.add('red', -.45 + pot * .44, .83, .85, .17, .17, .15)
            .add('leafLight', -.45 + pot * .44, .98, .85, .22, .16, .19);
        }
      }
      if (tier === 3) { crystal(b, .15, 1.87, 0, .55); crate(b, .75, .19, .83, .28); }
    }
    return b.finish(`${type}-${tier}`);
  });
}

export function createUnit(type: 'scout' | 'guard' | 'ranged' | 'engineer', faction: Faction = 'cartographers'): THREE.Group {
  return cached(`unit:${type}:${faction}`, () => {
    const accent = factionColor(faction), b = new Bricks();
    b.add('woodDark', 0, .39, 0, .25, .13, .19)
      .add(accent, 0, .52, 0, .29, .22, .21)
      .add('skin', 0, .73, .01, .22, .22, .21)
      .add('woodDark', 0, .85, -.015, .24, .06, .23)
      .add('black', -.055, .745, .12, .028, .028, .016)
      .add('black', .055, .745, .12, .028, .028, .016)
      .add('skinLight', 0, .713, .13, .035, .045, .045)
      .add('woodDark', 0, .674, .12, .055, .018, .018)
      .add('woodDark', -.055, .781, .12, .04, .015, .018)
      .add('woodDark', .055, .781, .12, .04, .015, .018)
      .add('skin', -.127, .736, .02, .035, .07, .065)
      .add('skin', .127, .736, .02, .035, .07, .065)
      .add('woodDark', 0, .455, .118, .29, .05, .03)
      .add('gold', 0, .455, .14, .045, .045, .02)
      .add('canvas', -.055, .55, .129, .035, .26, .025, 0, 0, -.38)
      .add('woodLight', .087, .405, .15, .095, .1, .065);
    if (type === 'scout') {
      b.add('roofDark', 0, .85, .015, .34, .045, .34)
        .add('wood', 0, .91, -.025, .23, .11, .25)
        .add('roofDark', 0, .88, -.025, .25, .035, .27)
        .add('cream', -.1, .95, -.04, .045, .16, .045, 0, 0, -.25)
        .add('canvas', 0, .54, -.18, .21, .23, .12)
        .add('cream', .01, .55, -.255, .13, .16, .02)
        .add('woodLight', .09, .58, -.255, .055, .09, .025)
        .add('tealDark', 0, .595, .135, .31, .045, .03);
    } else if (type === 'guard') {
      b.add('iron', 0, .56, .02, .32, .22, .27)
        .add('ironDark', 0, .86, -.01, .28, .12, .27)
        .add('iron', 0, .95, -.01, .22, .07, .22)
        .add('ironDark', -.13, .79, .015, .035, .15, .15)
        .add('ironDark', .13, .79, .015, .035, .15, .15)
        .add('iron', 0, .815, .14, .028, .18, .025)
        .add(accent, 0, 1.01, -.01, .07, .09, .21)
        .add('wood', .25, .56, .06, .035, .8, .035)
        .add('iron', .25, 1.01, .06, .08, .2, .04)
        .add('ironDark', -.23, .49, .17, .19, .33, .065)
        .add(accent, -.23, .5, .21, .11, .24, .025);
    } else if (type === 'ranged') {
      b.add('woodDark', .11, .56, -.17, .1, .36, .11)
        .add('cream', .11, .82, -.17, .02, .23, .025)
        .add('cream', .17, .8, -.17, .02, .24, .025)
        .add('leafDark', 0, .86, -.02, .29, .09, .28)
        .add('leaf', 0, .93, -.045, .2, .1, .21)
        .add('leafDark', -.13, .73, -.02, .04, .21, .22)
        .add('leafDark', .13, .73, -.02, .04, .21, .22)
        .add('leaf', -.045, .43, -.145, .27, .4, .035);
      for (const y of [-.18, .18]) b.add('woodLight', -.27, .54 + y, .15, .035, .23, .04, 0, 0, y > 0 ? -.3 : .3);
      b.add('woodLight', -.31, .54, .15, .035, .18, .04)
        .add('cream', -.24, .54, .15, .015, .52, .015);
    } else {
      b.add('gold', 0, .85, 0, .29, .1, .27)
        .add('copper', 0, .93, 0, .23, .08, .22)
        .add('ironDark', 0, .83, .13, .23, .07, .045)
        .add('water', -.06, .83, .16, .06, .045, .02)
        .add('water', .06, .83, .16, .06, .045, .02)
        .add('woodDark', 0, .51, -.18, .24, .28, .13)
        .add('copper', 0, .51, -.255, .15, .17, .025)
        .add('woodLight', .25, .5, .1, .045, .45, .045)
        .add('iron', .25, .74, .1, .23, .08, .09);
    }
    const group = b.finish(`unit-${type}`);
    for (const side of [-1, 1]) {
      const leg = new Bricks();
      leg.add('woodDark', 0, -.12, 0, .095, .25, .11)
        .add('black', 0, -.255, .035, .115, .08, .18);
      const limb = leg.finish(side < 0 ? 'leftLeg' : 'rightLeg');
      limb.position.set(side * .075, .33, 0); group.add(limb);
      const arm = new Bricks();
      arm.add(type === 'guard' ? 'iron' : accent, 0, -.06, 0, .105, .15, .13)
        .add('skin', 0, -.18, .015, .085, .12, .09)
        .add('woodDark', 0, -.255, .015, .09, .05, .1);
      const armGroup = arm.finish(side < 0 ? 'leftArm' : 'rightArm');
      armGroup.position.set(side * .207, .61, 0); group.add(armGroup);
    }
    group.userData.kind = type;
    return group;
  });
}

/** An actual 3D exhibit for each catalog ID, rather than a generic recoloured box. */
export function createItem(id: ItemId): THREE.Group {
  return cached(`item:${id}`, () => {
    const b = new Bricks();
    if (id === 'iron_ore' || id === 'copper_ore' || id === 'stone') {
      const group = createRock(id === 'stone' ? 'stone' : id === 'iron_ore' ? 'iron' : 'copper', 2);
      group.name = `item-${id}`; return group;
    }
    if (id === 'silica') {
      for (const [x, z, s] of [[-.2, 0, .8], [.16, .12, 1], [.1, -.19, .7]]) crystal(b, x, 0, z, s, 'pale');
      b.add('stoneLight', 0, .06, 0, .61, .1, .5);
    } else if (id === 'timber') {
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * .2, y = i === 1 ? .36 : .16;
        b.add('wood', x, y, 0, .18, .19, .63)
          .add('endGrain', x, y, .32, .15, .15, .025)
          .add('woodDark', x, y, .336, .055, .06, .015);
      }
      b.add('canvas', 0, .24, 0, .66, .055, .07);
    } else if (id === 'fiber') {
      for (let i = 0; i < 7; i++) b.add(i % 2 ? 'canvas' : 'cream', -.27 + i * .09, .29, (i % 3 - 1) * .04, .055, .53 + i % 2 * .08, .08, 0, 0, (i - 3) * .07);
      b.add('woodDark', 0, .22, .055, .52, .065, .11);
    } else if (id === 'water') {
      b.add('ironDark', 0, .09, 0, .42, .14, .33)
        .add('water', 0, .32, 0, .38, .35, .3)
        .add('iron', 0, .53, 0, .3, .08, .26)
        .add('ironDark', 0, .61, 0, .16, .09, .16)
        .add('tealLight', -.11, .34, .16, .06, .23, .025);
      for (const x of [-.23, .23]) b.add('ironDark', x, .37, 0, .06, .28, .08);
    } else if (id === 'grain' || id === 'seed' || id === 'nutrient') {
      const c: VoxelColor = id === 'nutrient' ? 'cream' : id === 'seed' ? 'wood' : 'canvas';
      b.add(c, 0, .23, 0, .45, .39, .35)
        .add(c, 0, .45, 0, .33, .13, .28)
        .add('woodDark', 0, .47, 0, .35, .045, .3);
      if (id === 'grain') for (let i = 0; i < 5; i++) b.add('gold', -.1 + i % 3 * .09, .53 + Math.floor(i / 3) * .04, -.04 + i % 2 * .1, .075, .06, .06);
      else if (id === 'nutrient') {
        b.add('leaf', 0, .26, .19, .2, .2, .025)
          .add('cream', 0, .28, .21, .025, .13, .02, 0, 0, -.35);
      } else for (let i = 0; i < 4; i++) b.add('gold', -.14 + i * .1, .06, .3, .065, .08, .065);
    } else if (id === 'herbs') {
      for (let i = 0; i < 5; i++) {
        const x = -.18 + i * .085;
        b.add('leafDark', x, .27, 0, .025, .45, .035, 0, 0, (i - 2) * .13)
          .add(i % 2 ? 'leafLight' : 'leaf', x - .045, .37, .02, .16, .07, .12, 0, 0, -.35)
          .add('leaf', x + .045, .48, .02, .15, .075, .11, 0, 0, .35);
      }
      b.add('canvas', 0, .16, .03, .38, .065, .09);
    } else if (id === 'biomass') {
      b.add('woodDark', 0, .18, 0, .58, .29, .46)
        .add('soil', 0, .35, 0, .52, .12, .4);
      for (let i = 0; i < 6; i++) b.add(i % 2 ? 'leafDark' : 'leafLight', -.2 + i % 3 * .19, .43 + i % 2 * .03, -.1 + Math.floor(i / 3) * .2, .16, .09, .1, 0, i, .2);
      b.add('woodLight', 0, .24, .24, .56, .04, .03);
    } else if (id === 'crystal_shard') {
      crystal(b, 0, 0, 0, 1.25); crystal(b, -.2, 0, .11, .63); crystal(b, .18, 0, -.1, .8);
    } else if (id === 'data_fragment') {
      b.add('tealDark', 0, .26, 0, .55, .43, .075)
        .add('ironDark', 0, .27, .05, .2, .2, .04)
        .add('tealLight', 0, .27, .075, .12, .12, .025);
      for (let i = 0; i < 5; i++) {
        b.add('copper', -.23 + i * .105, .08, .05, .025, .12, .02)
          .add('copper', -.23 + i * .105, .45, .05, .025, .09, .02);
      }
      b.add('gold', .21, .25, .05, .035, .12, .025);
    } else if (id === 'iron_ingot' || id === 'alloy') {
      const c = id === 'alloy' ? 'copper' : 'iron';
      ingot(b, c, -.07, 0, .11); ingot(b, c, .06, .22, -.04);
      b.add('ironDark', .08, .32, .09, .14, .025, .055);
    } else if (id === 'copper_wire') {
      b.add('woodDark', 0, .07, 0, .5, .09, .46)
        .add('woodLight', 0, .5, 0, .5, .09, .46)
        .add('wood', 0, .27, 0, .14, .45, .14);
      for (let i = 0; i < 5; i++) b.add('copper', 0, .15 + i * .067, 0, .39, .046, .37);
      b.add('copper', .28, .12, .13, .26, .035, .035);
    } else if (id === 'cloth') {
      for (let i = 0; i < 3; i++) {
        b.add(i % 2 ? 'tealDark' : 'teal', i % 2 * .04, .09 + i * .12, 0, .59, .1, .4)
          .add('cream', i % 2 * .04, .13 + i * .12, .17, .52, .015, .02);
      }
      b.add('canvas', .12, .24, 0, .065, .43, .44);
    } else if (id === 'glass') {
      for (let i = 0; i < 3; i++) {
        b.add('water', -.12 + i * .1, .34 + i * .035, -.08 + i * .08, .41, .6, .035)
          .add('tealLight', -.23 + i * .1, .42 + i * .035, -.057 + i * .08, .045, .3, .025);
      }
      b.add('woodDark', 0, .06, 0, .65, .08, .41);
    } else if (id === 'plank') {
      for (let i = 0; i < 3; i++) {
        b.add(i % 2 ? 'woodLight' : 'wood', (i - 1) * .21, .12 + i % 2 * .07, 0, .19, .11, .71)
          .add('woodDark', (i - 1) * .21, .18 + i % 2 * .07, .21, .025, .015, .21);
      }
    } else if (id === 'ration') {
      b.add('canvas', 0, .19, 0, .57, .31, .4)
        .add('cream', 0, .37, 0, .46, .065, .34)
        .add('woodDark', 0, .23, 0, .075, .42, .44)
        .add('leafDark', 0, .23, .22, .17, .15, .025);
    } else if (id === 'bread') {
      b.add('woodLight', 0, .12, 0, .65, .17, .34)
        .add('gold', 0, .25, 0, .59, .14, .36)
        .add('endGrain', 0, .34, 0, .43, .065, .27);
      for (const x of [-.17, 0, .17]) b.add('cream', x, .38, 0, .045, .02, .19, 0, .3);
    } else if (id === 'preserved_food') {
      b.add('ironDark', 0, .065, 0, .36, .07, .35)
        .add('teal', 0, .29, 0, .33, .39, .32)
        .add('iron', 0, .52, 0, .37, .08, .36)
        .add('cream', 0, .29, .17, .25, .22, .02)
        .add('red', 0, .3, .19, .1, .11, .02);
    } else if (id === 'medkit') {
      b.add('red', 0, .28, 0, .58, .4, .25)
        .add('woodDark', 0, .51, 0, .27, .075, .1)
        .add('red', 0, .545, 0, .17, .035, .08)
        .add('cream', 0, .29, .14, .23, .07, .025)
        .add('cream', 0, .29, .14, .075, .23, .025);
      for (const x of [-.21, .21]) b.add('iron', x, .43, .14, .045, .07, .025);
    } else if (id === 'repair_kit') {
      b.add('tealDark', 0, .17, 0, .61, .26, .35)
        .add('ironDark', 0, .33, 0, .64, .075, .38)
        .add('iron', -.19, .48, 0, .06, .28, .06)
        .add('iron', .19, .48, 0, .06, .28, .06)
        .add('woodLight', 0, .62, 0, .41, .06, .08)
        .add('copper', 0, .22, .19, .1, .12, .025);
    } else if (id === 'drill_module_i' || id === 'drill_module_ii') {
      const advanced = id === 'drill_module_ii';
      b.add('ironDark', 0, .11, 0, .57, .18, .46)
        .add(advanced ? 'teal' : 'copper', 0, .3, 0, .42, .23, .35)
        .add('iron', 0, .48, 0, .25, .17, .25);
      for (let i = 0; i < 4; i++) b.add(i % 2 ? 'ironDark' : 'iron', 0, .6 + i * .07, 0, .24 - i * .048, .055, .24 - i * .048, 0, i * .6);
      for (const x of [-.24, .24]) b.add('copper', x, .31, 0, .06, .3, .08);
      if (advanced) { crystal(b, -.22, .38, .17, .36); crystal(b, .22, .38, .17, .36); }
    } else if (id === 'pickaxe') {
      b.add('woodLight', 0, .37, 0, .075, .71, .075, 0, 0, -.18)
        .add('iron', .045, .69, 0, .52, .12, .12)
        .add('ironDark', -.25, .64, 0, .17, .1, .11, 0, 0, .4)
        .add('iron', .31, .64, 0, .14, .09, .1, 0, 0, -.5)
        .add('woodDark', -.04, .22, 0, .09, .16, .09, 0, 0, -.18);
    } else if (id === 'scanner') {
      b.add('ironDark', 0, .15, 0, .24, .26, .19)
        .add('teal', 0, .4, .02, .4, .35, .22)
        .add('black', 0, .44, .15, .31, .23, .025)
        .add('tealLight', 0, .45, .17, .24, .15, .02)
        .add('glow', .1, .29, .16, .035, .035, .025)
        .add('copper', -.14, .69, .01, .035, .25, .035)
        .add('iron', -.14, .82, .01, .085, .06, .085);
    } else if (id === 'cart') {
      b.add('woodLight', 0, .3, 0, .52, .07, .52);
      for (const x of [-.28, .28]) b.add('wood', x, .45, 0, .055, .3, .57);
      b.add('wood', 0, .45, -.28, .57, .3, .055);
      for (const x of [-.34, .34]) for (const z of [-.18, .18]) {
        b.add('woodDark', x, .16, z, .075, .25, .25)
          .add('iron', x + Math.sign(x) * .045, .16, z, .025, .055, .055);
      }
      for (const x of [-.18, .18]) b.add('woodLight', x, .28, .46, .045, .045, .45);
    } else if (id === 'weather_cloak') {
      b.add('tealDark', 0, .39, 0, .43, .55, .15)
        .add('teal', 0, .2, 0, .59, .19, .22)
        .add('teal', 0, .68, 0, .27, .14, .25)
        .add('black', 0, .65, .13, .17, .13, .025)
        .add('gold', 0, .48, .095, .06, .06, .025);
      for (const x of [-.16, .16]) b.add('tealLight', x, .29, .105, .035, .26, .025);
    } else if (id === 'camp_kit') {
      b.add('woodDark', 0, .06, 0, .68, .08, .55);
      for (let i = 0; i < 5; i++) b.add(i % 2 ? 'canvas' : 'cream', 0, .14 + i * .1, 0, .62 - i * .11, .1, .53);
      b.add('black', 0, .23, .28, .2, .29, .025)
        .add('wood', -.35, .22, .23, .035, .36, .035)
        .add('wood', .35, .22, .23, .035, .36, .035)
        .add('woodDark', 0, .61, 0, .055, .08, .61);
    } else if (id === 'guard_armor') {
      b.add('ironDark', 0, .43, 0, .34, .43, .21)
        .add('iron', 0, .44, .05, .29, .32, .19)
        .add('iron', -.25, .58, 0, .2, .14, .23)
        .add('iron', .25, .58, 0, .2, .14, .23)
        .add('copper', 0, .45, .16, .13, .16, .025)
        .add('woodDark', 0, .16, 0, .41, .13, .25);
      b.add('ironDark', 0, .7, 0, .19, .09, .19);
    } else if (id === 'spear') {
      b.add('woodLight', 0, .41, 0, .055, .79, .055)
        .add('woodDark', 0, .12, 0, .07, .17, .07)
        .add('iron', 0, .85, 0, .13, .2, .06)
        .add('iron', 0, .98, 0, .07, .07, .045)
        .add('copper', 0, .73, 0, .085, .055, .08);
    } else if (id === 'arrow_bundle') {
      b.add('woodDark', 0, .28, 0, .25, .49, .22);
      for (let i = 0; i < 5; i++) {
        const x = -.11 + i % 3 * .11, z = -.04 + Math.floor(i / 3) * .12;
        b.add('woodLight', x, .48, z, .025, .63, .025)
          .add('cream', x, .79, z, .08, .12, .035)
          .add('iron', x, .14, z, .06, .1, .04);
      }
      b.add('canvas', 0, .37, .13, .29, .07, .025);
    } else if (id === 'bridge_kit') {
      for (let i = 0; i < 5; i++) b.add(i % 2 ? 'woodLight' : 'wood', -.26 + i * .13, .11, 0, .11, .13, .61);
      for (const z of [-.19, .19]) b.add('ironDark', 0, .2, z, .67, .07, .07);
      b.add('cream', 0, .29, 0, .41, .08, .24)
        .add('teal', 0, .34, 0, .28, .015, .025)
        .add('teal', -.12, .34, 0, .025, .015, .16)
        .add('teal', .12, .34, 0, .025, .015, .16);
    } else if (id === 'memory_core') {
      b.add('ironDark', 0, .1, 0, .49, .16, .43)
        .add('copper', 0, .19, 0, .4, .07, .35)
        .add('tealDark', 0, .35, 0, .29, .27, .28);
      crystal(b, 0, .32, 0, .7);
      for (const x of [-.22, .22]) b.add('gold', x, .36, 0, .06, .32, .07);
    } else if (id === 'ancient_map') {
      b.add('cream', 0, .16, 0, .65, .065, .47)
        .add('canvas', -.3, .19, 0, .1, .16, .53)
        .add('canvas', .3, .19, 0, .1, .16, .53);
      for (const [x, z, w, d] of [[-.12, -.09, .21, .025], [-.02, -.01, .025, .17], [.1, .07, .23, .025]]) b.add('teal', x, .2, z, w, .015, d);
      b.add('red', .15, .21, -.1, .1, .02, .025, 0, .7)
        .add('red', .15, .21, -.1, .1, .02, .025, 0, -.7);
    } else if (id === 'artifact_frame') {
      b.add('stoneDark', 0, .07, 0, .61, .11, .33);
      for (const x of [-.22, .22]) b.add('copper', x, .42, 0, .1, .63, .16);
      for (const y of [.15, .72]) b.add('gold', 0, y, 0, .54, .1, .17);
      for (const x of [-.22, .22]) for (const y of [.15, .72]) b.add('teal', x, y, .1, .07, .07, .045);
      b.add('ironDark', 0, .44, 0, .13, .13, .08);
    } else if (id === 'season_relic') {
      b.add('stoneDark', 0, .07, 0, .57, .12, .47)
        .add('copper', 0, .17, 0, .4, .1, .32)
        .add('gold', 0, .29, 0, .26, .17, .23)
        .add('tealDark', 0, .43, 0, .43, .14, .4)
        .add('gold', 0, .54, 0, .29, .1, .27);
      crystal(b, 0, .58, 0, .58);
      for (const x of [-.22, .22]) b.add('gold', x, .57, 0, .07, .38, .08, 0, 0, -Math.sign(x) * .15);
    } else {
      const missing: never = id;
      throw new Error(`Missing 3D catalog model: ${missing}`);
    }
    return b.finish(`item-${id}`);
  });
}

/** Only call after the last renderer using this shared library has been torn down. */
export function disposeModelResources() {
  geometries.forEach(geometry => geometry.dispose());
  materialPool.forEach(value => value.dispose());
  texturePool.forEach(texture => texture.dispose());
  geometries.clear(); materialPool.clear(); texturePool.clear(); templates.clear();
}
