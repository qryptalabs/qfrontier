import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {publicStationLayout,publicStationObstacles} from '../lib/graphics/public-station-layout.ts';
import {createBuilding} from '../lib/graphics/models.ts';
import {createWorldAssetLibrary,type WorldAsset} from '../lib/graphics/world-models.ts';
import {stableSeed} from '../lib/graphics/scene-data.ts';
import type {BuildingType} from '../lib/mvp/types.ts';

const buildings=(level:number)=>Object.fromEntries(['workshop','garden','kitchen','laboratory','barracks','warehouse','logistics'].map(kind=>[kind,level]))as Record<BuildingType,number>;

test('every seeded public station placement has the same footprint as its actual visible model across biomes and levels',()=>{
  const assets=createWorldAssetLibrary();try{
    for(const variant of[0,1,2,3]){let id='';for(let i=0;!id;i++)if(stableSeed(`station-test-${i}`)%4===variant)id=`station-test-${i}`;
      for(const biome of['forest','ice','desert','coast']as const)for(const level of[1,2,3,10])for(const part of publicStationLayout({id,plot:{x:-64,y:128},buildings:buildings(level)},biome)){
        const model=part.source==='building'?createBuilding(part.kind as Parameters<typeof createBuilding>[0],part.level,'custodians'):assets.get(part.kind as WorldAsset);model.position.set(part.x,0,part.y);model.rotation.y=part.rotation;model.scale.setScalar(part.scale);const actual=new THREE.Box3().setFromObject(model),o=part.obstacle,c=Math.abs(Math.cos(o.rotation??0)),s=Math.abs(Math.sin(o.rotation??0)),halfX=(o.width*c+o.depth*s)/2,halfZ=(o.width*s+o.depth*c)/2;
        for(const[got,expected]of[[actual.min.x,o.x-halfX],[actual.max.x,o.x+halfX],[actual.min.z,o.y-halfZ],[actual.max.z,o.y+halfZ],[actual.max.y,o.height]])assert.ok(Math.abs(got-expected)<1e-6,`${biome}/${part.kind}/${level}: visible ${got}, collision ${expected}`);
      }
    }
  }finally{assets.dispose();}
});

test('public station geometry uses only the existing station tiers and never creates invisible domestic landscape obstacles',()=>{
  const place={id:'neighbor',plot:{x:12,y:40},buildings:buildings(0)},parts=publicStationLayout(place,'forest'),obstacles=publicStationObstacles(place,'forest');
  assert.deepEqual(parts.map(p=>p.kind),['home','market']);assert.equal(obstacles.length,2);assert.ok(obstacles.every(o=>o.kind==='building'));
  assert.equal(publicStationLayout({...place,buildings:buildings(2)},'coast').filter(p=>p.kind==='windmill').length,1);assert.ok(!publicStationObstacles(place,'coast').some(o=>o.id.includes('boat')),'floating boat scenery does not create a solid block across the footpath');
});
