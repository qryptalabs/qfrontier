import * as THREE from 'three';
import { BUILDING_LABELS, ITEMS } from '../mvp/catalog';
import type { BuildingType, Faction, Unit } from '../mvp/types';
import { createBuilding, createItem, createUnit } from './models';

export type ItemAtlas = {
  url: string;
  columns: number;
  rows: number;
  cellSize: number;
  ids: string[];
  index: Record<string, number>;
};

// Inventory illustrations share one short-lived WebGL context. Each cell is an
// actual render of the same model factory used by the world and model viewer.
// Keep its geometries/materials intact: that factory can share them with a scene.
let atlasPromise: Promise<ItemAtlas> | undefined;

const nextIdle = () => new Promise<void>(resolve => {
  const visible=()=>{if(document.hidden){document.addEventListener('visibilitychange',visible,{once:true});return;}if(typeof requestIdleCallback==='function')requestIdleCallback(()=>document.hidden?visible():resolve(),{timeout:2000});else setTimeout(()=>document.hidden?visible():resolve(),32);};visible();
});

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo preparar el atlas.')), 'image/png');
  });
}

async function renderAtlas(): Promise<ItemAtlas> {
  if (typeof document === 'undefined') throw new Error('El atlas se prepara en el navegador.');
  const assets: { id: string; create: () => THREE.Group }[] = ITEMS.map(item => ({ id: item.id, create: () => createItem(item.id) }));
  for (const building of Object.keys(BUILDING_LABELS) as BuildingType[]) {
    for (const level of [1, 2, 3]) {
      assets.push({ id: `building:${building}:${level}`, create: () => createBuilding(building, level, 'cartographers') });
    }
  }
  for (const unit of ['scout', 'guard', 'ranged', 'engineer'] as Unit['type'][]) {
    for (const faction of ['cartographers', 'forgers', 'custodians'] as Faction[]) {
      assets.push({ id: `unit:${unit}:${faction}`, create: () => createUnit(unit, faction) });
    }
  }
  const columns = 8;
  const rows = Math.ceil(assets.length / columns);
  const cellSize = 256;
  const canvas = document.createElement('canvas');
  canvas.width = columns * cellSize;
  canvas.height = rows * cellSize;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Este dispositivo no permite crear miniaturas.');
  // Text and distinct SVG illustrations are already usable. GPU illustrations
  // yield to initial layout and input, then prepare one cell per idle task.
  await nextIdle();

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setSize(cellSize, cellSize, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.55;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 200);
  const key = new THREE.DirectionalLight(0xfff0cf, 4.2);
  key.position.set(-4, 7, 5);
  const rim = new THREE.DirectionalLight(0x9ec9ff, 2.1);
  rim.position.set(4, 3, -4);
  scene.add(key, rim, new THREE.HemisphereLight(0xd9ecff, 0x5b4936, 2.5));

  try {
    for (let index = 0; index < assets.length; index += 1) {
      const model = assets[index].create();
      scene.add(model);
      model.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const extent = Math.max(size.x, size.y, size.z, 0.2);
      camera.position.copy(center).add(new THREE.Vector3(4.5, 3.5, 5).multiplyScalar(extent));
      camera.lookAt(center);
      camera.updateMatrixWorld(true);

      // Fit in camera space, so long spears and broad carts receive equal
      // padding without relying on each asset's original pivot or dimensions.
      const inverse = camera.matrixWorldInverse;
      let half = 0.1;
      for (const x of [bounds.min.x, bounds.max.x]) {
        for (const y of [bounds.min.y, bounds.max.y]) {
          for (const z of [bounds.min.z, bounds.max.z]) {
            const corner = new THREE.Vector3(x, y, z).applyMatrix4(inverse);
            half = Math.max(half, Math.abs(corner.x), Math.abs(corner.y));
          }
        }
      }
      half *= 1.16;
      camera.left = -half;
      camera.right = half;
      camera.top = half;
      camera.bottom = -half;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      context.drawImage(renderer.domElement, (index % columns) * cellSize, Math.floor(index / columns) * cellSize);
      scene.remove(model);
      if(index+1<assets.length)await nextIdle();
    }
    const blob = await canvasBlob(canvas);
    const ids = assets.map(asset => asset.id);
    return { url: URL.createObjectURL(blob), columns, rows, cellSize, ids, index: Object.fromEntries(ids.map((id, index) => [id, index])) };
  } finally {
    // GPU resources belong to this renderer; model data can be reused by the
    // interactive world without a second upload being invalidated globally.
    renderer.dispose();
    renderer.forceContextLoss();
    scene.clear();
  }
}

export function getItemAtlas(): Promise<ItemAtlas> {
  atlasPromise ??= renderAtlas();
  return atlasPromise;
}

export function getAtlasIndex(atlas: ItemAtlas, id: string): number {
  return atlas.index[id] ?? -1;
}
