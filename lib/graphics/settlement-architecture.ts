import type {WorldBiome} from './world-geography.ts';

export type SettlementPalette={wall:number;light:number;dark:number;wood:number;roof:number;snow:number;accent:number;glass:number;plant:number;soil:number};
export type ArchitectureBox=(color:number,x:number,y:number,z:number,width:number,height:number,depth:number,yaw?:number,roll?:number)=>void;
export interface ArchitectureOptions {biome:WorldBiome;tier:number;variant:number;palette:SettlementPalette;box:ArchitectureBox}
export type DwellingKind='home'|'workshop'|'kitchen'|'laboratory'|'barracks'|'warehouse'|'logistics';
type Opening={u:number;y:number;width:number;height:number;door?:boolean};

/** Small details are baked into the library's material batches, never independent
 * scene objects. Coordinates remain inside the existing settlement footprints. */
export function addDwellingArchitecture(kind:DwellingKind,options:ArchitectureOptions){
  const{biome,tier,variant,palette:p,box}=options,arid=biome==='desert',winter=biome==='ice',maritime=biome==='coast'||biome==='ocean',tropical=biome==='tropical',stone=winter||arid||biome==='mountain';
  const width=kind==='warehouse'?1.88:1.66+(kind==='home'&&variant%2?.06:0),depth=kind==='workshop'?1.62:1.42,lift=tropical?.3:maritime?.22:.13,height=1.18+(tier-1)*.23+(kind==='home'?variant%3*.035:0),top=lift+height,wallThickness=.14;
  const facade=(side:number,u:number,y:number,normal:number,w:number,h:number,d:number,colour:number,roll=0)=>{const a=side*Math.PI/2,c=Math.cos(a),s=Math.sin(a);box(colour,c*u+s*normal,y,-s*u+c*normal,w,h,d,a,roll);};
  const faceDepth=(side:number)=>side%2?width/2:depth/2;
  const faceWidth=(side:number)=>side%2?depth:width;
  const beam=(side:number,u:number,y:number,n:number,w:number,h:number,d:number,colour=p.wood)=>facade(side,u,y,n,w,h,d,colour);
  box(p.dark,0,.075,0,width+.16,.15,depth+.16);
  // The visible shell has actual apertures. Glazing/door boards sit behind the
  // facade plane so nearby first/third-person views retain a deep reveal.
  box(p.wood,0,lift,0,width-.04,.11,depth-.04);
  if(tropical||maritime)for(const x of[-width*.4,width*.4])for(const z of[-depth*.38,depth*.38]){box(p.dark,x,lift/2,z,.13,lift,.13);box(p.light,x,.07,z,.2,.14,.2);}
  let windows=0;
  for(let side=0;side<4;side++){
    const w=faceWidth(side),n=faceDepth(side),front=side===0,doorWidth=kind==='warehouse'?.93:.4,doorHeight=Math.min(height-.12,kind==='warehouse'?1.15:.97),windowY=lift+height*.62;
    const openings:Opening[]=front?[{u:kind==='warehouse'?0:-.16,y:lift+doorHeight/2,width:doorWidth,height:doorHeight,door:true}]:[];
    if(!front||kind!=='warehouse'){
      if(front)openings.push({u:.49,y:windowY,width:.28,height:.38});
      else for(const u of[-w*.24,w*.24])openings.push({u,y:windowY,width:arid?.25:.29,height:winter?.43:.38});
    }
    const xs=[-w/2,w/2,...openings.flatMap(o=>[o.u-o.width/2,o.u+o.width/2])].sort((a,b)=>a-b),ys=[lift,top,...openings.flatMap(o=>[o.y-o.height/2,o.y+o.height/2])].sort((a,b)=>a-b);
    for(let x=1;x<xs.length;x++)for(let y=1;y<ys.length;y++){
      const u=(xs[x-1]+xs[x])/2,yy=(ys[y-1]+ys[y])/2;if(openings.some(o=>Math.abs(u-o.u)<o.width/2-1e-6&&Math.abs(yy-o.y)<o.height/2-1e-6))continue;
      const ww=xs[x]-xs[x-1],hh=ys[y]-ys[y-1];if(ww>1e-5&&hh>1e-5)beam(side,u,yy,n-wallThickness/2,ww,hh,wallThickness,p.wall);
    }
    // Plinth masonry and corner quoins are present on all four elevations.
    for(let row=0;row<(stone?3:2);row++)for(let i=0;i<Math.ceil(w/.25);i++){
      const u=-w/2+.125+i*.25+(row%2)*.095,yy=lift+.075+row*.15;if(u>w/2-.045||openings.some(o=>Math.abs(u-o.u)<o.width/2+.12&&Math.abs(yy-o.y)<o.height/2+.07))continue;
      beam(side,u,yy,n+.006,Math.min(.225,w/2-u+.08),.13,.045,(i+row+variant)%4?p.dark:p.light);
    }
    for(const sign of[-1,1]){
      beam(side,sign*(w/2-.035),lift+height/2,n+.018,.085,height+.05,.085,stone?p.light:p.dark);
      if(stone)for(let row=0;row<Math.ceil(height/.22);row++)beam(side,sign*(w/2-.065),lift+.1+row*.22,n+.045,row%2?.17:.12,.175,.065,row%3?p.light:p.dark);
    }
    for(const yy of[lift+.35,top-.04])beam(side,0,yy,n+.025,w+.06,.07,.07,arid?p.light:p.wood);
    if(!stone){for(const u of[-w*.28,0,w*.28])beam(side,u,lift+height*.7,n+.022,.055,height*.56,.055,p.dark);}
    for(const opening of openings){
      const{u,y,width:ow,height:oh}=opening,back=n-.125;
      beam(side,u,y,back,ow,oh,.025,opening.door?p.dark:winter||variant%4===0?0xe9b967:p.glass);
      for(const sign of[-1,1]){beam(side,u+sign*(ow/2+.025),y,n-.025,.055,oh+.09,.19,arid?p.light:p.dark);beam(side,u,y+sign*(oh/2+.025),n-.025,ow+.11,.055,.19,arid?p.light:p.wood);}
      if(opening.door){
        for(let i=0;i<(kind==='warehouse'?8:4);i++){const count=kind==='warehouse'?8:4;beam(side,u-ow/2+(i+.5)*ow/count,y,n-.101,ow/count-.012,oh-.04,.035,i%2?p.wood:p.dark);}
        for(const yy of[y-oh*.28,y+oh*.27])beam(side,u,yy,n-.065,ow-.03,.032,.045,0x59625b);
        beam(side,u+ow*.28,y-.02,n-.03,.04,.04,.045,0xd6ad61);
        beam(side,u,lift-.035,n+.12,ow+.2,.12,.3,p.light);
      }else{
        windows++;beam(side,u,y,n-.055,.025,oh,.08,p.light);beam(side,u,y,n-.055,ow,.025,.08,p.light);beam(side,u,y-oh/2-.055,n+.055,ow+.2,.065,.26,p.light);
        if(arid){for(let i=0;i<4;i++)beam(side,u-ow*.36+i*ow*.24,y,n+.045,.018,oh,.035,p.wood);}
        else for(const sign of[-1,1]){beam(side,u+sign*(ow/2+.09),y,n+.045,.11,oh+.05,.045,variant%2?p.accent:p.wood);for(const yy of[y-oh*.3,y+oh*.3])beam(side,u+sign*(ow/2+.09),yy,n+.071,.1,.025,.025,p.dark);}
        if(winter)beam(side,u,y+oh/2+.09,n+.06,ow+.2,.045,.22,p.snow);
      }
    }
  }
  const roofWidth=width+(tropical?.36:.22),roofDepth=depth+(tropical?.32:.22);
  if(arid){
    box(p.light,0,top+.075,0,roofWidth,.15,roofDepth);
    for(const side of[0,1,2,3]){const w=faceWidth(side),n=faceDepth(side);beam(side,0,top+.26,n,.11+w,.32,.11,p.wall);for(let i=0;i<Math.ceil(w/.27);i++)beam(side,-w/2+.12+i*.27,top+.46,n,.16,.13,.13,p.light);}
    if(tier>=2&&kind!=='warehouse')addDome(box,p,0,top+.16,-.12,.38,tier===3?.55:.42);
    else for(let i=0;i<5;i++)box(p.wood,-.5+i*.21,top+.17,-.1,.13,.055,.95);
  }else{
    addTiledRoof(box,p,0,0,roofWidth,roofDepth,top+.06,winter?.94:tropical?.61:.73,winter,variant);
    if(tier>=2&&kind==='home'&&!tropical){
      const dormerZ=roofDepth*.43;box(p.wall,0,top+.32,dormerZ,.43,.43,.26);beam(0,0,top+.34,dormerZ+.145,.3,.28,.035,p.dark);beam(0,0,top+.34,dormerZ+.17,.19,.18,.035,p.glass);addTiledRoof(box,p,0,dormerZ,.57,.43,top+.55,.22,winter,variant);
    }
  }
  if(tier>=2&&kind==='home'){
    const side=variant%2?1:2,n=faceDepth(side),w=Math.min(1.15,faceWidth(side)-.16),floor=lift+height*.53;
    beam(side,0,floor,n+.15,w,.09,.32,p.dark);for(const u of[-w/2,w/2])beam(side,u,floor+.23,n+.285,.045,.49,.045,p.wood);
    beam(side,0,floor+.46,n+.285,w+.05,.055,.055,p.wood);for(let i=0;i<7;i++)beam(side,-w*.43+i*w*.143,floor+.24,n+.285,.025,.4,.025,p.accent);
  }
  if(kind==='workshop'||kind==='kitchen'||kind==='laboratory'){
    const chimneyY=top-.15,chimneyHeight=1.18;box(p.dark,-.56,chimneyY+chimneyHeight/2,-.38,.25,chimneyHeight,.28);
    for(let row=0;row<7;row++)for(const side of[-1,1])box(row%3?p.wall:p.light,-.56+side*.135,chimneyY+.09+row*.17,-.38,.045,.12,.29);
    box(p.light,-.56,chimneyY+chimneyHeight,-.38,.36,.1,.38);box(p.dark,-.56,chimneyY+chimneyHeight+.06,-.38,.22,.025,.24);if(winter)box(p.snow,-.56,chimneyY+chimneyHeight+.1,-.38,.4,.045,.4);
  }
  if(kind!=='home'&&kind!=='barracks'&&kind!=='laboratory')addShopFront(kind,options,top,depth);
  if(kind==='laboratory'){
    box(p.dark,.45,top+.2,-.32,.16,.4,.16);box(p.accent,.45,top+.46,-.32,.34,.15,.34);box(p.glass,.45,top+.63,-.32,.23,.24,.23);box(p.light,.45,top+.79,-.32,.27,.08,.27);
  }
  if(kind==='barracks'){
    box(p.dark,1.02,1.04,-.45,.055,2.08,.055);box(p.accent,1.17,1.88,-.45,.28,.28,.035);for(let i=0;i<3;i++){box(p.dark,-.68+i*.22,.37,1.04,.055,.7,.055);box(p.light,-.68+i*.22,.68,1.04,.16,.04,.05);}
  }
  if(winter)for(const x of[-1.05,1.06])box(p.snow,x,.065,.1,.33,.13,.56);
  return{style:arid?'sandstone-courtyard':winter?'alpine-stone-lodge':tropical?'raised-tropical-timber':maritime?'maritime-timber':'half-timber-masonry',facadeCount:4,recessedWindows:windows,wallThickness,windowReveal:.125};
}

