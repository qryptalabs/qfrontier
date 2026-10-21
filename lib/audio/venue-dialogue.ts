import {gameAudio} from './engine';
/** Optional device voice. Text remains available when no Spanish voice is installed. */
export function speakVenue(venue:'tavern'|'warehouse'){
 if(typeof window==='undefined'||!('speechSynthesis'in window)||!gameAudio.getSnapshot().settings.enabled)return;
 window.speechSynthesis.cancel();const s=gameAudio.getSnapshot().settings;
 const text=venue==='tavern'?'Bienvenido a La Vela Azul. Soy Isabel, la posadera. Nuestra despensa necesita grano y agua de tu aldea. ¿Quieres abastecernos?':'Bienvenido al Almacén de la Ribera. Soy Mateo. Recibimos el cargamento de La Vela Azul y lo llevamos hasta su despensa.';
 const utterance=new SpeechSynthesisUtterance(text);utterance.lang='es-ES';const voice=window.speechSynthesis.getVoices().find(v=>/^es(?:-|_)/i.test(v.lang));if(voice)utterance.voice=voice;utterance.rate=.95;utterance.volume=s.master*s.effects;window.speechSynthesis.speak(utterance);
}
export function stopVenueSpeech(){if(typeof window!=='undefined'&&'speechSynthesis'in window)window.speechSynthesis.cancel();}
