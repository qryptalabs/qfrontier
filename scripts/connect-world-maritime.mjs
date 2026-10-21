import fs from 'node:fs';
const path='lib/graphics/world-terrain-renderer.ts';let s=fs.readFileSync(path,'utf8');
const anchor='  const scene=new THREE.Scene(),renderer=new THREE.WebGLRenderer';
if(!s.includes(anchor))throw Error('Missing world renderer anchor');
s=s.replace(anchor,`  let harborRead:AbortController|null=null,harborNextRead=0;
  function syncRoyalHarbor(now:number){
    if(!royalLayer?.group.visible||!input.player?.id||harborRead||now<harborNextRead||document.hidden)return;
    const request=new AbortController(),playerId=input.player.id;harborRead=request;harborNextRead=now+15000;
    void fetch('/api/royal-harbor?playerId='+encodeURIComponent(playerId),{signal:request.signal,cache:'no-store'}).then(async response=>{
      if(!response.ok)throw Error('Harbor unavailable');const data=await response.json();if(disposed||input.player?.id!==playerId||!data.harbor)return;
      royalLayer?.setCommerce(data.harbor);harborNextRead=performance.now()+Math.max(2000,Math.min(15000,data.harbor.cycle.nextTransitionAt-data.harbor.now+100));dirty=true;
    }).catch(()=>{}).finally(()=>{if(harborRead===request)harborRead=null;});
  }
`+anchor);
s=s.replace('royalLayer.setOrigin(origin);royalLayer.animate(visualSeconds(),input.reducedMotion);','syncRoyalHarbor(now);royalLayer.setOrigin(origin);royalLayer.animate(visualSeconds(),input.reducedMotion);');
const dispose='disposed=true;';const i=s.indexOf(dispose,s.indexOf('const controller:'));if(i<0)throw Error('Missing dispose');s=s.slice(0,i)+s.slice(i).replace(dispose,'disposed=true;harborRead?.abort();');
fs.writeFileSync(path,s);console.log('World maritime projection connected only while visible.');