function addShopFront(kind:Exclude<DwellingKind,'home'|'barracks'|'laboratory'>,{box,palette:p,biome,variant}:ArchitectureOptions,top:number,depth:number){
  const z=Math.min(depth/2+.26,1.005),canopyY=Math.min(top-.13,1.35),awningColour=kind==='kitchen'?0xcaaa71:kind==='workshop'?0x647d7e:p.accent;
  for(let i=0;i<7;i++){const x=-.61+i*.2;box(i%2?p.light:awningColour,x,canopyY,z,.205,.065,.5,0,-.05);box(i%2?p.light:awningColour,x,canopyY-.09,z+.24,.205,.15,.035);}
  for(const x of[-.66,.66]){box(p.wood,x,canopyY/2,z+.2,.045,canopyY,.045);box(p.dark,x,canopyY-.02,z,.065,.065,.55);}
  if(biome==='ice')box(p.snow,0,canopyY+.06,z,1.45,.055,.52);
  const counterZ=Math.min(1.07,z+.04);box(p.dark,0,.47,counterZ,1.14,.1,.31);for(const x of[-.48,.48])box(p.wood,x,.25,counterZ,.065,.45,.23);
  for(let i=0;i<5;i++)box(p.wood,-.47+i*.235,.37,counterZ+.155,.21,.12,.025);
  if(kind==='kitchen'){
    // Loaves, flour sacks and a masonry bread oven distinguish the bakery.
    for(let row=0;row<2;row++)for(let i=0;i<4;i++){const x=-.43+i*.27,zz=counterZ-.065+row*.13;box(0xd4a65e,x,.56,zz,.21,.1,.105);box(0xf0cf86,x,.61,zz,.16,.025,.08);for(const dx of[-.045,.045])box(0x9b743d,x+dx,.626,zz,.018,.012,.055,0,.25);}
    for(let i=0;i<2;i++){box(0xd3c7a4,1.03,.24+i*.22,.1,.27,.43,.3);box(p.wood,1.03,.46+i*.22,.1,.2,.035,.22);}
    box(p.dark,-.61,.7,depth/2+.065,.31,.39,.065);box(0x8b3924,-.61,.58,depth/2+.11,.2,.07,.035);
  }else if(kind==='workshop'){
    box(0x505b5b,.26,.6,counterZ,.28,.17,.16);box(0x79817a,.26,.71,counterZ,.45,.065,.21);box(0x505b5b,.5,.72,counterZ,.15,.055,.1,0,.3);
    for(let i=0;i<3;i++)box(0xb6a06c,-.35+i*.14,.55,counterZ,.11,.05,.14);box(p.dark,1.02,.33,.05,.3,.62,.4);box(0xc76d36,1.02,.65,.05,.21,.04,.28);box(0xe9bc60,1.02,.68,.05,.12,.025,.2);
    for(let i=0;i<4;i++)box(0x6b7470,-.44+i*.2,1.08,depth/2+.04,.035,.23,.04);
  }else{
    for(let i=0;i<3;i++){const x=-.37+i*.36;box(p.wood,x,.59,counterZ,.28,.17,.24);box(p.dark,x,.65,counterZ+.13,.29,.025,.025);box([p.plant,0xc8a363,0xa66d51][i],.01+x,.71,counterZ,.2,.08,.17);}
    for(const x of[-1.04,1.04])addCargoCrate(box,p,x,.02,-.2,.32);
    if(kind==='warehouse'){box(p.dark,.53,top+.12,.05,.075,.78,.075);box(p.wood,.3,top+.5,.05,.58,.075,.1);box(0x555e58,.03,top+.2,.05,.025,.58,.025);box(p.wood,.03,top-.11,.05,.15,.075,.14);}
  }
  // A dimensional hanging sign uses a pictogram, avoiding unreadable font decals.
  box(p.dark,-.98,1.3,depth/2-.1,.055,.6,.055);box(p.wood,-1.08,1.54,depth/2-.1,.28,.045,.05);box(p.wood,-1.17,1.26,depth/2-.1,.28,.33,.055);box(p.light,-1.17,1.26,depth/2-.065,.22,.26,.025);
  const symbol=kind==='kitchen'?0xc5934d:kind==='workshop'?0x515d5b:p.accent;box(symbol,-1.17,1.27,depth/2-.043,.14,kind==='workshop'?.045:.1,.025);if(kind==='workshop')box(symbol,-1.17,1.22,depth/2-.043,.08,.07,.025);else if(variant%2)box(symbol,-1.17,1.34,depth/2-.043,.045,.05,.025);
}

