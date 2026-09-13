import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { advanceBullet, circleTouchesWorld, clamp, moveCircle, preventCircleOverlap } from './game-physics.mjs';
import { createMaze } from './maze.mjs';

const W=1400,H=1000,TANK_R=40,COLLISION_R=48,BULLET_R=16,WIN_SCORE=5,WALL=16,MAX_BULLETS=5;
const SPEEDS={slow:3.3,normal:4.6,fast:6.1};
const POWER_TYPES=['speed','double','shield','mine','rocket','invisible'];
const app=express();app.use(express.static('dist'));
const http=createServer(app);const io=new Server(http,{cors:{origin:true}});const rooms=new Map();

function roomCode(){let value;do value=Math.random().toString(36).slice(2,6).toUpperCase();while(rooms.has(value));return value}
function freshEffects(){return{speedUntil:0,doubleUntil:0,shieldUntil:0,invisibleUntil:0,mines:0,rockets:0}}
function placePlayer(player,spawn,angle){Object.assign(player,{x:spawn.x,y:spawn.y,a:angle,turret:angle,cooldown:0,input:{},effects:freshEffects()})}
function newRound(room){
  const arena=createMaze(W,H,WALL);room.walls=arena.walls;room.spawns=arena.spawns;room.bullets=[];room.trails=[];room.mines=[];room.powerups=[];
  room.phase='countdown';room.countdown=3;room.roundStartsAt=Date.now()+3000;room.nextPowerupAt=room.roundStartsAt+4000;
  placePlayer(room.players[0],arena.spawns[0],Math.PI/4);placePlayer(room.players[1],arena.spawns[1],-3*Math.PI/4);
}
function publicPlayer(player,now){const{id,input,cooldown,...visible}=player;return{...visible,effects:{speed:player.effects.speedUntil>now,double:player.effects.doubleUntil>now,shield:player.effects.shieldUntil>now,invisible:player.effects.invisibleUntil>now,mines:player.effects.mines,rockets:player.effects.rockets}}}
function snapshot(room){const now=Date.now();return{code:room.code,phase:room.phase,countdown:room.countdown,players:room.players.map(player=>publicPlayer(player,now)),bullets:room.bullets,trails:room.trails,walls:room.walls,mines:room.mines,powerups:room.powerups,winner:room.winner}}
function broadcast(room,event='game-state'){io.to(room.code).emit(event,snapshot(room))}
function endRound(room,winner){if(room.phase!=='playing')return;room.players[winner].score++;room.phase='result';room.winner=winner;broadcast(room,'round-result');if(room.players[winner].score>=WIN_SCORE){room.phase='match-over';broadcast(room,'match-result');return}setTimeout(()=>{if(rooms.has(room.code)){newRound(room);broadcast(room)}},3000)}

function spawnPowerup(room){
  for(let attempt=0;attempt<100;attempt++){
    const x=80+Math.random()*(W-160),y=80+Math.random()*(H-160);
    if(circleTouchesWorld(room.walls,x,y,28,W,H))continue;
    if(room.players.some(player=>(player.x-x)**2+(player.y-y)**2<150**2))continue;
    if(room.powerups.some(power=>(power.x-x)**2+(power.y-y)**2<100**2))continue;
    room.powerups.push({id:`${Date.now()}-${Math.random()}`,x,y,type:POWER_TYPES[Math.floor(Math.random()*POWER_TYPES.length)]});return;
  }
}
function grantPower(player,type,now){
  if(type==='speed')player.effects.speedUntil=now+7000;
  if(type==='double')player.effects.doubleUntil=now+8000;
  if(type==='shield')player.effects.shieldUntil=now+8000;
  if(type==='invisible')player.effects.invisibleUntil=now+5000;
  if(type==='mine')player.effects.mines=Math.min(2,player.effects.mines+1);
  if(type==='rocket')player.effects.rockets=Math.min(2,player.effects.rockets+1);
}
function addBullet(room,owner,angle,type='normal'){
  const player=room.players[owner],rocket=type==='rocket',offset=20;
  room.bullets.push({x:player.x+Math.cos(angle)*offset,y:player.y+Math.sin(angle)*offset,vx:Math.cos(angle)*(rocket?8:5.5),vy:Math.sin(angle)*(rocket?8:5.5),radius:rocket?22:BULLET_R,life:rocket?180:230,bounces:0,maxBounces:rocket?3:6,owner,type});
}
function absorbOrEnd(room,target,winner){const player=room.players[target];if(player.effects.shieldUntil>Date.now()){player.effects.shieldUntil=0;return false}endRound(room,winner);return true}

