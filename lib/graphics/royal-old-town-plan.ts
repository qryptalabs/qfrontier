/** Metre-scale port quarter. The same plan drives paving, buildings and walking. */
const p=(x:number,z:number)=>({x,z,y:.92});
export const OLD_TOWN_STREETS=Object.freeze([
 {id:'old-market-street',width:5.5,points:[p(32,134),p(58,134),p(60,161),p(66,184),p(66,211),p(62,239),p(74,270),p(156,276)]},
 {id:'old-crafts-street',width:4,points:[p(110,130),p(110,157),p(118,183),p(116,214),p(110,239),p(116,266),p(156,276)]},
 {id:'old-lantern-alley',width:3.2,points:[p(60,161),p(85,157),p(110,157)]},
 {id:'old-square-passage',width:3.2,points:[p(66,184),p(92,187),p(118,183)]},
 {id:'old-bakers-alley',width:3.2,points:[p(66,211),p(90,208),p(116,214)]},
 {id:'old-sailors-alley',width:3.2,points:[p(62,239),p(83,244),p(110,239)]},
 {id:'old-harbor-steps',width:3.2,points:[p(32,195),p(46,206),p(66,211)]},
]);
export const OLD_TOWN_SQUARE=Object.freeze({id:'old-harbor-square',x:87,z:186,y:.92,width:22,depth:20});
export type OldTownVenueId='tavern'|'smithy'|'warehouse';
export type OldTownVenue={id:OldTownVenueId;name:string;x:number;z:number;width:number;depth:number;doorX:number;doorZ:number;frontX:number;frontZ:number;floor:number;description:string};
export const OLD_TOWN_VENUES:readonly OldTownVenue[]=Object.freeze([
 {id:'tavern',name:'Taberna La Vela Azul',x:84,z:142,width:16,depth:12,doorX:84,doorZ:148,frontX:84,frontZ:157.16,floor:.92,description:'Salón de viajeros, mesas, barra y hogar encendido. La posadera atiende el salón.'},
 {id:'smithy',name:'Herrería del Yunque',x:138,z:190,width:15,depth:15,doorX:130.5,doorZ:190,frontX:117.55,frontZ:190,floor:.92,description:'Fragua, yunque, herramientas y banco de trabajo. El herrero alterna el fuego y el martillado.'},
 {id:'warehouse',name:'Almacén de la Ribera',x:46,z:154,width:14,depth:16,doorX:39,doorZ:154,frontX:32,frontZ:154,floor:.92,description:'Zona de recepción, estantes y pasillos de carga conectados con el muelle.'},
]);
export const oldTownVenue=(id:OldTownVenueId)=>OLD_TOWN_VENUES.find(v=>v.id===id)!;
export function oldTownInside(x:number,z:number){return OLD_TOWN_VENUES.find(v=>Math.abs(x-v.x)<v.width/2-.25&&Math.abs(z-v.z)<v.depth/2-.25)??null;}
export function oldTownWalkHeight(x:number,z:number){const v=OLD_TOWN_VENUES.find(v=>Math.abs(x-v.x)<=v.width/2+.2&&Math.abs(z-v.z)<=v.depth/2+.2);return v?.floor??null;}
export const oldTownOwns=(x:number,z:number)=>x>35&&x<151&&z>132&&z<310;
export type OldTownHouse={id:string;kind:'home'|'market'|'workshop';variant:number;x:number;z:number;yaw:number;district:'market'|'residential'|'port';oldTown:true};
const houses:OldTownHouse[]=[];
const row=(x:number,zs:number[],yaw:number,district:OldTownHouse['district'],offset:number)=>zs.forEach((z,i)=>houses.push({id:`old-town-${offset}-${i}-${x}-${z}`,kind:district==='market'?'market':district==='port'&&i%3===0?'workshop':'home',variant:offset+i,x,z,yaw,district,oldTown:true}));
row(46,[178],-Math.PI/2,'port',1);
row(52.5,[242],-Math.PI/2,'residential',2);
row(79,[169,221],Math.PI,'market',4);
row(85.5,[261.2],-Math.PI/2,'market',6);
row(90.5,[169,221],Math.PI,'residential',7);
row(97,[256],Math.PI,'residential',9);
row(80,[201],-Math.PI/2,'residential',3);
row(93,[200.2],Math.PI/2,'residential',5);
row(128,[142],-Math.PI/2,'residential',6);
row(139.3,[142],0,'residential',8);
row(135,[168,217,239,260],-Math.PI/2,'residential',2);
row(128,[291],Math.PI,'residential',10);
row(139.5,[291],Math.PI,'residential',11);
row(88,[287],Math.PI,'residential',2);
row(100,[308.7],0,'residential',9);
row(110.7,[309],0,'residential',10);
export const OLD_TOWN_HOUSES:readonly OldTownHouse[]=Object.freeze(houses);
export const OLD_TOWN_FRONTAGES=Object.freeze(OLD_TOWN_VENUES.map(v=>({id:`old-entrance-${v.id}`,width:2.6,points:[p(v.frontX,v.frontZ),p(v.doorX,v.doorZ),p(v.x,v.z)]})));
/** Role paths stay outside the interiors. Workers pause at their real stations. */
export const OLD_TOWN_RESIDENT_LOOP=Object.freeze([p(32,134),p(58,134),p(60,161),p(85,157),p(110,157),p(118,183),p(92,187),p(66,184),p(66,211),p(46,206),p(32,195),p(32,134)]);
