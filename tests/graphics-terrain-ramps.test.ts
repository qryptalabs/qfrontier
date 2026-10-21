import assert from 'node:assert/strict';
import {test} from 'node:test';
import {clipTerrainRampFace,type TerrainRamp,type TerrainVertex} from '../lib/graphics/terrain-ramps.ts';

const ramp:TerrainRamp={id:'inclined-access',a:{x:0,y:0},b:{x:10,y:0},width:2,fromHeight:0,toHeight:5};
const insideAbove=(p:TerrainVertex)=>p[0]>.00001&&p[0]<9.99999&&Math.abs(p[2])<1&&p[1]>p[0]*.5+.001;
function probes(polygons:readonly(readonly TerrainVertex[])[]){return polygons.flatMap(p=>p.slice(1,-1).map((_,i)=>[0,1,2].map(axis=>(p[0][axis]+p[i+1][axis]+p[i+2][axis])/3)as unknown as TerrainVertex));}

test('public ramp cuts remove only terrain above their explicit corridor, retaining both mountain shoulders',()=>{
  const face:TerrainVertex[]=[[0,8,-3],[0,8,3],[10,8,3],[10,8,-3]],pieces=clipTerrainRampFace(face,[ramp]);
  assert.ok(pieces.length>=2);assert.ok(probes(pieces).every(p=>!insideAbove(p)));
  assert.ok(pieces.some(p=>p.some(v=>v[2]<-2)));assert.ok(pieces.some(p=>p.some(v=>v[2]>2)));
});

test('ramp clipping removes buried cliff faces above the inclined plane while preserving rock below the deck',()=>{
  const pieces=clipTerrainRampFace([[5,-3,-3],[5,-3,3],[5,9,3],[5,9,-3]],[ramp]);
  assert.ok(probes(pieces).every(p=>!insideAbove(p)));assert.ok(pieces.some(p=>p.some(v=>v[1]<0)));
  const cut=pieces.flat().filter(p=>Math.abs(Math.abs(p[2])-1.002)<1e-6&&p[1]<3);assert.ok(cut.length>0);
});

test('terrain below a raised ramp and all unrelated faces remain unchanged',()=>{
  const below:TerrainVertex[]=[[2,-1,-.5],[2,-1,.5],[8,-1,.5],[8,-1,-.5]],outside:TerrainVertex[]=[[0,8,4],[0,8,6],[10,8,6],[10,8,4]];
  assert.deepEqual(clipTerrainRampFace(below,[ramp]),[below]);assert.deepEqual(clipTerrainRampFace(outside,[ramp]),[outside]);assert.deepEqual(clipTerrainRampFace(outside,[]),[outside]);
});

test('descending diagonal ramps clip in world coordinates across negative chunk seams',()=>{
  const diagonal:TerrainRamp={...ramp,a:{x:-70,y:-70},b:{x:-58,y:-58},fromHeight:12,toHeight:0},face:TerrainVertex[]=[[-70,20,-70],[-70,20,-58],[-58,20,-58],[-58,20,-70]],pieces=clipTerrainRampFace(face,[diagonal]);
  assert.ok(pieces.length>0);for(const point of probes(pieces)){const u=((point[0]+70)+(point[2]+70))/Math.SQRT2,v=(-(point[0]+70)+(point[2]+70))/Math.SQRT2;assert.ok(Math.abs(v)>=1||u<=0||u>=Math.hypot(12,12));}
});
