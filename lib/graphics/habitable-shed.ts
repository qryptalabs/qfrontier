import * as THREE from 'three';
import type {Faction} from '../mvp/types.ts';

type Part={x:number;y:number;z:number;w:number;h:number;d:number;color:number};

/** The larger loft adds volume above the same confirmed 3.2 × 2.8 m footprint. */
export function createHabitableShedLevelTwo(make:(parts:Part[])=>THREE.Mesh,faction:Faction):THREE.Group{
  const group=new THREE.Group();group.name='habitable-shed-level-two';
  const stone=faction==='custodians'?0x8f9781:faction==='forgers'?0x8c8d83:0x92998b,wood=faction==='custodians'?0x79865a:faction==='forgers'?0x9b7752:0x9b855b,beam=0x5e5039;
  const parts:Part[]=[{x:0,y:.1,z:0,w:3.08,h:.2,d:2.68,color:stone},{x:0,y:.15,z:1.27,w:1.18,h:.15,d:.18,color:0xa5a994}];
  for(const x of[-1.39,1.39])for(let row=0;row<4;row++)for(let n=0;n<6;n++)parts.push({x,y:.3+row*.22,z:-1.07+n*.42,w:.24,h:.2,d:.4,color:(n+row)%3?stone:0xa1a694});
  for(let row=0;row<4;row++)for(let n=0;n<8;n++)parts.push({x:-1.27+n*.36,y:.3+row*.22,z:-1.16,w:.34,h:.2,d:.22,color:(n+row)%3?stone:0xa1a694});
  for(const x of[-1.35,-.68,.68,1.35])for(const z of[-1.15,1.16])parts.push({x,y:1.54,z,w:.14,h:2.84,d:.14,color:beam});
  for(const z of[-1.16,1.16])for(const y of[1.12,1.91,2.75])parts.push({x:0,y,z,w:2.84,h:.15,d:.15,color:beam});
  for(const x of[-1.38,1.38])for(const y of[1.12,1.91,2.75])parts.push({x,y,z:0,w:.15,h:.15,d:2.4,color:beam});
  for(let i=0;i<12;i++)parts.push({x:0,y:1.91,z:-1.1+i*.2,w:2.67,h:.1,d:.185,color:i%3?0xa79268:0xb49c70});
  for(const x of[-1.35,1.35])for(let n=0;n<9;n++)for(let row=0;row<3;row++)parts.push({x,y:2.1+row*.2,z:-1.05+n*.26,w:.13,h:.18,d:.245,color:(row+n)%3?wood:0xb49b6a});
  // Upper doors stay visibly empty until the aggregate storage summary adds cargo.
  for(const z of[-1.16,1.16])for(let n=0;n<12;n++){const x=-1.23+n*.225;if(z>0&&Math.abs(x)<.67)continue;for(let row=0;row<3;row++)parts.push({x,y:2.1+row*.2,z,w:.21,h:.18,d:.13,color:(n+row)%3?wood:0xb49b6a});}
  for(const x of[-.56,.56])parts.push({x,y:1.98,z:1.19,w:.1,h:.17,d:.15,color:beam});
  parts.push({x:0,y:2.72,z:1.2,w:1.35,h:.12,d:.17,color:beam},{x:0,y:2.48,z:1.24,w:.055,h:.37,d:.055,color:0x8f8360},{x:0,y:2.3,z:1.24,w:.25,h:.07,d:.075,color:0x706649});
  const body=make(parts);body.name='habitable-shed-reinforced-body';group.add(body);
  const roof:Part[]=[];
  for(const sign of[-1,1])for(let column=0;column<7;column++)for(let row=0;row<13;row++){const x=sign*(.105+column*.22),y=3.79-column*.155;roof.push({x,y,z:-1.25+row*.208,w:.232,h:.145,d:.223,color:(column+row)%4===0?0xc48e54:(column+row)%3?0x98683d:0xb27a45});if(row%3===0)roof.push({x,y:y-.13,z:-1.25+row*.208,w:.23,h:.105,d:.075,color:beam});}
  for(let row=0;row<13;row++)roof.push({x:0,y:3.9,z:-1.25+row*.208,w:.2,h:.13,d:.222,color:row%3?0xc99559:0xb2814f});
  const tiles=make(roof);tiles.name='habitable-shed-reinforced-roof';group.add(tiles);return group;
}