export function addCargoCrate(box:ArchitectureBox,p:SettlementPalette,x:number,y:number,z:number,size=.36){
  box(p.wood,x,y+size/2,z,size,size,size);for(const side of[-1,1]){box(p.dark,x+side*size*.37,y+size/2,z,size*.1,size+.02,size+.02);box(p.light,x,y+size*.23,z+side*(size/2+.008),size,.035,.025);box(p.light,x,y+size*.77,z+side*(size/2+.008),size,.035,.025);}box(p.dark,x,y+size+.009,z,size*.1,.025,size);
}

export function addTiledRoof(box:ArchitectureBox,p:SettlementPalette,x:number,z:number,width:number,depth:number,y:number,rise:number,snow:boolean,variant:number){
  const half=width/2,slope=Math.atan2(rise,half),length=Math.hypot(half,rise),rows=6,columns=Math.ceil(depth/.24);
  for(const side of[-1,1]){
    box(p.dark,x+side*width/4,y+rise/2,z,length,.11,depth,0,-side*slope);
    for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
      const t=(row+.5)/rows,xx=x+side*half*(1-t),yy=y+rise*t+.07,zz=z-depth/2+(column+.5)*depth/columns;
      box(snow?p.snow:(row+column+variant)%5===0?p.dark:p.roof,xx,yy,zz,length/rows+.025,snow?.055:.045,depth/columns-.015,0,-side*slope);
    }
    box(snow?p.snow:p.wood,x+side*half,y+.015,z,.065,.13,depth+.02);
  }
  for(let i=0;i<columns;i++)box(snow?p.snow:p.light,x,y+rise+.095,z-depth/2+(i+.5)*depth/columns,.17,.11,depth/columns+.018);
  for(const end of[-1,1]){
    for(let row=0;row<6;row++)box(row%2?p.wall:p.light,x,y+rise*(row+.5)/6,z+end*(depth/2-.035),width*(1-(row+.5)/6),rise/6+.012,.065);
    box(p.wood,x,y+rise*.46,z+end*(depth/2+.01),.055,rise*.93,.055);
  }
  // Narrow verge boards make the pitched volume readable from behind as well.
  for(const end of[-1,1])for(const side of[-1,1])box(p.wood,x+side*width/4,y+rise/2,z+end*(depth/2+.015),length+.035,.07,.065,0,-side*slope);
  if(snow)for(const end of[-1,1])for(let i=0;i<5;i++)box(p.snow,x-width*.4+i*width*.2,y+.005,z+end*(depth/2+.035),.035,.1+(i%3)*.035,.035);
}

