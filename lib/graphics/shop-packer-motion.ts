/** A visual delivery cycle anchored to a real, uncollected resource order. */
export function shopPackerMotion(ageSeconds:number,resourceOrder:boolean){
 const idle={phase:'idle',z:153,yaw:Math.PI,walking:false,working:false,carrying:false};
 if(!resourceOrder||!Number.isFinite(ageSeconds)||ageSeconds<0||ageSeconds>=24)return idle;
 if(ageSeconds<2)return{...idle,phase:'pick',yaw:0,working:true};
 if(ageSeconds<8)return{...idle,phase:'carry',z:153+(ageSeconds-2)*.35,yaw:0,walking:true,carrying:true};
 if(ageSeconds<16)return{...idle,phase:'pack',z:155.1,yaw:0,working:true};
 if(ageSeconds<22)return{...idle,phase:'return',z:155.1-(ageSeconds-16)*.35,walking:true};
 return idle;
}
