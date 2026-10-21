import type {HabitablePoint} from './habitable-data.ts';

/** Weighted, bounded local A*. A road changes route preference, never speed,
 * water permission, collision or the price/time of an economic journey. */
export function preferredLandPath(from:HabitablePoint,to:HabitablePoint,line:(a:HabitablePoint,b:HabitablePoint)=>boolean,road:(p:HabitablePoint)=>boolean):HabitablePoint[]|null {
  const step=.5,key=(x:number,y:number)=>`${x}:${y}`,world=(x:number,y:number)=>({x:x*step,y:y*step}),weight=(p:HabitablePoint)=>road(p)?1:1.35;
  type Node={x:number;y:number;cost:number;score:number};const heap:Node[]=[],costs=new Map<string,number>(),parents=new Map<string,string|null>(),points=new Map<string,HabitablePoint>();
  const push=(n:Node)=>{heap.push(n);let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(heap[p].score<=n.score)break;heap[i]=heap[p];i=p;}heap[i]=n;};
  const pop=()=>{const root=heap[0],last=heap.pop()!;if(heap.length){heap[0]=last;let i=0;for(;;){const left=i*2+1,right=left+1;if(left>=heap.length)break;const child=right<heap.length&&heap[right].score<heap[left].score?right:left;if(heap[i].score<=heap[child].score)break;[heap[i],heap[child]]=[heap[child],heap[i]];i=child;}}return root;};
  const heuristic=(p:HabitablePoint)=>Math.hypot(p.x-to.x,p.y-to.y);
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const x=Math.round(from.x/step)+dx,y=Math.round(from.y/step)+dy,p=world(x,y);if(!line(from,p))continue;const id=key(x,y),cost=Math.hypot(p.x-from.x,p.y-from.y)*weight(p);costs.set(id,cost);parents.set(id,null);points.set(id,p);push({x,y,cost,score:cost+heuristic(p)});}
  let end:string|undefined,visited=0;
  while(heap.length&&visited++<6000){const n=pop(),id=key(n.x,n.y);if(n.cost!==costs.get(id))continue;const p=world(n.x,n.y);if(Math.hypot(p.x-to.x,p.y-to.y)<=.76&&line(p,to)){end=id;break;}
    for(const[dx,dy]of[[1,0],[0,1],[-1,0],[0,-1]]){const x=n.x+dx,y=n.y+dy,next=world(x,y),nextId=key(x,y),cost=n.cost+step*(weight(p)+weight(next))/2;if(cost>=(costs.get(nextId)??Infinity)||!line(p,next))continue;costs.set(nextId,cost);parents.set(nextId,id);points.set(nextId,next);push({x,y,cost,score:cost+heuristic(next)});}
  }
  if(!end)return null;const route:HabitablePoint[]=[{...to}];for(let id:string|null=end;id!==null;id=parents.get(id)!){route.push(points.get(id)!);}route.push({...from});route.reverse();
  const weighted=(a:HabitablePoint,b:HabitablePoint)=>{const count=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/.2)),length=Math.hypot(b.x-a.x,b.y-a.y)/count;let cost=0;for(let i=0;i<count;i++)cost+=length*weight({x:a.x+(b.x-a.x)*(i+.5)/count,y:a.y+(b.y-a.y)*(i+.5)/count});return cost;};
  const prefix=[0];for(let i=1;i<route.length;i++)prefix.push(prefix[i-1]+weighted(route[i-1],route[i]));
  const smooth:HabitablePoint[]=[route[0]];for(let i=0;i<route.length-1;){let next=i+1;while(next+1<route.length&&line(route[i],route[next+1])&&weighted(route[i],route[next+1])<=prefix[next+1]-prefix[i]+.001)next++;smooth.push(route[next]);i=next;}return smooth;
}
