/** Pure camera constraints, shared by pointer, touch, buttons and exports. */
export interface CameraBounds { xMin: number; xMax: number; zMin: number; zMax: number }
export const PARCEL_CAMERA_BOUNDS: CameraBounds = { xMin: -20, xMax: 20, zMin: -18, zMax: 18 };
export const ATLAS_CAMERA_BOUNDS: CameraBounds = { xMin: -15.2, xMax: 15.2, zMin: -15.2, zMax: 15.2 };

export function clampTarget(x: number, z: number, bounds: CameraBounds, margin = 0): { x: number; z: number } {
  const mx = Math.min(Math.max(0, margin), (bounds.xMax - bounds.xMin) / 2);
  const mz = Math.min(Math.max(0, margin), (bounds.zMax - bounds.zMin) / 2);
  return {
    x: Math.max(bounds.xMin + mx, Math.min(bounds.xMax - mx, Number.isFinite(x) ? x : 0)),
    z: Math.max(bounds.zMin + mz, Math.min(bounds.zMax - mz, Number.isFinite(z) ? z : 0)),
  };
}

export function parcelCameraLimits() {
  return { minZoom: .9, maxZoom: 3.1, minPolarAngle: .48, maxPolarAngle: .96, targetMargin: 7 };
}

export function atlasCameraLimits() {
  return { minZoom: .75, maxZoom: 12, minPolarAngle: .35, maxPolarAngle: 1.08, targetMargin: 0 };
}