function tick(room){
  const now=Date.now();
  if(room.phase==='countdown'){const remaining=Math.max(0,Math.ceil((room.roundStartsAt-now)/1000));if(remaining!==room.countdown){room.countdown=remaining;broadcast(room)}if(remaining===0){room.phase='playing';broadcast(room)}return}
  if(room.phase!=='playing')return;
  if(now>=room.nextPowerupAt&&room.powerups.length<2){spawnPowerup(room);room.nextPowerupAt=now+8000}

  const current=room.players.map(player=>({x:player.x,y:player.y}));
  const proposed=room.players.map(player=>{player.cooldown=Math.max(0,player.cooldown-1);const input=player.input||{};if(Number.isFinite(input.heading))player.a=input.heading;player.turret=player.a;const boost=player.effects.speedUntil>now?1.55:1;const speed=clamp(input.move||0,0,1)*room.tankSpeed/2*boost;return moveCircle(room.walls,player.x,player.y,Math.cos(player.a)*speed,Math.sin(player.a)*speed,COLLISION_R,W,H)});
  const positions=preventCircleOverlap(current,proposed,COLLISION_R);room.players.forEach((player,index)=>Object.assign(player,positions[index]));

  for(let playerIndex=0;playerIndex<room.players.length;playerIndex++){
    const player=room.players[playerIndex];
    room.powerups=room.powerups.filter(power=>{if((player.x-power.x)**2+(player.y-power.y)**2<(COLLISION_R+24)**2){grantPower(player,power.type,now);return false}return true});
  }

  room.trails=room.trails.filter(trail=>--trail.life>0);
  for(const bullet of room.bullets){
    const oldVx=bullet.vx,oldVy=bullet.vy,radius=bullet.radius||BULLET_R,bounced=advanceBullet(bullet,room.walls,radius,W,H);bullet.life--;bullet.bounces+=bounced?1:0;
    if(bounced){const speed=Math.hypot(oldVx,oldVy)||1;room.trails.push({x1:bullet.x-oldVx/speed*52,y1:bullet.y-oldVy/speed*52,x2:bullet.x,y2:bullet.y,x3:bullet.x+bullet.vx/speed*52,y3:bullet.y+bullet.vy/speed*52,owner:bullet.owner,life:18})}
    const hit=room.players.findIndex((player,index)=>index!==bullet.owner&&(player.x-bullet.x)**2+(player.y-bullet.y)**2<(TANK_R+radius)**2);
    if(hit>=0){bullet.life=0;if(absorbOrEnd(room,hit,bullet.owner))return}
  }
  room.bullets=room.bullets.filter(bullet=>bullet.life>0&&bullet.bounces<=bullet.maxBounces);

  for(const mine of room.mines){mine.life--;mine.armed--;if(mine.armed>0)continue;const hit=room.players.findIndex((player,index)=>index!==mine.owner&&(player.x-mine.x)**2+(player.y-mine.y)**2<(COLLISION_R+25)**2);if(hit>=0){mine.life=0;if(absorbOrEnd(room,hit,mine.owner))return}}
  room.mines=room.mines.filter(mine=>mine.life>0);broadcast(room);
}

io.on('connection',socket=>{
  socket.on('create-room',({speed}={})=>{const code=roomCode(),tankSpeed=SPEEDS[speed]||SPEEDS.normal,arena=createMaze(W,H,WALL),room={code,tankSpeed,spawns:arena.spawns,players:[{id:socket.id,x:arena.spawns[0].x,y:arena.spawns[0].y,a:.78,turret:.78,score:0,input:{},cooldown:0,effects:freshEffects()}],walls:arena.walls,bullets:[],trails:[],mines:[],powerups:[],phase:'waiting'};rooms.set(code,room);socket.join(code);socket.emit('room-joined',{code,slot:0,state:snapshot(room)})});
  socket.on('join-room',raw=>{const code=String(raw||'').toUpperCase(),room=rooms.get(code);if(!room)return socket.emit('room-error','Oda bulunamadı.');if(room.players.length>=2)return socket.emit('room-error','Bu oda dolu.');room.players.push({id:socket.id,x:room.spawns[1].x,y:room.spawns[1].y,a:-2.36,turret:-2.36,score:0,input:{},cooldown:0,effects:freshEffects()});socket.join(code);newRound(room);socket.emit('room-joined',{code,slot:1,state:snapshot(room)});broadcast(room)});
  socket.on('player-input',({code,input})=>{const room=rooms.get(code),player=room?.players.find(item=>item.id===socket.id);if(player&&room.phase==='playing')player.input={move:clamp(Number(input.move)||0,0,1),heading:Number.isFinite(input.heading)?Number(input.heading):player.a}});
  socket.on('fire',({code})=>{const room=rooms.get(code),owner=room?.players.findIndex(player=>player.id===socket.id),player=room?.players[owner];if(!player||room.phase!=='playing'||player.cooldown>0)return;const active=room.bullets.filter(bullet=>bullet.owner===owner).length,available=MAX_BULLETS-active;if(available<=0)return;player.cooldown=28;player.turret=player.a;if(player.effects.rockets>0){player.effects.rockets--;addBullet(room,owner,player.a,'rocket')}else if(player.effects.doubleUntil>Date.now()&&available>=2){addBullet(room,owner,player.a-.09);addBullet(room,owner,player.a+.09)}else addBullet(room,owner,player.a);broadcast(room)});
  socket.on('deploy-mine',({code})=>{const room=rooms.get(code),owner=room?.players.findIndex(player=>player.id===socket.id),player=room?.players[owner];if(!player||room.phase!=='playing'||player.effects.mines<=0)return;const behind={x:player.x-Math.cos(player.a)*52,y:player.y-Math.sin(player.a)*52},position=circleTouchesWorld(room.walls,behind.x,behind.y,22,W,H)?player:behind;player.effects.mines--;room.mines.push({x:position.x,y:position.y,owner,armed:45,life:900});broadcast(room)});
  socket.on('leave-room',({code})=>{const room=rooms.get(code);if(!room||!room.players.some(player=>player.id===socket.id))return;socket.leave(code);if(room.players.length===1){rooms.delete(code);return}room.phase='disconnected';broadcast(room,'player-disconnected');setTimeout(()=>{if(rooms.get(room.code)===room)rooms.delete(room.code)},10000)});
  socket.on('disconnect',()=>{for(const room of rooms.values()){if(!room.players.some(player=>player.id===socket.id))continue;room.phase='disconnected';broadcast(room,'player-disconnected');setTimeout(()=>{if(rooms.get(room.code)===room)rooms.delete(room.code)},10000)}});
});
setInterval(()=>rooms.forEach(tick),1000/60);
http.listen(process.env.PORT||3000,()=>console.log('Tank server running'));
