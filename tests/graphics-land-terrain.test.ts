import assert from 'node:assert/strict';
import {test} from 'node:test';
import {LAND_GRID_HALF,landCellAt,landCellGeometry,landCellPrepared,landClearsSceneryAt,landNaturalWater,landPreparedCells,landTerrainHeight,landTerrainWater} from '../lib/graphics/land-terrain.ts';
import {islandContains,settlementHeightAt} from '../lib/graphics/settlement-layout.ts';
import {landCellAt as serverCellAt} from '../lib/mvp/land-grid.ts';
test('25 square cells fit the original parcel and retain exact stable coordinates at every boundary',()=>{
 assert.equal(LAND_GRID_HALF,17.5);const ids=new Set<string>();
 for(let row=0;row<25;row++)for(let col=0;col<25;col++){const cell=landCellGeometry(`land_${row}_${col}`)!;assert.equal(landCellAt(cell.x,cell.y),cell);assert.ok(cell.minX>=-20&&cell.maxX<=20&&cell.minY>=-18&&cell.maxY<=18);ids.add(cell.id);}
 assert.equal(ids.size,625);assert.equal(landCellAt(17.5,17.5),null);assert.equal(landCellAt(-17.5,-17.5)?.id,'land_0_0');assert.equal(landCellAt(17.51,0),null);assert.equal(landCellAt(NaN,0),null);
 for(let row=0;row<=25;row++)for(let col=0;col<=25;col++)for(const offset of[-1e-9,0,1e-9]){const x=-17.5+col*1.4+offset,y=-17.5+row*1.4+offset;assert.equal(landCellAt(x,y)?.id,serverCellAt(x,y)?.id,'rendering and authority agree even at floating point grid boundaries');}
});
test('old scenes are unchanged and claimed cells need completed clearing before support appears',()=>{
 const cell=landCellAt(-16.8,0)!,cleared={land:{cells:{[cell.id]:{clearedAt:5}}}},prepared={land:{cells:{[cell.id]:{clearedAt:5,claimedAt:6}}}};
 assert.equal(landTerrainHeight(undefined,cell.x,cell.y,9),9);assert.equal(landTerrainHeight(cleared,cell.x,cell.y,9),9);assert.equal(landCellPrepared(cleared,cell.x,cell.y),false);assert.equal(landClearsSceneryAt(cleared,cell.x,cell.y),true);assert.equal(landTerrainHeight(prepared,cell.x,cell.y,9),settlementHeightAt(cell.x,cell.y));assert.equal(landCellPrepared(prepared,cell.x,cell.y),true);
 const invalid={land:{cells:{[cell.id]:{clearedAt:NaN,claimedAt:6}}}};assert.equal(landClearsSceneryAt(invalid,cell.x,cell.y),false);assert.equal(landTerrainHeight(invalid,cell.x,cell.y,9),9);
});
test('all original authored ground samples stay identical and every water feature remains protected',()=>{
 const all=Object.fromEntries(Array.from({length:625},(_,i)=>[`land_${Math.floor(i/25)}_${i%25}`,{clearedAt:1,claimedAt:2}])),state={land:{cells:all}};
 for(let x=-16;x<16;x+=.4)for(let y=-13;y<13;y+=.4)if(islandContains(x,y))assert.equal(landTerrainHeight(state,x,y,settlementHeightAt(x,y)),settlementHeightAt(x,y));
 assert.equal(landNaturalWater(5,16.5),true);assert.equal(landTerrainWater(state,5,16.5),true);assert.equal(landClearsSceneryAt(state,5,16.5),false);assert.equal(landTerrainHeight(state,5,16.5,-1.85),-1.85);assert.equal(landTerrainWater(undefined,5,16.5,false),false,'legacy water fallback stays unchanged');
 assert.equal(landTerrainWater(state,10.6,4.25,false),false,'the existing bridge dry surface remains traversable');
});
test('public visual state uses the same support and terrace height without private proof data',()=>{
 const cell=landCellAt(16.8,-8.4)!,cells={[cell.id]:{clearedAt:1,claimedAt:2}},privateState={land:{cells}},publicState={landVisual:{cells}};
 assert.equal(landTerrainHeight(privateState,cell.x,cell.y,2),3.65);assert.equal(landTerrainHeight(publicState,cell.x,cell.y,2),3.65);assert.deepEqual(landPreparedCells(privateState),[cell]);assert.deepEqual(landPreparedCells(privateState),landPreparedCells(privateState));assert.deepEqual(landPreparedCells(publicState),[cell]);
});
