/** Zero-resource actions still require the existing signed quote and receipt flow. */
const QUICK_COMMANDS:ReadonlySet<string>=new Set([
  'habitat.walk','habitat.walk.input','habitat.profile',
  'habitat.explore.leave','habitat.explore.walk','habitat.explore.travel',
  'habitat.explore.return','habitat.explore.stop',
]);
export function isQuickHabitableCommand(type:unknown):boolean{
  return typeof type==='string'&&QUICK_COMMANDS.has(type);
}
