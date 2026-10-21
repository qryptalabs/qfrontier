import {readFileSync,mkdirSync,writeFileSync,statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=process.cwd(),sources=path.join(root,'work/audio-stage1/sources'),output=path.join(root,'public/audio/v1');
const ffmpeg=path.join(root,'work/promo-20261018/tools/imageio-ffmpeg/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe');
mkdirSync(output,{recursive:true});
const files=[];
function encode(name,source,filter,extra=[]){
  const target=path.join(output,name+'.mp3'),result=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-i',source,...extra,'-af',filter,'-ar','32000','-ac',name==='exploration'?'2':'1','-c:a','libmp3lame','-b:a',name==='exploration'?'96k':'64k',target],{encoding:'utf8',windowsHide:true});
  if(result.status!==0)throw Error(result.stderr);
  const bytes=readFileSync(target);files.push({file:name+'.mp3',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
const impact=name=>path.join(sources,'impact/Audio',name+'.ogg'),rpg=name=>path.join(sources,'rpg/Audio',name+'.ogg');
for(const [surface,material] of [['grass','grass'],['stone','concrete'],['wood','wood'],['snow','snow'],['carpet','carpet']])for(let i=0;i<3;i++)encode(`step-${surface}-${i}`,impact(`footstep_${material}_00${i}`),'loudnorm=I=-24:TP=-5:LRA=7,afade=t=in:d=0.004');
for(const [name,file,isImpact,filter]of[
  ['axe','chop',false,''],['hammer','impactWood_medium_000',true,''],['harvest','cloth1',false,''],['crate','impactPlank_medium_001',true,''],['creak','creak1',false,''],['coins','handleCoins',false,''],['hoof','footstep_wood_002',true,'asetrate=44100*0.72,aresample=32000,'],
])encode(name,isImpact?impact(file):rpg(file),filter+'loudnorm=I=-24:TP=-5:LRA=7,afade=t=in:d=0.004');
encode('splash',path.join(sources,'waves.flac'),'highpass=f=140,loudnorm=I=-25:TP=-6:LRA=7,afade=t=in:d=0.08,afade=t=out:st=1.2:d=0.3',['-t','1.5']);
encode('water',path.join(sources,'waves.flac'),'highpass=f=90,lowpass=f=6000,loudnorm=I=-25:TP=-6:LRA=7,afade=t=in:d=0.12,afade=t=out:st=4.5:d=0.5',['-t','5']);
encode('forest',path.join(sources,'forest.mp3'),'loudnorm=I=-28:TP=-7:LRA=7,afade=t=in:d=0.1,afade=t=out:st=19.6:d=0.4',['-t','20']);
encode('exploration',path.join(sources,'exploration.mp3'),'loudnorm=I=-20:TP=-3:LRA=9');
const saw=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','anoisesrc=d=2.4:c=pink:r=32000:a=0.25','-af','highpass=f=420,lowpass=f=4200,tremolo=f=2.6:d=0.85,afade=t=in:d=0.02,afade=t=out:st=2.35:d=0.05','-ac','1','-c:a','libmp3lame','-b:a','64k',path.join(output,'saw.mp3')],{encoding:'utf8',windowsHide:true});if(saw.status!==0)throw Error(saw.stderr);
const bytes=readFileSync(path.join(output,'saw.mp3'));files.push({file:'saw.mp3',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
const credits=`QFrontier — Sound stage 1\n\nLicensed CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/\n\nKenney, Impact Sounds (1.0), https://kenney.nl/assets/impact-sounds\n  Footsteps on grass, concrete (stone), wood, carpet, snow; wood/plank impacts.\nKenney, RPG Audio, https://kenney.nl/assets/rpg-audio\n  Chop, cloth, creak, coins.\nRandomMind, Medieval: Exploration, https://opengameart.org/content/medieval-exploration\n  Music, supplied as Exploration_0.mp3.\nTinyWorlds, Forest Ambience, https://opengameart.org/content/forest-ambience\n  20-second edited excerpt.\njasinski (submitted by qubodup), Beach Ocean Waves, https://opengameart.org/content/beach-ocean-waves\n  wave_01_cc0-18363__jasinski__alkaibeach.flac; edited waves and splash.\n\nAll downloaded sources verified as CC0 on 2026-10-19.\nEdits by QFrontier: normalization, compression, cuts, fades, mono downmix and hoof foley pitch adaptation.\nOriginal QFrontier: saw friction synthesis, filtered wind, UI/level-up musical cues and procedural room impulse.\nNo game assets or recordings are fetched from third parties during play.\n`;
writeFileSync(path.join(output,'credits.txt'),credits);
writeFileSync(path.join(output,'manifest.json'),JSON.stringify({version:1,createdAt:new Date().toISOString(),files,totalBytes:files.reduce((n,f)=>n+f.bytes,0)},null,2));
console.log(JSON.stringify({files:files.length,totalBytes:files.reduce((n,f)=>n+f.bytes,0),musicBytes:statSync(path.join(output,'exploration.mp3')).size}));
