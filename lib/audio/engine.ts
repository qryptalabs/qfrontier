import {AUDIO_STORAGE_KEY,DEFAULT_AUDIO,advanceFootstep,audibleEmitters,audioSettings,spatialMix,type AudioChannel,type AudioSettings,type SoundFrame,type SoundKind} from './model.ts';

type Voice={source:AudioBufferSourceNode;gain:GainNode;pan:StereoPannerNode;loop:boolean;scene:number;key:string};
type Scene={frame:SoundFrame|null;active:boolean;at:number;priority:number};
export type AudioSnapshot={settings:AudioSettings;ready:boolean;status:string;scene:string;voices:number};
const SERVER:AudioSnapshot={settings:{...DEFAULT_AUDIO},ready:false,status:'Activa el sonido para escuchar el mundo.',scene:'Frontera',voices:0};
const SFX:Record<SoundKind,{file:string;interval:number;loop?:boolean}>={axe:{file:'axe',interval:1.05},hammer:{file:'hammer',interval:.8},harvest:{file:'harvest',interval:1.6},crate:{file:'crate',interval:1.3},saw:{file:'saw',interval:0,loop:true},creak:{file:'creak',interval:2.6},hooves:{file:'hoof',interval:.43},splash:{file:'splash',interval:2.1},'worker-step':{file:'step-grass-0',interval:.55},'dock-step':{file:'step-wood-1',interval:.55}};

