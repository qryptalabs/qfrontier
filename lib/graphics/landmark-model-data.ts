/** Exact existing voxel parts, shared by the scenery models and their collision footprints. */
export interface LandmarkModelBox {id:string;color:number|string;x:number;y:number;z:number;width:number;height:number;depth:number;solid:boolean}
const cave:LandmarkModelBox[]=[];
const box=(id:string,color:number,x:number,y:number,z:number,width:number,height:number,depth:number,solid=true)=>cave.push({id,color,x,y,z,width,height,depth,solid});
for(const x of[-2.3,2.3])for(let tier=0;tier<4;tier++)box(`pillar:${x}:${tier}`,tier%2?0x6c7169:0x989282,x+(tier%2)*.12,.5+tier*.8,0,1.3,1,2.5);
for(let i=0;i<4;i++)box(`lintel:${i}`,i%2?0x777b70:0x989282,-1.6+i*1.05,3.5+Math.sin(i)*.2,0,1.3,1,2.8,false);
box('back',0x182923,0,1.65,-.9,4,3.2,.25);
for(const x of[-1.6,1.6]){box(`support:${x}`,0x40372a,x,1.55,1.4,.35,3,.35);box(`trim:${x}`,0x865a35,x,1.55,1.6,.12,2.8,.12);}
box('beam',0x865a35,0,2.85,1.4,3.8,.35,.4,false);
for(const x of[-.6,.6])box(`rail:${x}`,0x40372a,x,.12,2.6,.1,.1,3.4,false);
for(let i=0;i<5;i++)box(`sleeper:${i}`,0xb58a54,0,.1,1.2+i*.6,1.7,.12,.15,false);
box('torch-post',0x865a35,-3,.85,1,.2,1.7,.2);box('torch-light',0xf0b862,-3,1.75,1,.27,.3,.25,false);
export const CAVE_MODEL_BOXES:readonly LandmarkModelBox[]=Object.freeze(cave.map(p=>Object.freeze(p)));

export function stoneRockModelBoxes(seed=0):readonly LandmarkModelBox[]{let state=((seed%5)^0x9e3779b9)>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;},parts:LandmarkModelBox[]=[];
 const add=(id:string,color:string,x:number,y:number,z:number,width:number,height:number,depth:number)=>parts.push({id,color,x,y,z,width,height,depth,solid:true});
 add('base','stoneDark',0,.12,0,.79,.24,.66);add('body','stone',-.04,.31,-.03,.65,.28,.53);add('cap','stoneLight',-.13,.48,-.08,.4,.1,.33);add('side','stone',.37,.14,.16,.3,.27,.28);
 for(let i=0;i<5;i++){const x=random()*.52-.26,z=random()*.42-.21;add(`chip:${i}`,'stoneLight',x,.16,z+.35,.13,.17,.13);}return parts;
}
