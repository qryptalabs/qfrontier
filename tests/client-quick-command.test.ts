import test from 'node:test';
import assert from 'node:assert/strict';
import {isQuickHabitableCommand} from '../lib/client/quick-command.ts';

test('walking, wardrobe and the five exploration controls use the same recoverable quick flow',()=>{
  for(const type of ['habitat.walk','habitat.profile','habitat.explore.leave','habitat.explore.walk','habitat.explore.travel','habitat.explore.return','habitat.explore.stop'])assert.equal(isQuickHabitableCommand(type),true,type);
});
test('resource spending and unknown exploration actions keep their confirmation boundary',()=>{
  for(const type of ['habitat.build','habitat.manager.start','craft.start','npc.sell','habitat.explore.buy','habitat.explore.teleport','habitat.explore.travel.extra','habitat.explore.'])assert.equal(isQuickHabitableCommand(type),false,type);
});
test('restored malformed actions cannot use inherited keys or non-string values',()=>{
  for(const type of [null,undefined,{},['habitat.explore.leave'],0,'__proto__','constructor','toString'])assert.equal(isQuickHabitableCommand(type),false);
});