/** One lazily unlocked mixer for every canvas. Never contacts a game API. */
export class FrontierAudio {
  private context:AudioContext|null=null;
  private master:GainNode|null=null;
  private buses:Partial<Record<AudioChannel,GainNode>>={};
  private world:AudioNode|null=null;
  private filter:BiquadFilterNode|null=null;
  private wet:GainNode|null=null;
  private buffers=new Map<string,AudioBuffer>();
  private requests=new Map<string,Promise<AudioBuffer|null>>();
  private failed=new Set<string>();
  private voices=new Set<Voice>();
  private cadence=new Map<string,number>();
  private scenes=new Map<number,Scene>();
  private nextScene=0;
  private currentScene=0;
  private foot:ReturnType<typeof advanceFootstep>['state']=null;
  private music:HTMLAudioElement|null=null;
  private musicGain:GainNode|null=null;
  private musicNode:MediaElementAudioSourceNode|null=null;
  private listeners=new Set<()=>void>();
  private snapshot:AudioSnapshot=SERVER;
  private timer:ReturnType<typeof setInterval>|null=null;
  private started=false;
  private mounted=0;
  private cleanup:(()=>void)|null=null;
  private channel:BroadcastChannel|null=null;
  private ownsAudio=true;
  private lastUi=0;
  private eventIds=new Set<string>();
  private generation=0;
  private decodedBytes=0;
  private variant=0;
  private coarse=false;
  subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};};
  getSnapshot=()=>this.snapshot;
  getServerSnapshot=()=>SERVER;
  private publish(update:Partial<AudioSnapshot>){this.snapshot={...this.snapshot,...update};for(const fn of this.listeners)fn();}
  mount(){
    this.mounted++;
    if(this.mounted===1){
      try{this.publish({settings:audioSettings(JSON.parse(localStorage.getItem(AUDIO_STORAGE_KEY)??'null'))});}catch{/* Browser privacy mode retains defaults in memory. */}
      const focus=()=>{if(this.started){this.ownsAudio=true;this.channel?.postMessage('claim');this.synchronize();}};
      const visibility=()=>{this.foot=null;this.synchronize();};
      const storage=(event:StorageEvent)=>{if(event.key===AUDIO_STORAGE_KEY){try{this.publish({settings:audioSettings(JSON.parse(event.newValue??'null'))});this.synchronize();}catch{/* Ignore malformed preferences. */}}};
      const click=(event:MouseEvent)=>{const el=event.target instanceof Element?event.target.closest('button,a,summary'):null;if(el&&!el.hasAttribute('disabled')&&!el.closest('[data-audio-controls]'))this.cue('click');};
      if(typeof BroadcastChannel!=='undefined'){this.channel=new BroadcastChannel('qfrontier-audio-owner-v1');this.channel.onmessage=e=>{if(e.data==='claim'){this.ownsAudio=false;this.synchronize();}};}
      window.addEventListener('focus',focus);window.addEventListener('storage',storage);document.addEventListener('visibilitychange',visibility);document.addEventListener('click',click);
      this.cleanup=()=>{window.removeEventListener('focus',focus);window.removeEventListener('storage',storage);document.removeEventListener('visibilitychange',visibility);document.removeEventListener('click',click);this.channel?.close();this.channel=null;};
      this.timer=setInterval(()=>this.tick(),100);
      if(this.started)this.synchronize();
    }
    return()=>{if(--this.mounted===0){this.cleanup?.();this.cleanup=null;if(this.timer)clearInterval(this.timer);this.timer=null;this.hush();void this.context?.suspend();}};
  }
  settings(patch:Partial<AudioSettings>){
    const next=audioSettings({...this.snapshot.settings,...patch});this.publish({settings:next});
    try{localStorage.setItem(AUDIO_STORAGE_KEY,JSON.stringify(next));}catch{/* Settings remain usable without storage. */}
    this.synchronize();
  }
  async activate(){
    try{
      this.failed.clear();this.coarse=window.matchMedia('(pointer: coarse)').matches;
      if(!this.context){
        const Constructor=window.AudioContext??(window as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
        if(!Constructor)throw Error('Este navegador no admite audio del juego.');
        const context=this.context=new Constructor({latencyHint:'interactive'});
        this.master=context.createGain();this.master.gain.value=0;
        const limiter=context.createDynamicsCompressor();limiter.threshold.value=-12;limiter.knee.value=12;limiter.ratio.value=6;limiter.attack.value=.003;limiter.release.value=.2;this.master.connect(limiter).connect(context.destination);
        for(const name of ['music','ambience','effects','interface'] as const){const bus=context.createGain();bus.connect(this.master);this.buses[name]=bus;}
        this.filter=context.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=18000;this.filter.connect(this.buses.effects!);this.world=this.filter;
        const reverb=context.createConvolver(),impulse=context.createBuffer(2,Math.floor(context.sampleRate*1.1),context.sampleRate);
        let seed=17;for(let ch=0;ch<2;ch++){const d=impulse.getChannelData(ch);for(let i=0;i<d.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;d[i]=((seed/4294967296)*2-1)*Math.pow(1-i/d.length,3)*.25;}}
        reverb.buffer=impulse;this.wet=context.createGain();this.wet.gain.value=0;this.filter.connect(reverb).connect(this.wet).connect(this.buses.effects!);
        const wind=context.createBuffer(1,context.sampleRate*8,context.sampleRate),data=wind.getChannelData(0);let last=0;
        for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;last=(last+.018*(seed/4294967296*2-1))/1.018;data[i]=last*2*(.7+.3*Math.sin(i/data.length*Math.PI*2));}this.buffers.set('wind',wind);
      }
      // Resume synchronously from the button gesture, before waiting for assets.
      const resuming=this.context.resume();this.ensureMusic();
      if(this.snapshot.settings.music>0)void this.music?.play().catch(()=>{/* Effects can play if a browser blocks streamed music. */});
      await resuming;this.started=true;this.ownsAudio=true;this.channel?.postMessage('claim');this.settings({enabled:true,master:this.snapshot.settings.master||DEFAULT_AUDIO.master});
      this.publish({ready:true,status:'Sonido activo'});this.synchronize();this.cue('ready');
    }catch(error){this.publish({ready:false,status:error instanceof Error?error.message:'No se pudo activar el sonido. Pulsa de nuevo para reintentar.'});}
  }
  scene(priority=1){
    const id=++this.nextScene;this.scenes.set(id,{frame:null,active:true,at:0,priority});let last=0;
    return {update:(frame:SoundFrame)=>{const scene=this.scenes.get(id),now=performance.now();if(scene&&now-last>=90){last=now;scene.frame=frame;scene.at=now;}},setActive:(active:boolean)=>{const scene=this.scenes.get(id);if(scene)scene.active=active;if(!active&&this.currentScene===id){this.hushWorld();this.foot=null;}},dispose:()=>{this.scenes.delete(id);if(this.currentScene===id){this.hushWorld();this.foot=null;}}};
  }
  private allowed(){return this.started&&this.snapshot.settings.enabled&&this.snapshot.settings.master>0&&!document.hidden&&this.ownsAudio&&this.mounted>0;}
  private synchronize(){
    if(!this.context)return;
    const allowed=this.allowed();this.master?.gain.setTargetAtTime(allowed?this.snapshot.settings.master:0,this.context.currentTime,.05);
    for(const name of ['music','ambience','effects','interface'] as const)this.buses[name]?.gain.setTargetAtTime(this.snapshot.settings[name],this.context.currentTime,.06);
    if(!allowed){this.hush();void this.context.suspend();}
    else {void this.context.resume().catch(()=>{this.publish({ready:false,status:'Pulsa Activar sonido para reanudar el audio.'});});}
  }
  private async buffer(file:string):Promise<AudioBuffer|null>{
    if(this.buffers.has(file))return this.buffers.get(file)!;
    if(!this.context||this.failed.has(file))return null;
    if(this.requests.has(file))return this.requests.get(file)!;
    const context=this.context;
    const pending=(async()=>{try{const response=await fetch('/audio/v1/'+file+'.mp3',{credentials:'same-origin'});if(!response.ok)throw Error('Audio no disponible');const bytes=await response.arrayBuffer();if(bytes.byteLength>2_000_000)throw Error('Audio demasiado grande');const buffer=await context.decodeAudioData(bytes);const size=buffer.length*buffer.numberOfChannels*4;if(this.decodedBytes+size>24_000_000)throw Error('Presupuesto de audio');this.decodedBytes+=size;this.buffers.set(file,buffer);return buffer;}catch{this.failed.add(file);this.publish({status:'Algún sonido no está disponible. Puedes seguir jugando y reactivar el audio para reintentar.'});return null;}finally{this.requests.delete(file);}})();this.requests.set(file,pending);return pending;
  }
  private stop(voice:Voice){if(!this.voices.delete(voice))return;try{voice.source.stop();}catch{/* Already ended. */}voice.source.disconnect();voice.gain.disconnect();voice.pan.disconnect();}
  private hushWorld(){this.generation++;for(const v of [...this.voices])if(v.scene!==0)this.stop(v);this.cadence.clear();}
  private hush(){this.hushWorld();for(const v of [...this.voices])this.stop(v);this.music?.pause();this.foot=null;}
  private play(file:string,volume:number,pan=0,loop=false,scene=0,key='',channel:AudioChannel='effects',rate=1){
    const generation=this.generation,context=this.context,requestedAt=performance.now();
    if(!context||!this.allowed()||this.snapshot.settings[channel]===0||volume<=.005||this.voices.size>=16)return;
    void this.buffer(file).then(buffer=>{
      if(!buffer||!this.allowed()||generation!==this.generation||this.voices.size>=16||scene!==0&&scene!==this.currentScene||loop&&[...this.voices].some(v=>v.key===key&&v.scene===scene))return;
      if(!loop&&performance.now()-requestedAt>500)return;
      if(key.startsWith('source:')&&!this.scenes.get(scene)?.frame?.emitters.some(e=>'source:'+e.id===key))return;
      const source=context.createBufferSource(),gain=context.createGain(),panner=context.createStereoPanner();source.buffer=buffer;source.loop=loop;source.playbackRate.value=rate;gain.gain.value=loop?0:volume;panner.pan.value=pan;source.connect(gain).connect(panner).connect(channel==='effects'?this.world!:this.buses[channel]!);
      const voice:Voice={source,gain,pan:panner,loop,scene,key};this.voices.add(voice);source.onended=()=>this.stop(voice);source.start(0,loop?Math.random()*buffer.duration:0);if(loop)gain.gain.setTargetAtTime(volume,context.currentTime,.3);
    });
  }
  cue(kind:'click'|'ready'|'complete'|'level'|'sale'|'error',id?:string){
    if(id){if(this.eventIds.has(id))return;this.eventIds.add(id);if(this.eventIds.size>256)this.eventIds.delete(this.eventIds.values().next().value!);}
    if(!this.allowed()||!this.context||!this.snapshot.settings.interface)return;
    const now=performance.now();if(now-this.lastUi<(kind==='click'?80:180))return;this.lastUi=now;
    if(kind==='sale'){this.play('coins',.45,0,false,0,'','interface');return;}
    const notes=kind==='level'?[392,493.88,587.33,783.99]:kind==='complete'?[659.25,880]:kind==='error'?[196,174.61]:kind==='click'?[550]:[440,659.25];
    const context=this.context;notes.forEach((frequency,i)=>{const oscillator=context.createOscillator(),gain=context.createGain(),at=context.currentTime+i*.095;oscillator.type='sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(kind==='click'?.045:.12,at+.008);gain.gain.exponentialRampToValueAtTime(.0001,at+(kind==='level'?.7:.22));oscillator.connect(gain).connect(this.buses.interface!);oscillator.start(at);oscillator.stop(at+.8);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};});
    if(kind!=='click'&&this.musicGain){this.musicGain.gain.cancelScheduledValues(context.currentTime);this.musicGain.gain.setTargetAtTime(.3,context.currentTime,.04);this.musicGain.gain.setTargetAtTime(.8,context.currentTime+1,.35);}
  }
  stopDialogue(){for(const voice of [...this.voices])if(voice.key==='shop-dialogue')this.stop(voice);}
  async dialogue(file:'shop-welcome'|'shop-north-welcome'|'shop-thanks'){
    if(!this.allowed())return;this.stopDialogue();const buffer=await this.buffer(file);if(!buffer||!this.allowed())return;
    this.play(file,.9,0,false,0,'shop-dialogue','effects');
    if(this.context&&this.musicGain){this.musicGain.gain.cancelScheduledValues(this.context.currentTime);this.musicGain.gain.setTargetAtTime(.2,this.context.currentTime,.04);this.musicGain.gain.setTargetAtTime(.8,this.context.currentTime+buffer.duration,.3);}
  }
  private tick(){
    if(!this.allowed()||!this.context)return;
    const at=performance.now(),entries=[...this.scenes.entries()].filter(([,s])=>s.active&&s.frame&&at-s.at<1200).sort((a,b)=>b[1].priority-a[1].priority||b[1].at-a[1].at),selected=entries[0];
    if(!selected){if(this.currentScene){this.hushWorld();this.currentScene=0;this.foot=null;}this.music?.pause();return;}
    const [id,scene]=selected,frame=scene.frame!;
    if(this.currentScene!==id){this.hushWorld();this.currentScene=id;this.foot=null;}
    const budget=this.coarse?6:10,emitters=audibleEmitters(frame,budget),wanted=new Set<string>(),time=this.context.currentTime;
    this.filter?.frequency.setTargetAtTime(frame.inside?3800:18000,time,.25);this.wet?.gain.setTargetAtTime(frame.inside?.3:0,time,.3);
    const loop=(key:string,file:string,gain:number,pan=0,channel:AudioChannel='effects')=>{if(gain<.008||!this.snapshot.settings[channel])return;wanted.add(key);const voice=[...this.voices].find(v=>v.key===key&&v.scene===id);if(voice){voice.gain.gain.setTargetAtTime(gain,time,.25);voice.pan.pan.setTargetAtTime(pan,time,.1);}else this.play(file,gain,pan,true,id,key,channel);};
    if(frame.biome!=='menu')loop('wind','wind',frame.inside?.025:frame.biome==='ice'||frame.biome==='mountain'?.5:.18,0,'ambience');
    if(!frame.inside&&!['ice','desert','ocean','menu'].includes(frame.biome))loop('forest','forest',frame.aerial?.1:.23,0,'ambience');
    loop('water','water',(frame.water??0)*(frame.inside?.08:.6),0,'ambience');
    for(const {source,gain,pan} of emitters){const cfg=SFX[source.kind],key='source:'+source.id;if(cfg.loop)loop(key,cfg.file,gain,pan);else if((this.cadence.get(key)??0)<=at){this.cadence.set(key,at+cfg.interval*1000);this.play(cfg.file,gain,pan,false,id,key,'effects',.94+Math.random()*.12);}}
    for(const voice of [...this.voices])if(voice.loop&&voice.scene===id&&!wanted.has(voice.key))this.stop(voice);
    const feet=advanceFootstep(this.foot,frame.foot,at);this.foot=feet.state;
    if(feet.play&&frame.foot){const foot=frame.foot,mode=foot.mode??'walk',file=mode==='cart'?'hoof':mode==='boat'?'splash':`step-${foot.surface}-${this.variant++%3}`,mix=spatialMix(frame,{id:'foot',kind:'worker-step',...foot,inside:frame.inside,radius:28,volume:.65});this.play(file,mix.gain*(mode==='cart'&&foot.surface==='grass'?.75:1),mix.pan,false,id,'foot','effects',mode==='cart'?(foot.surface==='wood'?1.08:foot.surface==='grass'?.88:1):1);}
    if(!this.music&&this.snapshot.settings.music>0)this.ensureMusic();
    if(this.music){if(this.snapshot.settings.music===0)this.music.pause();else if(this.music.paused)void this.music.play().catch(()=>{/* A new user gesture can resume playback. */});}
    if(this.snapshot.scene!==frame.label||this.snapshot.voices!==this.voices.size)this.publish({scene:frame.label,voices:this.voices.size});
  }
  private ensureMusic(){
    if(this.music||!this.context)return;
    const element=new Audio('/audio/v1/exploration.mp3');element.loop=true;element.preload='none';element.hidden=true;element.setAttribute('data-qfrontier-music','true');element.setAttribute('aria-hidden','true');document.body.appendChild(element);this.music=element;this.musicNode=this.context.createMediaElementSource(element);this.musicGain=this.context.createGain();this.musicGain.gain.value=.8;this.musicNode.connect(this.musicGain).connect(this.buses.music!);element.addEventListener('error',()=>this.publish({status:'La música no pudo cargar. Los efectos siguen disponibles.'}));
  }
}
export const gameAudio=new FrontierAudio();
