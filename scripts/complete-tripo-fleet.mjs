import fs from 'node:fs';
const path='lib/graphics/royal-world-layer.ts';let s=fs.readFileSync(path,'utf8');
function edit(a,b){if(!s.includes(a))throw Error('Anchor missing '+a);s=s.replace(a,b);}
edit("import {createBoardableRoyalGalleon}","import {createTripoMooredFleet} from './tripo-ship.ts';\nimport {createBoardableRoyalGalleon}");
edit(' const galleonFallback=',' const tripoFleet=createTripoMooredFleet(fleet);harbor.add(tripoFleet.group);\n const galleonFallback=');
edit('galleon.setNear(Math.hypot(', 'tripoFleet.setNear(Math.hypot(focus.x-site.x,focus.y-site.y-OFFSET-215)<480);galleon.setNear(Math.hypot(');
edit('galleon.update(t);activity.update','galleon.update(t);tripoFleet.update(t);activity.update');
edit('disposed=true;galleon.dispose();','disposed=true;tripoFleet.dispose();galleon.dispose();');fs.writeFileSync(path,s);
