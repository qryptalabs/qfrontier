import { MvpError } from './helpers.ts';
import type { MvpWorld } from './types.ts';

/** A display alias derived from the existing identifier; no save migration or ownership inference. */
export function invitationCodeForPlayer(playerId:string):string|null {
  const match=/^p_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(playerId);
  return match?`QF${match[1].replaceAll('-','').slice(0,12).toUpperCase()}`:null;
}
/** Legacy full identifiers remain exact. A short alias never picks the first of multiple matches. */
export function resolveInvitationPlayerId(world:Pick<MvpWorld,'players'>,value:unknown):string|null {
  if(typeof value!=='string'||value.length>180)return null;const code=value.trim();
  if(code.startsWith('p_')&&Object.hasOwn(world.players,code))return code;
  if(!/^QF[0-9a-f]{12}$/i.test(code))return null;
  const matches=Object.keys(world.players).filter(id=>invitationCodeForPlayer(id)===code.toUpperCase());
  if(matches.length>1)throw new MvpError('El código de invitación es ambiguo. Pide el identificador completo del explorador que te invitó.',409);
  return matches[0]??null;
}
