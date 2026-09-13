import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';

const W = 1400, H = 1000, TANK_R = 40, WIN_SCORE = 5, WALL = 16;
const SPEEDS = { slow: 3.3, normal: 4.6, fast: 6.1 };
const app = express(); app.use(express.static('dist'));
const http = createServer(app); const io = new Server(http, { cors: { origin: true } });
const rooms = new Map();
const clamps=(v,a,b)=>Math.max(a,Math.min(b,v));
function code(){ let c; do c=Math.random().toString(36).slice(2,6).toUpperCase(); while(rooms.has(c)); return c }
function maze() { // Tank Trouble tarzı: ince, açık koridor duvarları
  const walls=[], spawns=[{x:150,y:150},{x:1250,y:850}];
  let attempts=0;
  while(walls.length<19&&attempts++<180){
    const vertical=Math.random()>.48;
    const length=140+Math.floor(Math.random()*190);
    const w=vertical?WALL:length,h=vertical?length:WALL;
    const x=70+Math.floor(Math.random()*(W-w-140));
    const y=70+Math.floor(Math.random()*(H-h-140));
    const candidate={x,y,w,h};
    if(spawns.some(s=>collides(s.x,s.y,105,candidate)))continue;
    if(walls.some(existing=>Math.abs(existing.x-x)<18&&Math.abs(existing.y-y)<18))continue;
    walls.push(candidate);
  }
  return walls;
}
function newRound(room){ room.walls=maze(); room.bullets=[]; room.phase='playing'; room.players[0].x=150;room.players[0].y=150;room.players[0].a=Math.PI/4;room.players[0].turret=Math.PI/4;room.players[1].x=1250;room.players[1].y=850;room.players[1].a=-3*Math.PI/4;room.players[1].turret=-3*Math.PI/4; room.players.forEach(p=>p.cooldown=0); }
function snapshot(room){ return { code:room.code, phase:room.phase, players:room.players.map(({id,input,cooldown,...p})=>p), bullets:room.bullets, walls:room.walls, winner:room.winner }; }
function broadcast(room,event='game-state'){ io.to(room.code).emit(event,snapshot(room)); }
function collides(x,y,r,w){ const px=clamps(x,w.x,w.x+w.w),py=clamps(y,w.y,w.y); return (x-px)**2+(y-py)**2<r*r; }
function blocked(room,x,y){return x<TANK_R||y<TANK_R||x>W-TANK_R||y>H-TANK_R||room.walls.some(w=>collides(x,y,TANK_R,w));}
function endRound(room,winner){ if(room.phase!=='playing')return; room.players[winner].score++; room.phase='result';room.winner=winner; broadcast(room,'round-result'); if(room.players[winner].score>=WIN_SCORE){room.phase='match-over';broadcast(room,'match-result');return} setTimeout(()=>{if(rooms.has(room.code)){newRound(room);broadcast(room)}},3000); }
function tick(room){ if(room.phase!=='playing')return; for(const p of room.players){p.cooldown=Math.max(0,p.cooldown-1);const i=p.input||{}; if(Number.isFinite(i.heading))p.a=i.heading;if(Number.isFinite(i.aim))p.turret=i.aim; const speed=clamps(i.move||0,0,1)*room.tankSpeed/2; const nx=p.x+Math.cos(p.a)*speed,ny=p.y+Math.sin(p.a)*speed;if(!blocked(room,nx,ny)){p.x=nx;p.y=ny;} }
 for(const b of room.bullets){let nx=b.x+b.vx,ny=b.y+b.vy;let bounced=false;const hitX=b.x+b.vx<7||b.x+b.vx>W-7||room.walls.some(w=>collides(b.x+b.vx,b.y,7,w));const hitY=b.y+b.vy<7||b.y+b.vy>H-7||room.walls.some(w=>collides(b.x,b.y+b.vy,7,w));if(hitX){b.vx*=-1;bounced=true}if(hitY){b.vy*=-1;bounced=true}if(!hitX&&!hitY){b.x=nx;b.y=ny}b.life--;b.bounces+=bounced?1:0; const hit=room.players.findIndex((p,j)=>j!==b.owner&&(p.x-b.x)**2+(p.y-b.y)**2<(TANK_R+7)**2);if(hit>=0){endRound(room,b.owner);return;}}
 room.bullets=room.bullets.filter(b=>b.life>0&&b.bounces<=6); broadcast(room); }
io.on('connection', socket=>{
 socket.on('create-room',({speed}={})=>{const c=code(),tankSpeed=SPEEDS[speed]||SPEEDS.normal,room={code:c,tankSpeed,players:[{id:socket.id,x:150,y:150,a:.78,turret:.78,score:0,input:{},cooldown:0}],walls:maze(),bullets:[],phase:'waiting'};rooms.set(c,room);socket.join(c);socket.emit('room-joined',{code:c,slot:0,state:snapshot(room)});});
 socket.on('join-room', raw=>{const c=String(raw||'').toUpperCase(),room=rooms.get(c);if(!room)return socket.emit('room-error','Oda bulunamadı.');if(room.players.length>=2)return socket.emit('room-error','Bu oda dolu.');room.players.push({id:socket.id,x:1250,y:850,a:-2.36,turret:-2.36,score:0,input:{},cooldown:0});socket.join(c);newRound(room);socket.emit('room-joined',{code:c,slot:1,state:snapshot(room)});broadcast(room);});
 socket.on('player-input',({code: c,input})=>{const r=rooms.get(c);const p=r?.players.find(p=>p.id===socket.id);if(p&&r.phase==='playing')p.input={move:clamps(Number(input.move)||0,0,1),heading:Number.isFinite(input.heading)?Number(input.heading):p.a,aim:Number.isFinite(input.aim)?Number(input.aim):p.turret};});
 socket.on('fire',({code:c,angle})=>{const r=rooms.get(c),idx=r?.players.findIndex(p=>p.id===socket.id),p=r?.players[idx];if(!p||r.phase!=='playing'||p.cooldown>0||r.bullets.filter(b=>b.owner===idx).length>=5)return;const a=Number.isFinite(angle)?angle:p.turret;p.turret=a;p.cooldown=28;r.bullets.push({x:p.x+Math.cos(a)*54,y:p.y+Math.sin(a)*54,vx:Math.cos(a)*5.5,vy:Math.sin(a)*5.5,life:230,bounces:0,owner:idx});});
 socket.on('disconnect',()=>{for(const r of rooms.values()){const i=r.players.findIndex(p=>p.id===socket.id);if(i<0)continue;r.phase='disconnected';broadcast(r,'player-disconnected');setTimeout(()=>{if(rooms.get(r.code)===r)rooms.delete(r.code)},10000)}});
});
setInterval(()=>rooms.forEach(tick),1000/60);
http.listen(process.env.PORT||3000,()=>console.log('Tank server running'));