export function addMarketArchitecture(options:ArchitectureOptions){
  const{box,palette:p,biome,variant}=options,winter=biome==='ice',desert=biome==='desert',cloth=desert?0xc68d63:biome==='tropical'?0x70925d:p.accent;
  for(const x of[-2.5,0,2.5])for(const z of[-1.62,1.62]){
    box(p.dark,x,1.35,z,.14,2.7,.14);box(p.light,x,.12,z,.24,.24,.24);box(p.wood,x,2.57,z,.24,.14,.23);
    for(const side of[-1,1])if(Math.abs(x+side*.28)<2.65)box(p.wood,x+side*.22,2.34,z,.62,.07,.08,0,side*.7);
  }
  for(const z of[-1.62,1.62])box(p.wood,0,2.64,z,5.42,.14,.12);
  for(let strip=0;strip<14;strip++){
    const z=-1.88+(strip+.5)*3.76/14,colour=strip%2?cloth:p.light;
    for(const side of[-1,1])box(winter?p.snow:colour,side*1.37,2.82,z,2.84,.085,.275,0,-side*.22);
    for(const side of[-1,1])box(winter?p.snow:colour,side*2.74,2.42,z,.08,.26,.275);
  }
  box(p.wood,0,3.16,0,.15,.12,3.92);
  for(const end of[-1,1])for(let strip=0;strip<14;strip++)box(strip%2?cloth:p.light,-2.64+(strip+.5)*5.28/14,2.64,end*1.94,.38,.24,.045);
  for(const side of[-1,1])for(let stall=0;stall<3;stall++){
    const x=-1.76+stall*1.76,z=side*1.08;box(p.dark,x,.98,z,1.57,.13,.65);for(const dx of[-.67,.67])box(p.wood,x+dx,.51,z,.08,.91,.49);
    for(let plank=0;plank<6;plank++)box(plank%2?p.wood:p.light,x-.66+plank*.265,.8,z+side*.33,.24,.26,.035);
    for(let tray=0;tray<3;tray++){
      const xx=x-.5+tray*.5;box(p.wood,xx,1.11,z,.43,.16,.48);box(p.dark,xx,1.2,z+side*.245,.45,.045,.035);
      for(let item=0;item<4;item++){
        const px=xx-.1+(item%2)*.2,pz=z-.1+Math.floor(item/2)*.2,category=(stall+tray+variant)%3;
        if(category===0){box(item%2?0xc48c4d:p.plant,px,1.27,pz,.15,.13,.15);box(p.plant,px,1.35,pz,.055,.04,.035);}
        else if(category===1){box(0xe0bd75,px,1.27,pz,.19,.1,.12);box(0xb58a48,px,1.32,pz,.035,.025,.09);}
        else{box(p.accent,px,1.27,pz,.12,.16,.12);box(p.light,px,1.39,pz,.055,.075,.055);}
      }
    }
    box(p.dark,x+.6,1.36,z+side*.24,.24,.24,.035);for(let mark=0;mark<3;mark++)box(p.light,x+.54+mark*.065,1.36,z+side*.266,.025,.11,.02);
  }
  for(const x of[-3.02,3.02]){
    addCargoCrate(box,p,x,.02,-.65,.4);addCargoCrate(box,p,x,.02,-1.09,.35);box(p.wood,x,.24,.67,.4,.48,.4);for(const y of[.1,.36])box(p.dark,x,y,.67,.43,.05,.43);
    if(desert){box(p.dark,x,.27,1.3,.37,.54,.37);for(let i=0;i<6;i++){const a=i*Math.PI/3;box(p.plant,x+Math.cos(a)*.17,1.02,1.3+Math.sin(a)*.17,.32,.065,.13,a);}}
  }
  for(const x of[-1.1,1.1]){box(p.dark,x,2.59,0,.025,.65,.025);box(0xe9b967,x,2.22,0,.21,.26,.21);box(p.wood,x,2.38,0,.29,.055,.29);}
  return{style:desert?'oasis-bazaar':winter?'snow-market-hall':'striped-trade-pavilion',facadeCount:4,stalls:6,goodsTrays:18};
}

