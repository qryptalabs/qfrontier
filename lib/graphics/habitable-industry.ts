import * as THREE from 'three';
import type {Faction} from '../mvp/types.ts';
import type {HabitableHouseVoxel} from './habitable-house.ts';

/** Production props are separate from the permanent machine: only confirmed jobs expose inputs or outputs. */
export function createHabitableIndustryTemplate(kind:'woodlot'|'sawmill',make:(parts:HabitableHouseVoxel[])=>THREE.Mesh,faction:Faction):THREE.Group{
  const group=new THREE.Group(),parts:HabitableHouseVoxel[]=[],trim=faction==='forgers'?0xb6874c:faction==='custodians'?0xb4b99b:0x729a9b;
  const add=(list:HabitableHouseVoxel[],x:number,y:number,z:number,w:number,h:number,d:number,color:number)=>list.push({x,y,z,w,h,d,color});
  const billet=(name:string,length:number,width:number)=>{const logs:HabitableHouseVoxel[]=[];add(logs,0,.12,0,width,.24,length,0x735133);for(const z of[-length/2-.004,length/2+.004]){add(logs,0,.12,z,width*.88,.205,.015,0xc6a572);add(logs,0,.12,z+(z>0?.01:-.01),width*.48,.1,.012,0xa27b4b);}const mesh=make(logs);mesh.name=name;mesh.visible=false;return mesh;};
  if(kind==='woodlot'){
    add(parts,.93,.42,-.36,.12,.84,.13,0x89643c);add(parts,.93,.65,-.36,.22,.065,.21,0xb49964);
    for(const x of[-.92,.92]){add(parts,x,.36,-.66,.09,.72,.09,0x82613c);add(parts,x,.74,-.66,.13,.065,.13,0xb08e5a);}
    for(const x of[-.77,.77])add(parts,x,.16,.52,.07,.32,.45,0x797d69);add(parts,.75,.37,.56,.37,.055,.44,0x8d7049);
    add(parts,-.77,.3,.57,.13,.6,.14,trim);add(parts,-.77,.63,.57,.28,.09,.23,0xc8b685);
    const work=make([{x:0,y:.14,z:0,w:.7,h:.28,d:.62,color:0x6c5035},{x:0,y:.295,z:0,w:.63,h:.035,d:.57,color:0xc9ae7b},{x:0,y:.316,z:0,w:.37,h:.015,d:.32,color:0xa68a59},{x:0,y:.79,z:0,w:.31,h:.89,d:.3,color:0x795537},{x:0,y:1.245,z:0,w:.28,h:.025,d:.26,color:0xc9aa72},{x:.035,y:.82,z:.157,w:.05,h:.35,d:.018,color:0xa48a5d}]);work.name='habitable-industry-input';work.visible=false;group.add(work);
    const output=new THREE.Group();output.name='habitable-industry-output';for(let i=0;i<3;i++){const log=billet(`habitable-forestry-log-${i}`,.85,.23);log.position.set((i%2-.5)*.3,.15+Math.floor(i/2)*.24,.45);log.visible=true;output.add(log);}output.visible=false;group.add(output);
  }else{
    // Open timber shed, stone shoes, tiled roof and diagonal-looking voxel braces retain the village's material language.
    for(const x of[-1.3,1.3])for(const z of[-1.04,.97]){add(parts,x,.13,z,.25,.26,.25,0x858a7d);add(parts,x,1.02,z,.14,1.8,.14,0x765334);for(let i=0;i<4;i++)add(parts,x+(x>0?-.04:.04)*i,1.67+i*.07,z,.13,.12,.13,0xa2804d);}
    for(const z of[-1.04,.97])add(parts,0,1.91,z,2.85,.17,.17,0x8b643b);
    for(const side of[-1,1])for(let row=0;row<6;row++)for(let col=0;col<13;col++)add(parts,-1.39+col*.23,2.53-row*.105,side*(.12+row*.218)-.035,.223,.13,.24,[0xa16b3b,0xb27d49,0x946035][(row+col)%3]);
    for(let col=0;col<13;col++)add(parts,-1.39+col*.23,2.62,-.035,.225,.1,.24,0xba8750);
    add(parts,0,.84,.15,1.55,.17,2.05,0x8b704c);for(const x of[-.65,.65])for(const z of[-.65,.96])add(parts,x,.43,z,.13,.86,.13,0x695137);
    for(const x of[-.7,.7])add(parts,x,.96,.2,.055,.07,2.1,0x697970);
    const controls:HabitableHouseVoxel[]=[];for(const z of[-1.3,1.3])for(const x of[-.65,.65]){add(controls,x,.4,z,.055,.8,.055,0x6f7f74);add(controls,x,.74,z,.8,.065,.06,0xbb9e68);}for(const x of[-1.5,1.5])for(const z of[-.6,.6]){add(controls,x,.4,z,.055,.8,.055,0x6f7f74);add(controls,x,.74,z,.06,.065,.8,0xbb9e68);}const levers=make(controls);levers.name='habitable-sawmill-feed-controls';group.add(levers);
    add(parts,1.08,.65,.12,.23,.28,.28,0x718074);add(parts,1.08,.64,.52,.06,.06,.76,0x746d54);add(parts,-1.08,.34,-.52,.26,.68,.13,trim);
    // A faceted steel disk with independently articulated teeth, rather than a painted saw symbol.
    const bladeParts:HabitableHouseVoxel[]=[];for(let y=-.3;y<=.301;y+=.06)for(let z=-.3;z<=.301;z+=.06)if(y*y+z*z<.095)add(bladeParts,0,y,z,.035,.059,.059,Math.abs(y)<.08&&Math.abs(z)<.08?0xc7c9b4:0x87978b);
    for(let i=0;i<16;i++){const angle=i*Math.PI/8;add(bladeParts,0,Math.sin(angle)*.34,Math.cos(angle)*.34,.045,.066,.066,i%2?0xb8c2b4:0x9eaca0);}const blade=make(bladeParts);blade.name='habitable-sawmill-blade';blade.position.set(0,1.07,-.035);group.add(blade);
    for(const z of[-.62,.73]){const rollerParts:HabitableHouseVoxel[]=[];for(let i=0;i<10;i++){const angle=i*Math.PI/5;add(rollerParts,0,Math.sin(angle)*.085,Math.cos(angle)*.085,.99,.06,.06,i%2?0x77877b:0x9a9d83);}add(rollerParts,0,0,0,1.11,.045,.045,0x535f55);const roller=make(rollerParts);roller.name=`habitable-sawmill-roller-${z<0?0:1}`;roller.position.set(0,.94,z);group.add(roller);}
    const input=billet('habitable-industry-input',1.05,.34);input.position.set(0,.92,.7);group.add(input);
    const output=make(Array.from({length:3},(_,i)=>({x:0,y:.04+i*.075,z:0,w:.61,h:.06,d:.94,color:i%2?0xd0af76:0xb5915a})));output.name='habitable-industry-output';output.position.set(-1.03,.12,.08);output.visible=false;group.add(output);
    const cut=make([{x:0,y:.045,z:0,w:.28,h:.08,d:.66,color:0xc9ab77}]);cut.name='habitable-sawmill-cutting-board';cut.position.set(.2,1.015,-.7);cut.visible=false;group.add(cut);
  }
  const structure=make(parts);structure.name='habitable-industry-structure';group.add(structure);return group;
}
