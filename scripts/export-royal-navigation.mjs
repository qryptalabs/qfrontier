import {readFile,writeFile} from 'node:fs/promises';
import {createRoyalWorldLayer} from '../lib/graphics/royal-world-layer.ts';
import {ROYAL_WORLD_BASE_Y} from '../lib/graphics/royal-world-surface.ts';
const path=new URL('../lib/graphics/royal-navigation.generated.json',import.meta.url),previous=JSON.parse(await readFile(path,'utf8'));
const layer=createRoyalWorldLayer(ROYAL_WORLD_BASE_Y);
try{
 const palace=await layer.loadPalace();if(!palace)throw Error('Palace not available');
 const obstacles=[...layer.obstacles,...palace.interior.obstacles,...palace.citadelLife.colliders().map(o=>({x:o.x,z:o.z,halfWidth:o.radius,halfDepth:o.radius,minY:o.y,maxY:o.y+o.height,allowEgress:true}))];
 await writeFile(path,JSON.stringify({...previous,obstacles}));console.log(JSON.stringify({exported:true,obstacles:obstacles.length}));
}finally{layer.dispose();}