function addDome(box:ArchitectureBox,p:SettlementPalette,x:number,y:number,z:number,radius:number,rise:number){
  const rows=5,sides=12;for(let row=0;row<rows;row++){
    const t=(row+.5)/rows,r=radius*Math.sqrt(1-t*t),h=rise/rows;
    for(let i=0;i<sides;i++){const a=i*Math.PI*2/sides;box(i%4?p.accent:p.light,x+Math.cos(a)*r,y+h*(row+.5),z+Math.sin(a)*r,r*.48,h+.018,.11,a);}
  }box(p.light,x,y+rise+.06,z,.035,.16,.035);
}

export function addCivicArchitecture(kind:'keep'|'hall'|'tower',options:ArchitectureOptions){
  const{box,palette:p,biome,tier}=options,winter=biome==='ice',arid=biome==='desert';
  const masonry=(x:number,z:number,w:number,d:number,h:number,base=0,apertures=false)=>{
    if(!apertures)box(p.dark,x,base+h/2,z,w,h,d);else box(p.dark,x,base+.08,z,w,.16,d);
    for(let side=0;side<4;side++){
      const a=side*Math.PI/2,c=Math.cos(a),s=Math.sin(a),width=side%2?d:w,n=(side%2?w:d)/2;
      const face=(u:number,yy:number,normal:number,ww:number,hh:number,dd:number,colour:number)=>box(colour,x+c*u+s*normal,base+yy,z-s*u+c*normal,ww,hh,dd,a);
      const holes:Opening[]=!apertures?[]:side===0?[{u:0,y:.88,width:.88,height:1.76,door:true}]:[-width*.24,width*.24].map(u=>({u,y:h*.6,width:.3,height:.57}));
      if(apertures){
        const xs=[-width/2,width/2,...holes.flatMap(o=>[o.u-o.width/2,o.u+o.width/2])].sort((a,b)=>a-b),ys=[0,h,...holes.flatMap(o=>[o.y-o.height/2,o.y+o.height/2])].sort((a,b)=>a-b);
        for(let i=1;i<xs.length;i++)for(let j=1;j<ys.length;j++){
          const u=(xs[i-1]+xs[i])/2,y=(ys[j-1]+ys[j])/2;if(holes.some(o=>Math.abs(u-o.u)<o.width/2-1e-6&&Math.abs(y-o.y)<o.height/2-1e-6))continue;
          if(xs[i]-xs[i-1]>1e-5&&ys[j]-ys[j-1]>1e-5)face(u,y,n-.085,xs[i]-xs[i-1],ys[j]-ys[j-1],.17,p.dark);
        }
        for(const hole of holes){
          face(hole.u,hole.y,n-.17,hole.width,hole.height,.035,hole.door?p.dark:winter?0xe9b967:p.glass);
          if(!hole.door){for(const sign of[-1,1]){face(hole.u+sign*(hole.width/2+.045),hole.y,n-.015,.09,hole.height+.17,.2,p.light);face(hole.u,hole.y+sign*(hole.height/2+.045),n-.015,hole.width+.18,.09,.2,p.light);}face(hole.u,hole.y,n-.04,.035,hole.height,.08,p.light);}
        }
      }
      for(let row=0;row<Math.ceil(h/.23);row++)for(let col=0;col<Math.ceil(width/.3);col++){
        const u=-width/2+.14+col*.3+(row%2)*.07,y=.1+row*.23;if(u>width/2-.04||holes.some(o=>Math.abs(u-o.u)<o.width/2+.14&&Math.abs(y-o.y)<o.height/2+.105))continue;
        face(u,y,n+.015,.265,.195,.055,(row+col)%5?p.wall:p.light);
      }
    }
  };
  const turret=(x:number,z:number,h:number,w=.9)=>{
    masonry(x,z,w,w,h);for(const yy of[h*.3,h*.64])for(let side=0;side<4;side++){const a=side*Math.PI/2,n=w/2+.055;box(p.dark,x+Math.sin(a)*n,yy,z+Math.cos(a)*n,.145,.39,.045,a);box(p.glass,x+Math.sin(a)*(n+.025),yy,z+Math.cos(a)*(n+.025),.045,.27,.025,a);}
    box(p.light,x,h+.06,z,w+.17,.15,w+.17);
    if(winter){addTiledRoof(box,p,x,z,w+.2,w+.2,h+.16,.62,true,0);}
    else if(arid){for(const sign of[-1,1])for(let i=0;i<3;i++){box(p.light,x+sign*w*.47,h+.26,z-w*.35+i*w*.35,.16,.3,.16);box(p.light,x-w*.35+i*w*.35,h+.26,z+sign*w*.47,.16,.3,.16);}}
    else for(const dx of[-1,1])for(const dz of[-1,1])box(p.light,x+dx*w*.37,h+.29,z+dz*w*.37,.22,.38,.22);
    for(let side=0;side<4;side++){const a=side*Math.PI/2;box(p.dark,x+Math.sin(a)*(w/2+.035),h-.16,z+Math.cos(a)*(w/2+.035),w+.12,.12,.09,a);}
  };
  if(kind==='tower'){
    turret(0,0,3+(tier-1)*.27,1.65);box(p.dark,0,.65,.88,.42,1.2,.05);box(p.wood,0,.65,.92,.29,1.1,.035);return;
  }
  const h=2.2+(tier-1)*.24;masonry(0,0,3.02,2.66,h,0,true);
  // Recessed gate, carved stone arch and portcullis are visible at street level.
  for(const x of[-.31,-.15,0,.15,.31])box(p.wood,x,.83,1.225,.045,1.57,.055);
  for(const yy of[.3,.8,1.3])box(p.dark,0,yy,1.26,.77,.045,.045);
  for(const sign of[-1,1]){box(p.light,sign*.48,.75,1.43,.16,1.5,.2);for(let row=0;row<5;row++)box(row%2?p.wall:p.light,sign*.49,.16+row*.3,1.46,.2,.24,.2);}
  for(let i=0;i<9;i++){const a=Math.PI*i/8;box(i%2?p.light:p.wall,Math.cos(a)*.49,1.49+Math.sin(a)*.35,1.45,.2,.17,.2,0,a-Math.PI/2);}
  for(const side of[-1,1]){
    for(const z of[-.8,0,.8]){box(p.light,side*1.54,h*.53,z,.13,h+.1,.2);box(p.dark,side*1.62,h*.7,z,.03,.48,.13);}
    box(p.accent,side*.85,1.96,1.43,.27,.62,.04);box(p.light,side*.85,2.03,1.46,.05,.38,.025);
  }
  for(const x of[-1.5,1.5])for(const z of[-1.31,1.31])if(kind==='keep'||z<0)turret(x,z,3.15+(tier-1)*.24);
  if(arid){
    box(p.light,0,h+.1,0,3.18,.18,2.82);addDome(box,p,0,h+.2,0,.73,.9);for(const x of[-1.23,1.23])addDome(box,p,x,h+.19,.88,.2,.28);
  }else addTiledRoof(box,p,0,0,3.18,2.85,h+.08,winter?.98:.75,winter,tier);
  for(const side of[-1,1]){box(p.dark,side*.98,.1,1.7,.6,.18,.3);box(p.light,side*.98,.13,1.7,.45,.11,.27);}
  if(kind==='hall'){
    box(p.light,0,h+.2,1.49,.6,.7,.1);box(p.dark,0,h+.2,1.55,.42,.46,.035);box(p.light,0,h+.2,1.58,.025,.31,.025);box(p.light,.08,h+.28,1.58,.18,.025,.025);
  }
  box(p.wood,-1.5,4.1+(tier-1)*.24,-1.31,.045,1.16,.045);box(p.accent,-1.26,4.52+(tier-1)*.24,-1.31,.48,.3,.035);
}
