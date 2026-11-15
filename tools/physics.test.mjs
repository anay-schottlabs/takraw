import * as P from '../physics.js';
const t0=performance.now();
const show=(name,v,target)=>{const r=P.simulate(v,5);const ev=r.events.map(e=>e.type).join(',');
 console.log(name.padEnd(28),'land',r.end&&[r.end.x.toFixed(2),r.end.z.toFixed(2)].join(','),'target',[target.x,target.z].join(','),'events',ev,'speed',Math.hypot(v.vx,v.vy,v.vz).toFixed(1),'t',r.t.toFixed(2));};
// set to self from knee height
let from={x:-3,y:0.7,z:0}; let tg={x:-1.2,y:0,z:0.3}; show('set (no net)',P.solveApex(from,tg,3.0,false),tg);
// lob return touch 1 to deep
tg={x:5.6,z:-2.1}; show('lob deep-left',P.solveApex(from,tg,3.6),tg);
// flat kick after set
from={x:-1.5,y:0.7,z:0}; tg={x:3.4,z:2.1}; show('kick mid-right apex2.55',P.solveApex(from,tg,2.55),tg);
// drop shot
tg={x:1.3,z:0}; show('drop',P.solveApex(from,tg,2.55),tg);
// spike near net high
from={x:-0.8,y:2.4,z:0}; tg={x:3.4,z:0}; show('spike V27 mid',P.solveSpeed(from,tg,27),tg);
tg={x:1.3,z:1}; show('spike V27 drop (must clear)',P.solveSpeed(from,tg,27),tg);
// spike from low & far -> raised
from={x:-3,y:1.9,z:0}; tg={x:2,z:0}; show('spike low/far',P.solveSpeed(from,tg,22),tg);
// serve
from={x:-4.25,y:0.9,z:0}; tg={x:5.6,z:0}; show('serve apex 2.35',P.solveApex(from,tg,2.35),tg);
// net hit test
show('into net',{x:-2,y:1.0,z:0,vx:8,vy:1,vz:0},{x:0,z:0});
show('wide',{x:-2,y:2,z:3.2,vx:8,vy:2,vz:1},{x:0,z:0});
console.log('ms',(performance.now()-t0).toFixed(0));
