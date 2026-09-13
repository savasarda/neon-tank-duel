import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { advanceBullet, clamp as clamps, moveCircle, preventCircleOverlap } from './game-physics.mjs';
import { createMaze } from './maze.mjs';

const W = 1400, H = 1000, TANK_R = 40, BULLET_R = 16, WIN_SCORE = 5, WALL = 16;
const SPEEDS = { slow: 3.3, normal: 4.6, fast: 6.1 };
const app = express(); app.use(express.static('dist'));
const http = createServer(app); const io = new Server(http, { cors: { origin: true } });
const rooms = new Map();
function code(){ let c; do c=Math.random().toString(36).slice(2,6).toUpperCase(); while(rooms.has(c)); return c }
function placePlayer(player, spawn, angle){ player.x=spawn.x;player.y=spawn.y;player.a=angle;player.turret=angle;player.cooldown=0;player.input={}; }
function newRound(room){ const arena=createMaze(W,H,WALL);room.walls=arena.walls;room.spawns=arena.spawns;room.bullets=[];room.trails=[];room.phase='countdown';room.countdown=3;room.roundStartsAt=Date.now()+3000;placePlayer(room.players[0],arena.spawns[0],Math.PI/4);placePlayer(room.players[1],arena.spawns[1],-3*Math.PI/4); }
function snapshot(room){ return { code:room.code, phase:room.phase, countdown:room.countdown, players:room.players.map(({id,input,cooldown,...p})=>p), bullets:room.bullets, trails:room.trails, walls:room.walls, winner:room.winner }; }
function broadcast(room,event='game-state'){ io.to(room.code).emit(event,snapshot(room)); }
function endRound(room,winner){ if(room.phase!=='playing')return; room.players[winner].score++; room.phase='result';room.winner=winner; broadcast(room,'round-result'); if(room.players[winner].score>=WIN_SCORE){room.phase='match-over';broadcast(room,'match-result');return} setTimeout(()=>{if(rooms.has(room.code)){newRound(room);broadcast(room)}},3000); }
function tick(room){
 if(room.phase==='countdown'){const remaining=Math.max(0,Math.ceil((room.roundStartsAt-Date.now())/1000));if(remaining!==room.countdown){room.countdown=remaining;broadcast(room)}if(remaining===0){room.phase='playing';broadcast(room)}return}
 if(room.phase!=='playing')return;
 const current=room.players.map(p=>({x:p.x,y:p.y}));
 const proposed=room.players.map(p=>{p.cooldown=Math.max(0,p.cooldown-1);const i=p.input||{};if(Number.isFinite(i.heading))p.a=i.heading;p.turret=p.a;const speed=clamps(i.move||0,0,1)*room.tankSpeed/2;return moveCircle(room.walls,p.x,p.y,Math.cos(p.a)*speed,Math.sin(p.a)*speed,TANK_R+8,W,H)});
 const positions=preventCircleOverlap(current,proposed,TANK_R+8);room.players.forEach((p,index)=>{p.x=positions[index].x;p.y=positions[index].y});
 room.trails=room.trails.filter(trail=>--trail.life>0);
 for(const b of room.bullets){const oldVx=b.vx,oldVy=b.vy;const bounced=advanceBullet(b,room.walls,BULLET_R,W,H);b.life--;b.bounces+=bounced?1:0;if(bounced){const speed=Math.hypot(oldVx,oldVy)||1;room.trails.push({x1:b.x-oldVx/speed*52,y1:b.y-oldVy/speed*52,x2:b.x,y2:b.y,x3:b.x+b.vx/speed*52,y3:b.y+b.vy/speed*52,owner:b.owner,life:18})}const hit=room.players.findIndex((p,j)=>j!==b.owner&&(p.x-b.x)**2+(p.y-b.y)**2<(TANK_R+BULLET_R)**2);if(hit>=0){endRound(room,b.owner);return;}}
 room.bullets=room.bullets.filter(b=>b.life>0&&b.bounces<=6);broadcast(room); }
io.on('connection', socket=>{
 socket.on('create-room',({speed}={})=>{const c=code(),tankSpeed=SPEEDS[speed]||SPEEDS.normal,arena=createMaze(W,H,WALL),room={code:c,tankSpeed,spawns:arena.spawns,players:[{id:socket.id,x:arena.spawns[0].x,y:arena.spawns[0].y,a:.78,turret:.78,score:0,input:{},cooldown:0}],walls:arena.walls,bullets:[],trails:[],phase:'waiting'};rooms.set(c,room);socket.join(c);socket.emit('room-joined',{code:c,slot:0,state:snapshot(room)});});
 socket.on('join-room', raw=>{const c=String(raw||'').toUpperCase(),room=rooms.get(c);if(!room)return socket.emit('room-error','Oda bulunamadı.');if(room.players.length>=2)return socket.emit('room-error','Bu oda dolu.');room.players.push({id:socket.id,x:room.spawns[1].x,y:room.spawns[1].y,a:-2.36,turret:-2.36,score:0,input:{},cooldown:0});socket.join(c);newRound(room);socket.emit('room-joined',{code:c,slot:1,state:snapshot(room)});broadcast(room);});
 socket.on('player-input',({code: c,input})=>{const r=rooms.get(c);const p=r?.players.find(p=>p.id===socket.id);if(p&&r.phase==='playing')p.input={move:clamps(Number(input.move)||0,0,1),heading:Number.isFinite(input.heading)?Number(input.heading):p.a};});
 socket.on('fire',({code:c})=>{const r=rooms.get(c),idx=r?.players.findIndex(p=>p.id===socket.id),p=r?.players[idx];if(!p||r.phase!=='playing'||p.cooldown>0||r.bullets.filter(b=>b.owner===idx).length>=5)return;const a=p.a;p.turret=a;p.cooldown=28;r.bullets.push({x:p.x+Math.cos(a)*54,y:p.y+Math.sin(a)*54,vx:Math.cos(a)*5.5,vy:Math.sin(a)*5.5,life:230,bounces:0,owner:idx});broadcast(r);});
 socket.on('leave-room',({code:c})=>{const r=rooms.get(c);if(!r||!r.players.some(p=>p.id===socket.id))return;socket.leave(c);if(r.players.length===1){rooms.delete(c);return}r.phase='disconnected';broadcast(r,'player-disconnected');setTimeout(()=>{if(rooms.get(r.code)===r)rooms.delete(r.code)},10000);});
 socket.on('disconnect',()=>{for(const r of rooms.values()){const i=r.players.findIndex(p=>p.id===socket.id);if(i<0)continue;r.phase='disconnected';broadcast(r,'player-disconnected');setTimeout(()=>{if(rooms.get(r.code)===r)rooms.delete(r.code)},10000)}});
});
setInterval(()=>rooms.forEach(tick),1000/60);
http.listen(process.env.PORT||3000,()=>console.log('Tank server running'));
