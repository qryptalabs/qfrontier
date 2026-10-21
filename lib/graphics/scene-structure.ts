import {activeWeather,type SceneInput} from './scene-data.ts';
import {habitableCommerceRouteKey} from './habitable-commerce.ts';
import type {HabitableState} from '../mvp/habitable-data.ts';
import {landDevelopmentKey} from './land-terrain.ts';
/** Only changes which affect authored ground, tree clearance or model placement belong here.
 * Production, food and private inventory are updated by the existing live overlay layers. */
export function habitableLandscapeShape(state:Pick<HabitableState,'buildings'|'commerce'|'commerceGateway'|'land'|'landVisual'>|null|undefined){const buildings=state?.buildings.map(b=>[b.id,b.templateId,b.x,b.y,b.rotation])??[],land=landDevelopmentKey(state);return land?[...buildings,['land',land]]:buildings;}

/** The station has no regional convoys, deposit discovery meshes or battle markers.
 * Those server updates must not recreate its authored village and its live workers. */
export function stationLandscapeSignature(next:SceneInput):string{return JSON.stringify([next.mode,next.quality,next.player?.id,next.player?.faction,next.player?.settlement,next.player?.buildings,habitableLandscapeShape(next.player?.habitable),next.player?.habitable?.commerce?.gateway??next.player?.habitable?.commerceGateway,habitableCommerceRouteKey((next.view.habitable?.commerce?.caravans??[]).filter(c=>c.playerId===next.player?.id)),!!next.player?.habitable?.workers?.length,next.player?.units.slice(0,8).map(unit=>[unit.id,unit.type]),activeWeather(next)]);}
