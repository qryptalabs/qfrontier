"use client";

import {useCallback,useEffect,useLayoutEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {Camera,RotateCcw,RotateCw,LocateFixed,LoaderCircle,Maximize,Minimize,Eye,PersonStanding,Map,Hand,Move,Ship,Caravan,Footprints,Square} from 'lucide-react';
import type {SceneInput} from '../../lib/graphics/scene-data';
import type {HabitableState,HabitablePoint} from '../../lib/mvp/habitable-data';
import type {HabitableDistrict,HabitablePlacement} from '../../lib/graphics/habitable-district';
import type {WorldTerrainController} from '../../lib/graphics/world-terrain-renderer';
import type {DistrictCameraMode} from '../../lib/graphics/district-navigation';
import {districtJoystickInput,type DistrictManualNavigationIntent} from '../../lib/client/district-controls';
import {useViewerVisibility,useEffectiveGraphicsQuality} from './use-viewer-lifecycle';
import './habitable-scene.css';
import {GameAudio} from '../game-audio';

export interface HabitableSceneProps {
  input:SceneInput;state:HabitableState;placement?:HabitablePlacement|null;
  onMove(point:HabitablePoint):void;onManualNavigation?(intent:DistrictManualNavigationIntent):void;onPlace(point:HabitablePoint):void;onInteract(id:string):void;
  landMode?:boolean;landSelection?:readonly string[];onLandCell?(id:string):void;selectedBuildingId?:string;
  navigationDisabled?:boolean;
  journey?:{mode:'walk'|'carriage'|'boat';remainingLabel:string;canStop:boolean;waiting?:boolean};
  onStopJourney?():void;
}
const cameraChoices=[{mode:'aerial',label:'Aérea',Icon:Map},{mode:'first-person',label:'Primera persona',Icon:Eye},{mode:'third-person',label:'Tercera persona',Icon:PersonStanding}]as const;

export function HabitableScene(props:HabitableSceneProps){
  const frame=useRef<HTMLDivElement>(null),mount=useRef<HTMLDivElement>(null),current=useRef(props),controller=useRef<WorldTerrainController|null>(null),district=useRef<HabitableDistrict|null>(null),initializing=useRef(false),loadAbort=useRef<AbortController|null>(null);
  const visibility=useViewerVisibility(mount),effectiveQuality=useEffectiveGraphicsQuality(props.input.quality),active=useRef(false);
  useLayoutEffect(()=>{active.current=visibility.visible;current.current={...props,input:{...props.input,quality:effectiveQuality}};});
  const[ready,setReady]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[cameraMode,setCameraMode]=useState<'2d'|'3d'>('3d'),[districtCameraMode,setDistrictCameraMode]=useState<DistrictCameraMode>('aerial'),[capturing,setCapturing]=useState(false),[nativeFullscreen,setNativeFullscreen]=useState(false),[immersive,setImmersive]=useState(false);
  const thumb=useRef<HTMLSpanElement>(null);
  const modeRef=useRef<DistrictCameraMode>('aerial'),joystick=useRef<{id:number;element:HTMLElement}|null>(null),look=useRef<{id:number;x:number;y:number;element:HTMLElement}|null>(null);
  const walking=districtCameraMode!=='aerial',editing=!!(props.landMode||props.placement),navigationBlocked=!!props.navigationDisabled||editing||!!props.journey,expanded=nativeFullscreen||immersive;

  const stopNavigation=useCallback(()=>{
    const moving=joystick.current;joystick.current=null;
    if(moving?.element.hasPointerCapture(moving.id))moving.element.releasePointerCapture(moving.id);
    const looking=look.current;look.current=null;
    if(looking?.element.hasPointerCapture(looking.id))looking.element.releasePointerCapture(looking.id);
    controller.current?.stopDistrictNavigation();if(thumb.current)thumb.current.style.transform='translate(0px,0px)';
  },[]);
  const focusScene=()=>mount.current?.querySelector('canvas')?.focus({preventScroll:true});

  useEffect(()=>{
    if(!visibility.entered||!active.current)return;
    let cancelled=false;const loading=new AbortController();loadAbort.current=loading;initializing.current=true;
    Promise.all([import('../../lib/graphics/world-terrain-renderer'),import('../../lib/graphics/habitable-district')]).then(async([terrain,habitable])=>{
      if(cancelled||!mount.current)return;if(!active.current){initializing.current=false;return;}
      const p=current.current,own=p.input.view.settlements.find(s=>s.playerId===p.input.player?.id),plot=own?.plot??{x:0,y:0};
      const scene=await terrain.createWorldTerrainRendererAsync(mount.current,p.input,{onError:setError,onCameraState:s=>setCameraMode(s.mode),onDistrictCameraState:s=>{modeRef.current=s.mode;setDistrictCameraMode(s.mode);}},plot,{signal:loading.signal});
      if(cancelled||loading.signal.aborted||!active.current){scene.dispose();initializing.current=false;return;}
      controller.current=scene;
      const overlay=habitable.createHabitableDistrict({input:p.input,state:p.state,placement:p.placement,landMode:p.landMode,landSelection:p.landSelection,selectedBuildingId:p.selectedBuildingId,navigationBlocked:p.navigationDisabled,groundHeight:(x,y)=>scene.groundHeightAt(x,y),onMove:point=>current.current.onMove(point),...(p.onManualNavigation?{onManualNavigation:(intent:DistrictManualNavigationIntent)=>current.current.onManualNavigation?.(intent)}:{}),onPlace:point=>current.current.onPlace(point),onInteract:id=>current.current.onInteract(id),onLandCell:id=>current.current.onLandCell?.(id)});
      district.current=overlay;scene.attachDistrict(overlay);scene.setDistrictCameraMode(modeRef.current);scene.setActive(active.current);initializing.current=false;setReady(true);
    }).catch(reason=>{
      if(loading.signal.aborted){initializing.current=false;if(!cancelled&&active.current)setAttempt(value=>value+1);return;}
      if(!cancelled){initializing.current=false;controller.current?.dispose();controller.current=null;district.current=null;setError(reason instanceof Error?reason.message:'No se pudo abrir el distrito.');}
    });
    return()=>{cancelled=true;loading.abort();stopNavigation();if(loadAbort.current===loading)loadAbort.current=null;initializing.current=false;controller.current?.dispose();controller.current=null;district.current=null;};
  },[props.input.player?.id,attempt,visibility.entered,stopNavigation]);
  useEffect(()=>{
    if(!active.current)return;controller.current?.update(current.current.input);
    district.current?.update(current.current.input,props.state,props.placement,{landMode:props.landMode,landSelection:props.landSelection,selectedBuildingId:props.selectedBuildingId,navigationBlocked:props.navigationDisabled});
  },[props.input,props.state,props.placement,props.landMode,props.landSelection,props.selectedBuildingId,props.navigationDisabled,effectiveQuality]);
  useEffect(()=>{
    if(!visibility.visible)stopNavigation();
    if(!controller.current){
      if(!active.current)loadAbort.current?.abort();let cancelled=false;
      if(visibility.entered&&visibility.visible&&!initializing.current)queueMicrotask(()=>{if(!cancelled&&!controller.current)setAttempt(value=>value+1);});
      return()=>{cancelled=true;};
    }
    controller.current.setActive(visibility.visible);
    if(visibility.visible){controller.current.update(current.current.input);district.current?.update(current.current.input,current.current.state,current.current.placement,{landMode:current.current.landMode,landSelection:current.current.landSelection,selectedBuildingId:current.current.selectedBuildingId,navigationBlocked:current.current.navigationDisabled});}
  },[ready,visibility.visible,visibility.entered,stopNavigation]);
  // Network saves pause execution in the engine without cancelling a finger still held down.
  // Editing, camera changes and focus loss do cancel that physical navigation intention.
  useEffect(()=>{stopNavigation();},[districtCameraMode,editing,stopNavigation]);
  useEffect(()=>{
    const hidden=()=>{if(document.hidden)stopNavigation();};window.addEventListener('blur',stopNavigation);document.addEventListener('visibilitychange',hidden);
    return()=>{window.removeEventListener('blur',stopNavigation);document.removeEventListener('visibilitychange',hidden);};
  },[stopNavigation]);
  useEffect(()=>{
    const sync=()=>{stopNavigation();setNativeFullscreen(document.fullscreenElement===frame.current);if(document.fullscreenElement===frame.current)setImmersive(false);};
    document.addEventListener('fullscreenchange',sync);return()=>document.removeEventListener('fullscreenchange',sync);
  },[stopNavigation]);
  useEffect(()=>{
    if(!immersive)return;const before=document.body.style.overflow;document.body.style.overflow='hidden';
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){stopNavigation();setImmersive(false);}};window.addEventListener('keydown',escape);
    return()=>{document.body.style.overflow=before;window.removeEventListener('keydown',escape);};
  },[immersive,stopNavigation]);

  const selectCamera=(mode:DistrictCameraMode)=>{stopNavigation();controller.current?.setDistrictCameraMode(mode);const selected=controller.current?.getDistrictCameraMode()??mode;modeRef.current=selected;setDistrictCameraMode(selected);focusScene();};
  const fullscreen=async()=>{
    stopNavigation();
    if(immersive){setImmersive(false);focusScene();return;}
    if(document.fullscreenElement===frame.current){try{await document.exitFullscreen();}catch{setNativeFullscreen(document.fullscreenElement===frame.current);}focusScene();return;}
    try{if(!frame.current?.requestFullscreen)throw new Error('Fullscreen unavailable');await frame.current.requestFullscreen();}
    catch{setImmersive(true);}
    focusScene();
  };
  const capture=async()=>{
    if(!controller.current)return;setCapturing(true);
    try{const blob=await controller.current.capture(),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='qfrontier-mi-distrito.png';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    catch(reason){setError(reason instanceof Error?reason.message:'No se pudo guardar la captura.');}finally{setCapturing(false);}
  };
  const joystickMove=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(joystick.current?.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();
    const bounds=event.currentTarget.getBoundingClientRect(),radius=bounds.width/2-22,input=districtJoystickInput(event.clientX-bounds.left-bounds.width/2,event.clientY-bounds.top-bounds.height/2,radius);
    controller.current?.setNavigationInput({forward:input.forward,strafe:input.strafe});if(thumb.current)thumb.current.style.transform=`translate(${input.x*radius}px,${input.y*radius}px)`;
  };
  const joystickDown=(event:ReactPointerEvent<HTMLDivElement>)=>{
    event.preventDefault();event.stopPropagation();if(navigationBlocked||joystick.current||event.button!==0)return;
    event.currentTarget.setPointerCapture(event.pointerId);joystick.current={id:event.pointerId,element:event.currentTarget};joystickMove(event);
  };
  const joystickUp=(event:ReactPointerEvent<HTMLDivElement>)=>{if(joystick.current?.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();const pointer=joystick.current;joystick.current=null;if(pointer.element.hasPointerCapture(pointer.id))pointer.element.releasePointerCapture(pointer.id);controller.current?.setNavigationInput({forward:0,strafe:0});if(thumb.current)thumb.current.style.transform='translate(0px,0px)';};
  const lookDown=(event:ReactPointerEvent<HTMLDivElement>)=>{event.preventDefault();event.stopPropagation();if(look.current||event.button!==0)return;event.currentTarget.setPointerCapture(event.pointerId);look.current={id:event.pointerId,x:event.clientX,y:event.clientY,element:event.currentTarget};};
  const lookMove=(event:ReactPointerEvent<HTMLDivElement>)=>{const pointer=look.current;if(pointer?.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();controller.current?.lookDistrict((event.clientX-pointer.x)*.003,(event.clientY-pointer.y)*.003);pointer.x=event.clientX;pointer.y=event.clientY;};
  const lookUp=(event:ReactPointerEvent<HTMLDivElement>)=>{if(look.current?.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();const pointer=look.current;look.current=null;if(pointer.element.hasPointerCapture(pointer.id))pointer.element.releasePointerCapture(pointer.id);};

  return <div ref={frame} className={`h-district-scene${immersive?' h-district-scene--immersive':''}${expanded?' h-district-scene--expanded':''}`} data-camera={districtCameraMode} role="region" aria-label={props.state.exploration?'Recorrer el mundo':'Recorrer tu aldea'}>
    <div ref={mount} className="h-district-canvas" aria-label="Distrito habitable. Enfocá la escena para moverte con las flechas y mirar con el mouse."/>
    {!ready&&!error&&<div className="h-district-loading" role="status"><span><LoaderCircle size={22}/> Preparando tu distrito…</span></div>}
    {error&&<div className="h-district-error" role="alert">{error}<button type="button" onClick={()=>{setReady(false);setError('');setAttempt(v=>v+1);}}>Volver a intentar</button></div>}
    {ready&&!error&&<>
      <div className="h-district-cameras" role="group" aria-label="Cámara de navegación">{cameraChoices.map(({mode,label,Icon})=><button key={mode} type="button" aria-pressed={districtCameraMode===mode} disabled={mode!=='aerial'&&!!(props.landMode||props.placement)} onClick={()=>selectCamera(mode)} title={label}><Icon size={16}/><span>{label}</span></button>)}</div>
      <button className="h-district-fullscreen" type="button" aria-label={expanded?'Salir de pantalla completa':'Pantalla completa'} title={expanded?'Salir de pantalla completa':'Pantalla completa'} aria-pressed={expanded} onClick={fullscreen}>{expanded?<Minimize size={18}/>:<Maximize size={18}/>}<span>{expanded?'Salir':'Ampliar'}</span></button>
      <div className="h-district-keyboard-hint">{walking?<><span>↑ ↓ ← →</span> Caminar · Arrastrar mouse: mirar · E: interactuar</>:<>Flechas o joystick: caminar · Arrastrar: desplazar · Rueda: acercar</>}</div>
      {editing&&walking&&<p className="h-district-navigation-note" role="status">Terminá la planificación para caminar.</p>}
      {props.journey&&<div className="h-district-journey" aria-label="Estado del viaje"><span>{props.journey.mode==='boat'?<Ship size={15}/>:props.journey.mode==='carriage'?<Caravan size={15}/>:<Footprints size={15}/>}<strong>{props.journey.waiting?'Cediendo el paso':props.journey.mode==='boat'?'En barco':props.journey.mode==='carriage'?'En carreta':'A pie'}</strong><small>{props.journey.remainingLabel}</small></span>{props.journey.canStop&&props.onStopJourney&&<button type="button" aria-label="Detener el viaje" disabled={props.navigationDisabled} onClick={()=>{stopNavigation();props.onStopJourney?.();}}><Square size={12}/>Detenerme</button>}{props.journey.mode==='boat'&&<small>Próxima parada: desembarque</small>}</div>}
      <div className="h-district-touch-controls" aria-label="Controles táctiles">
        <div className={`h-district-joystick${navigationBlocked?' h-district-control-disabled':''}`} role="group" aria-label="Joystick: arrastrá para caminar" aria-disabled={navigationBlocked} onPointerDown={joystickDown} onPointerMove={joystickMove} onPointerUp={joystickUp} onPointerCancel={joystickUp} onLostPointerCapture={joystickUp}><Move size={24}/><span ref={thumb} className="h-district-thumb"/><span className="h-district-pad-label">Caminar</span></div>
        {walking&&<div className="h-district-look" role="group" aria-label="Arrastrá para mirar alrededor" onPointerDown={lookDown} onPointerMove={lookMove} onPointerUp={lookUp} onPointerCancel={lookUp} onLostPointerCapture={lookUp}><Eye size={22}/><span>Mirar</span></div>}
      </div>
      <div className="h-district-tools" role="group" aria-label="Herramientas de la vista">
        {expanded&&<GameAudio/>}
        {walking?<button type="button" aria-label="Interactuar con el lugar cercano" title="Interactuar (E)" disabled={navigationBlocked} onClick={()=>{controller.current?.interactDistrict();focusScene();}}><Hand size={17}/><span>Interactuar</span></button>:<><button type="button" title="Girar a la izquierda" aria-label="Girar a la izquierda" onClick={()=>controller.current?.rotate(-1)}><RotateCcw size={17}/></button><button type="button" title="Girar a la derecha" aria-label="Girar a la derecha" onClick={()=>controller.current?.rotate(1)}><RotateCw size={17}/></button></>}
        <button type="button" title="Centrar a mi personaje" aria-label="Centrar a mi personaje" onClick={()=>{controller.current?.recenterDistrict();focusScene();}}><LocateFixed size={17}/></button>
        {!walking&&<button type="button" title="Cambiar vista 2D y 3D" aria-label="Cambiar vista 2D y 3D" onClick={()=>controller.current?.setCameraMode(cameraMode==='2d'?'3d':'2d')}>{cameraMode==='3d'?'2D':'3D'}</button>}
        <button type="button" title="Guardar captura 4K" aria-label="Guardar captura 4K" disabled={capturing} onClick={capture}>{capturing?<LoaderCircle size={17}/>:<Camera size={17}/>}</button>
      </div>
      {immersive&&<span className="h-district-immersive-note" role="status">Vista ampliada · Salir o Esc para volver</span>}
    </>}
  </div>;
}
export default HabitableScene;
