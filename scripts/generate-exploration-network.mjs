/** Offline transport compilation. Never imported by the game or run on live saves. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import {sampleWorld,WORLD_SETTLEMENTS} from '../lib/graphics/world-geography.ts';
import {continuousTerrainHeight} from '../lib/graphics/world-terrain-height.ts';
import {FISHING_NETWORK_PLACES} from '../lib/graphics/fishing-network-data.ts';
const OUT='lib/mvp/exploration-network.generated.json',CACHE='work/exploration-network-macro.json';
const STEP=64,MINX=-435,MAXX=645,MINY=-232,MAXY=304,W=MAXX-MINX+1,H=MAXY-MINY+1,N=W*H;
const point=id=>({x:(id%W+MINX)*STEP,y:(Math.floor(id/W)+MINY)*STEP});
const idAt=(i,j)=>i<MINX||i>MAXX||j<MINY||j>MAXY?-1:(j-MINY)*W+i-MINX;
const around=id=>{const i=id%W+MINX,j=Math.floor(id/W)+MINY;return[[i-1,j],[i+1,j],[i,j-1],[i,j+1]].map(([i,j])=>idAt(i,j)).filter(v=>v>=0);};
class Heap{a=[];push(v){let i=this.a.length;this.a.push(v);while(i){const p=(i-1)>>1;if(this.a[p].d<=v.d)break;this.a[i]=this.a[p];i=p;}this.a[i]=v;}pop(){const first=this.a[0],last=this.a.pop();if(this.a.length){let i=0;while(i*2+1<this.a.length){let c=i*2+1;if(c+1<this.a.length&&this.a[c+1].d<this.a[c].d)c++;if(this.a[c].d>=last.d)break;this.a[i]=this.a[c];i=c;}this.a[i]=last;}return first;}get length(){return this.a.length;}}
const started=Date.now(),sourceSha256=crypto.createHash('sha256').update(fs.readFileSync('lib/graphics/world-geography.ts')).update(fs.readFileSync('lib/graphics/planet-data.ts')).digest('hex');
const catalogue=[...new Map([...WORLD_SETTLEMENTS,...FISHING_NETWORK_PLACES].map(p=>[p.id,p])).values()];
const sea=new Uint8Array(N),height=new Float32Array(N),edges=new Map(),gradeCost=new Map();
for(let id=0;id<N;id++){const p=point(id),s=sampleWorld(p.x,p.y);sea[id]=s.water&&!s.river?1:0;height[id]=s.height;}
const water=(p)=>{const s=sampleWorld(p.x,p.y);return s.water&&!s.river;};
function edge(a,b,mode){const key=`${Math.min(a,b)}:${Math.max(a,b)}:${mode}`,old=edges.get(key);if(old!==undefined)return old;const pa=point(a),pb=point(b),steps=mode==='boat'?4:32;let valid=true,previous=null,steep=0;for(let i=0;i<=steps&&valid;i++){const p={x:pa.x+(pb.x-pa.x)*i/steps,y:pa.y+(pb.y-pa.y)*i/steps},s=sampleWorld(p.x,p.y);if((s.water&&!s.river)!==(mode==='boat'))valid=false;if(mode!=='boat'){const h=Math.round(s.height*2)/2;if(!s.river&&previous!==null&&Math.abs(h-previous)>.51)steep+=Math.abs(h-previous);previous=s.river?null:h;}}edges.set(key,valid);if(mode!=='boat')gradeCost.set(`${Math.min(a,b)}:${Math.max(a,b)}`,steep*40);return valid;}
// Mark the largest actual open-ocean component; isolated lakes do not become ferry links.
const ocean=new Uint8Array(N),seen=new Uint8Array(N);let largest=[];
for(let start=0;start<N;start++)if(sea[start]&&!seen[start]){const component=[start];seen[start]=1;for(let qi=0;qi<component.length;qi++)for(const b of around(component[qi]))if(sea[b]&&!seen[b]&&edge(component[qi],b,'boat')){seen[b]=1;component.push(b);}if(component.length>largest.length)largest=component;}
for(const id of largest)ocean[id]=1;
console.log(JSON.stringify({phase:'ocean',cells:N,mainOcean:largest.length,elapsedMs:Date.now()-started}));
// Land routes point toward a verified coast cell and main-ocean neighbor.
const shores=new Map();
function shoreAt(aid,bid){const key=`${aid}:${bid}`;if(shores.has(key))return shores.get(key);const a=point(aid),b=point(bid);let lo=0,hi=1;for(let n=0;n<20;n++){const t=(lo+hi)/2,p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};if(water(p))hi=t;else lo=t;}const dx=(b.x-a.x)/STEP,dy=(b.y-a.y)/STEP,shore={x:a.x+(b.x-a.x)*lo,y:a.y+(b.y-a.y)*lo},land={x:shore.x-dx*4,y:shore.y-dy*4},end={x:shore.x+dx*8,y:shore.y+dy*8},ground=continuousTerrainHeight(Math.floor(land.x/2)*2+1,Math.floor(land.y/2)*2+1),result={land,end,height:Math.max(.65,ground)};shores.set(key,result);return result;}
const dist=new Float64Array(N).fill(Infinity),parent=new Int32Array(N).fill(-1),coastWater=new Int32Array(N).fill(-1),heap=new Heap();
for(let a=0;a<N;a++)if(!sea[a])for(const b of around(a))if(ocean[b]&&shoreAt(a,b).height<=1.5){dist[a]=0;coastWater[a]=b;heap.push({id:a,d:0});break;}
while(heap.length){const a=heap.pop();if(a.d!==dist[a.id])continue;for(const b of around(a.id))if(!sea[b]&&edge(a.id,b,'carriage')){const d=a.d+STEP+Math.abs(height[a.id]-height[b])*6+(gradeCost.get(`${Math.min(a.id,b)}:${Math.max(a.id,b)}`)??0);if(d<dist[b]){dist[b]=d;parent[b]=a.id;heap.push({id:b,d});}}}
console.log(JSON.stringify({phase:'coasts',elapsedMs:Date.now()-started}));
const network={version:1,validated:false,sourceSha256,landings:[],bridges:[],nodes:[],edges:[],destinations:[],checks:{phase:'macro',gridStep:STEP}};
const ports=new Map(),portSeeds=new Map();
const length=points=>points.slice(1).reduce((s,p,i)=>s+Math.hypot(p.x-points[i].x,p.y-points[i].y),0);
const simplify=points=>points.filter((p,i)=>!i||i===points.length-1||Math.abs((p.x-points[i-1].x)*(points[i+1].y-p.y)-(p.y-points[i-1].y)*(points[i+1].x-p.x))>1e-7);
function addEdge(id,from,to,mode,points,extra={}){const route=simplify(points),distance=length(route);network.edges.push({id,from,to,mode,points:route,distance,seconds:distance/(mode==='boat'?12:mode==='carriage'?8:3.5),...extra});}
for(const place of catalogue){let seed=-1,best=Infinity;const i=Math.round(place.x/STEP),j=Math.round(place.y/STEP);for(let r=0;r<=3;r++)for(let dx=-r;dx<=r;dx++)for(let dy=-r;dy<=r;dy++){const id=idAt(i+dx,j+dy);if(id<0||!Number.isFinite(dist[id]))continue;const p=point(id),score=Math.hypot(place.x-p.x,place.y-p.y)+dist[id]*.002;if(score<best){best=score;seed=id;}}if(seed<0){console.log(JSON.stringify({blocked:place.id,near:Array.from({length:21},(_,dx)=>{const id=idAt(i+dx-10,j);return{id,sea:sea[id],distance:dist[id],height:height[id]};})}));throw Error(`No coast from ${place.id}`);}
 const chain=[seed];while(parent[chain.at(-1)]>=0)chain.push(parent[chain.at(-1)]);const coast=chain.at(-1),seaId=coastWater[coast],portKey=`${coast}:${seaId}`;let port=ports.get(portKey);
 if(!port){const {land,end,height:deckHeight}=shoreAt(coast,seaId),sample=sampleWorld(land.x,land.y);port={id:`landing-${ports.size+1}`,name:`Embarcadero ${place.name}`,land,water:end,width:3,deckHeight,biome:sample.biome,destinationIds:[]};ports.set(portKey,port);portSeeds.set(port.id,seaId);network.landings.push(port);network.nodes.push({id:port.id,kind:'landing',position:end,landingId:port.id});}
 port.destinationIds.push(place.id);network.nodes.push({id:place.id,kind:'destination',destinationId:place.id,position:{x:place.x,y:place.y}});network.destinations.push({id:place.id,nodeId:place.id});addEdge(`road-${place.id}`,place.id,port.id,'carriage',[{x:place.x,y:place.y},...chain.map(point),port.land,port.water]);
}
console.log(JSON.stringify({phase:'land-corridors',ports:network.landings.length,elapsedMs:Date.now()-started}));
// Ocean Voronoi wavefront constructs a sparse connected candidate graph in one pass.
const vd=new Float64Array(N).fill(Infinity),owner=new Int32Array(N).fill(-1),vp=new Int32Array(N).fill(-1),vheap=new Heap(),portsList=network.landings,candidates=new Map();
const offer=(a,b,ia,ib,d)=>{if(a===b||a<0||b<0)return;const key=`${Math.min(a,b)}:${Math.max(a,b)}`,old=candidates.get(key);if(!old||old.d>d)candidates.set(key,{a,b,ia,ib,d});};
for(let p=0;p<portsList.length;p++){const id=portSeeds.get(portsList[p].id);if(owner[id]>=0)offer(owner[id],p,id,id,0);else{vd[id]=0;owner[id]=p;vheap.push({id,d:0});}}
while(vheap.length){const a=vheap.pop();if(a.d!==vd[a.id])continue;for(const b of around(a.id))if(ocean[b]&&edge(a.id,b,'boat')){if(owner[b]>=0&&owner[b]!==owner[a.id])offer(owner[a.id],owner[b],a.id,b,a.d+vd[b]+STEP);const d=a.d+STEP;if(d<vd[b]){vd[b]=d;owner[b]=owner[a.id];vp[b]=a.id;vheap.push({id:b,d});}}}
const group=portsList.map((_,i)=>i),find=i=>group[i]===i?i:group[i]=find(group[i]);let joined=0;
for(const c of [...candidates.values()].sort((a,b)=>a.d-b.d)){const ga=find(c.a),gb=find(c.b);if(ga===gb)continue;group[ga]=gb;joined++;const left=[c.ia],right=[c.ib];while(vp[left.at(-1)]>=0)left.push(vp[left.at(-1)]);while(vp[right.at(-1)]>=0)right.push(vp[right.at(-1)]);const a=portsList[c.a],b=portsList[c.b];addEdge(`ferry-${a.id}-${b.id}`,a.id,b.id,'boat',[a.water,...left.reverse().map(point),...right.map(point),b.water],{fromPortId:a.id,toPortId:b.id});}
if(joined!==portsList.length-1)throw Error(`Disconnected ports: ${joined}/${portsList.length-1}`);
network.checks={phase:'macro',gridStep:STEP,oceanCells:largest.length,destinations:catalogue.length,connectedPorts:portsList.length,macroMs:Date.now()-started};fs.mkdirSync('work',{recursive:true});fs.writeFileSync(CACHE,JSON.stringify(network));fs.writeFileSync(OUT,JSON.stringify(network));console.log(JSON.stringify({phase:'macro-complete',edges:network.edges.length,bytes:fs.statSync(OUT).size,elapsedMs:Date.now()-started}));
