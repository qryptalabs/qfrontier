import { geoToWorld, type GeoPoint, type PlanetVector, type WorldPoint } from './planet-data.ts';

const DEGREES=180/Math.PI;
const MAX_NAVIGABLE_LATITUDE=89.5;

function finite(value:number,label:string):number {
  if(typeof value!=='number'||!Number.isFinite(value))throw new RangeError(`${label} debe ser un número finito.`);
  return value;
}
const positiveZero=(value:number)=>value===0?0:value;

/** Inverse of planet-data.geoToVector, including non-unit surface vectors.
 * Three's default SphereGeometry convention places lon=0 on +X and east on -Z.
 * At an exact pole longitude is undefined; this API canonically returns zero.
 * Signed Z preserves the two longitude seam endpoints where distinguishable.
 * Scaling before hypot avoids overflow/underflow for finite nonzero vectors. */
export function planetVectorToGeo(point:PlanetVector):GeoPoint {
  if(point===null||typeof point!=='object')throw new RangeError('El punto del planeta debe ser un vector finito no nulo.');
  const x=finite(point.x,'Vector X'),y=finite(point.y,'Vector Y'),z=finite(point.z,'Vector Z');
  const scale=Math.max(Math.abs(x),Math.abs(y),Math.abs(z));
  if(scale===0)throw new RangeError('El centro del planeta no tiene coordenadas de superficie.');
  const nx=x/scale,ny=y/scale,nz=z/scale,horizontal=Math.hypot(nx,nz);
  const lat=Math.atan2(ny,horizontal)*DEGREES;
  const lon=horizontal===0?0:Math.atan2(-nz,nx)*DEGREES;
  return{lat:positiveZero(lat),lon:positiveZero(lon)};
}

/** Exact projection inverse. At ±90 degrees the result lies just beyond the
 * camera's ±89.5 latitude guard. Apply clampWorldPoint to a navigation target;
 * keeping the inverse separate preserves actual sample coordinates. */
export function planetVectorToWorld(point:PlanetVector):WorldPoint {
  const location=planetVectorToGeo(point);
  return geoToWorld(location.lat,location.lon);
}

const northwest=geoToWorld(MAX_NAVIGABLE_LATITUDE,-180);
const southeast=geoToWorld(-MAX_NAVIGABLE_LATITUDE,180);

/** Full fictional world extent, independent of population and the 81 resource
 * sectors. The half-degree polar margin keeps ground-camera navigation stable.
 * Longitude seam endpoints remain distinct coordinates; neither is wrapped. */
export const geographicWorldBounds=Object.freeze({
  minX:northwest.x,maxX:southeast.x,minY:northwest.y,maxY:southeast.y,
});

/** Camera-only bound: never rounds, wraps, chooses an economic tile, moves an
 * explorer, changes a parcel or authorizes construction on observed terrain. */
export function clampWorldPoint(x:number,y:number):WorldPoint {
  finite(x,'Coordenada X');finite(y,'Coordenada Y');
  return{
    x:positiveZero(Math.max(geographicWorldBounds.minX,Math.min(geographicWorldBounds.maxX,x))),
    y:positiveZero(Math.max(geographicWorldBounds.minY,Math.min(geographicWorldBounds.maxY,y))),
  };
}
