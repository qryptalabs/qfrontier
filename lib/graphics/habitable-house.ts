import * as THREE from 'three';

export interface HabitableHouseVoxel {x:number;y:number;z:number;w:number;h:number;d:number;color:number}

/** A pooled, solid voxel dwelling. Every step, eave and chimney stays in its 3.2 × 2.8 parcel footprint. */
export function createHabitableHouseTemplate(make:(parts:HabitableHouseVoxel[])=>THREE.Mesh,windowMaterial:THREE.Material):THREE.Group{
  const house=new THREE.Group(),walls:HabitableHouseVoxel[]=[],roof:HabitableHouseVoxel[]=[],frame:HabitableHouseVoxel[]=[],glass:HabitableHouseVoxel[]=[];
  const add=(list:HabitableHouseVoxel[],x:number,y:number,z:number,w:number,h:number,d:number,color:number)=>list.push({x,y,z,w,h,d,color});
  // Stone plinth and two individually defined entrance steps leave the shared access outside the footprint clear.
  add(walls,0,.12,-.1,2.78,.24,2.13,0x7c8377);
  for(let row=0;row<2;row++)for(let i=0;i<9;i++)for(const side of[-1,1])add(walls,-1.23+i*.307,.08+row*.12,side*.99-.1,.29,.105,.13,(i+row)%3?0xa1a38d:0x777f72);
  add(walls,0,.07,1.22,.85,.14,.25,0xa6a28c);add(walls,0,.17,1.02,.81,.2,.22,0x969885);
  // Render each wall separately so windows are real recesses rather than luminous stickers over a solid facade.
  add(walls,0,.93,-1.04,2.58,1.5,.14,0xc5b998);
  for(const x of[-1.27,1.27]){
    add(walls,x,.49,-.08,.14,.52,1.9,0xc6bb9c);add(walls,x,1.57,-.08,.14,.3,1.9,0xcbbf9f);
    add(walls,x,1.04,-.84,.14,.58,.42,0xc2b38e);add(walls,x,1.04,.67,.14,.58,.4,0xc2b38e);
    for(const z of[-.51,.33])add(walls,x,1.04,z,.18,.66,.085,0x6e563a);
    for(const y of[.72,1.36])add(walls,x, y,-.09,.22,.095,.94,0x806044);
    add(walls,x,1.04,-.09,.155,.53,.7,0x30443c);add(glass,x+(x>0?.011:-.011),1.04,-.09,.164,.47,.65,0xeac581);
    add(walls,x+(x>0?.026:-.026),1.04,-.09,.18,.055,.72,0x6f5438);add(walls,x+(x>0?.026:-.026),1.04,-.09,.18,.57,.055,0x6f5438);
  }
  for(const x of[-.85,.85])add(walls,x,.96,.88,.92,1.48,.15,0xc9bd9c);
  add(walls,0,1.6,.88,.83,.25,.15,0xb9a77e);add(walls,0,.82,.94,.67,1.27,.1,0x6e4c31);
  for(let i=0;i<5;i++)add(walls,-.26+i*.13,.82,1.002,.119,1.19,.022,i%2?0x956a43:0x835b38);
  add(walls,0,1.5,1.01,.87,.11,.13,0x58452f);for(const x of[-.4,.4])add(walls,x,.83,1.01,.1,1.41,.14,0x5c4931);
  for(const y of[.38,1.23])add(walls,0,y,1.022,.65,.065,.045,0x4d3f2e);add(walls,.22,.85,1.049,.05,.055,.035,0xd5b477);
  // Timber studs continue into both gables and create a readable silhouette at district scale.
  for(const x of[-1.32,1.32])for(const z of[-1.05,.91])add(walls,x,.96,z,.13,1.6,.15,0x624b32);
  for(const y of[.27,1.72])add(walls,0,y,.94,2.77,.13,.14,0x654d32);
  for(const x of[-1.33,1.33])for(let row=0;row<6;row++){const width=1.95-row*.3;add(walls,x,1.77+row*.12,-.08,.14,.14,width,0xc6b995);}
  // Discrete terracotta tiles form both roof slopes; no texture billboard or oversized overhang is required.
  for(const side of[-1,1])for(let row=0;row<8;row++)for(let col=0;col<15;col++){
    const z=-.08+side*(.11+row*.157),y=2.67-row*.11,color=[0xa76536,0xb67641,0x98592f,0xbc814c][(row*3+col)%4];
    add(roof,-1.45+col*.207,y,z,.199,.14,.205,color);
    if(col%4===0)add(roof,-1.45+col*.207,y+.075,z,.025,.025,.198,0xc18c55);
  }
  for(let i=0;i<15;i++)add(roof,-1.45+i*.207,2.75,-.08,.201,.12,.23,i%3?0xbd814b:0xa86a38);
  for(const x of[-1.54,1.54])for(const side of[-1,1])for(let row=0;row<8;row++)add(roof,x,2.62-row*.11,-.08+side*(.1+row*.159),.075,.14,.2,0x5b4933);
  // A block-built chimney with a dark open-looking flue, capped entirely inside the roof boundary.
  for(let row=0;row<7;row++)for(let col=0;col<2;col++)add(roof,-.86+col*.19,2.33+row*.12,-.52,.18,.112,.33,(row+col)%3?0x9b9a88:0x7b8176);
  add(roof,-.765,3.13,-.52,.48,.1,.43,0xbbb7a0);add(roof,-.765,3.191,-.52,.25,.024,.2,0x343b32);
  // Restrained porch details: lantern, sill, shutters and a low stack of firewood are all structural scenery.
  add(walls,.68,1.32,1.035,.16,.26,.16,0x66573b);add(walls,.68,1.32,1.126,.09,.15,.025,0xe5c483);
  for(let i=0;i<4;i++)add(walls,-1.05+i*.16,.36,.94,.14,.15,.28,i%2?0x8b673f:0x755333);
  // Scaffolding belongs to the build phase only; it does not add walkable obstacles beyond the declared building.
  for(const x of[-1.45,1.45])for(const z of[-1.21,1.2])add(frame,x,.97,z,.09,1.94,.09,0x9f8254);
  for(const y of[.52,1.25,1.85])for(const z of[-1.21,1.2])add(frame,0,y,z,3.02,.075,.12,0xc0a071);
  for(const x of[-1.45,1.45])add(frame,x,1.25,0,.3,.07,2.43,0xac8b5a);
  const body=make(walls);body.name='habitable-house-body';const tiles=make(roof);tiles.name='habitable-house-roof';const scaffold=make(frame);scaffold.name='habitable-house-scaffold';scaffold.visible=false;const windows=make(glass);windows.name='habitable-house-occupied-windows';windows.material=windowMaterial;windows.visible=false;
  house.add(body,tiles,scaffold,windows);return house;
}
