import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { advanceBullet, advancePiercingBullet, circleTouchesWorld, clamp, moveCircle, preventMultipleCircleOverlap } from './game-physics.mjs';
import { advanceTank, createInputQueue, enqueueInputs, consumeInputs } from './tank-motion.mjs';
import { assignProfile } from './player-profile.mjs';
import { createMaze } from './maze.mjs';

const W=1400,H=1000,TANK_R=40,COLLISION_R=48,BULLET_R=16,WIN_SCORE=5,WALL=16,MAX_BULLETS=5;
const SPEEDS={slow:5.4,normal:7.1,fast:8.8};
const POWER_TYPES=['speed','double','shield','mine','rocket','invisible','range','pierce','bulletSpeed','phase'];
const ARENA_THEMES=['neon','desert','ice','space'];
const PLAYER_COLORS=['#17e6ff','#ff3fb4','#ffe04b','#71ff6b'];
const MAP_LAYOUTS={classic:{cols:8,rows:6,extraOpenings:4},narrow:{cols:10,rows:7,extraOpenings:2},open:{cols:6,rows:4,extraOpenings:10},corners:{cols:8,rows:6,extraOpenings:0}};
const REACTIONS=['😄','😎','😱','🔥','💥','👋'];
const app=express();app.use(express.static('dist'));
const http=createServer(app);const io=new Server(http,{cors:{origin:true}});const rooms=new Map();

function roomCode(){let value;do value=Math.random().toString(36).slice(2,6).toUpperCase();while(rooms.has(value));return value}
function arenaFor(layout){return createMaze(W,H,WALL,MAP_LAYOUTS[layout]||MAP_LAYOUTS.classic)}
function freshEffects(){return{speedUntil:0,doubleUntil:0,shieldUntil:0,invisibleUntil:0,rangeUntil:0,bulletSpeedUntil:0,phaseUntil:0,mines:0,rockets:0,pierces:0}}
function placePlayer(player,spawn,angle){Object.assign(player,{x:spawn.x,y:spawn.y,a:angle,turret:angle,cooldown:0,input:{},inputQueue:createInputQueue(),motionProtocol:false,selfHits:0,effects:freshEffects()})}
function newRound(room){
  const arena=arenaFor(room.mapLayout);room.walls=arena.walls;room.spawns=arena.spawns;room.bullets=[];room.trails=[];room.mines=[];room.powerups=[];room.reactions=[];
  const choices=ARENA_THEMES.filter(theme=>theme!==room.theme);room.theme=choices[Math.floor(Math.random()*choices.length)];room.roundId=(room.roundId||0)+1;room.explosion=null;
  room.phase='countdown';room.countdown=3;room.roundStartsAt=Date.now()+3000;room.nextPowerupAt=room.roundStartsAt+4000;
  room.players.forEach((player,index)=>{const spawn=arena.spawns[index],angle=Math.atan2(H/2-spawn.y,W/2-spawn.x);placePlayer(player,spawn,angle)});
}
function publicPlayer(player,now){const{id,input,cooldown,inputQueue,motionProtocol,wasPhasing,...visible}=player;return{...visible,lastProcessedInput:inputQueue?.processed??0,moving:(player.input?.move||0)>.05,effects:{speed:player.effects.speedUntil>now,double:player.effects.doubleUntil>now,shield:player.effects.shieldUntil>now,invisible:player.effects.invisibleUntil>now,range:player.effects.rangeUntil>now,bulletSpeed:player.effects.bulletSpeedUntil>now,phase:player.effects.phaseUntil>now,mines:player.effects.mines,rockets:player.effects.rockets,pierces:player.effects.pierces}}}
function snapshot(room,includeWalls=false){const now=Date.now();return{motionVersion:1,serverTime:now,code:room.code,maxPlayers:room.maxPlayers,mapLayout:room.mapLayout,tankSpeed:room.tankSpeed,selfDamage:room.selfDamage,phase:room.phase,countdown:room.countdown,roundId:room.roundId,theme:room.theme,explosion:room.explosion,players:room.players.map(player=>publicPlayer(player,now)),bullets:room.bullets,trails:room.trails,...(includeWalls?{walls:room.walls}:{}),mines:room.mines,powerups:room.powerups,reactions:room.reactions,winner:room.winner}}
function startIfReady(room){if(room.players.length===room.maxPlayers&&room.players.every(player=>player.ready)){newRound(room);broadcast(room,'game-state',true)}}
function broadcast(room,event='game-state',includeWalls=false){io.to(room.code).emit(event,snapshot(room,includeWalls))}
function returnPlayersToMenu(room){if(rooms.get(room.code)!==room||room.phase!=='match-over')return;io.to(room.code).emit('return-to-menu');for(const player of room.players)io.sockets.sockets.get(player.id)?.leave(room.code);rooms.delete(room.code)}
function endRound(room,winner,loser){if(room.phase!=='playing')return;const target=room.players[loser];room.explosion={x:target.x,y:target.y,color:target.color||PLAYER_COLORS[loser],at:Date.now()};room.players[winner].score++;room.phase='result';room.winner=winner;broadcast(room,'round-result');if(room.players[winner].score>=WIN_SCORE){room.phase='match-over';broadcast(room,'match-result');setTimeout(()=>returnPlayersToMenu(room),4000);return}setTimeout(()=>{if(rooms.has(room.code)){newRound(room);broadcast(room,'game-state',true)}},3000)}

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
  if(type==='range')player.effects.rangeUntil=now+9000;
  if(type==='bulletSpeed')player.effects.bulletSpeedUntil=now+7000;
  if(type==='phase')player.effects.phaseUntil=now+5000;
  if(type==='mine')player.effects.mines=Math.min(2,player.effects.mines+1);
  if(type==='rocket')player.effects.rockets=Math.min(2,player.effects.rockets+1);
  if(type==='pierce')player.effects.pierces=Math.min(2,player.effects.pierces+1);
}
function exitPhaseSafely(room,target){
  const player=room.players[target];if(!circleTouchesWorld(room.walls,player.x,player.y,COLLISION_R,W,H))return;
  for(let radius=6;radius<=180;radius+=6)for(let step=0;step<24;step++){
    const angle=step*Math.PI/12,x=player.x+Math.cos(angle)*radius,y=player.y+Math.sin(angle)*radius;
    if(!circleTouchesWorld(room.walls,x,y,COLLISION_R,W,H)&&!room.players.some((other,index)=>index!==target&&(other.x-x)**2+(other.y-y)**2<96**2)){player.x=x;player.y=y;return}
  }
  Object.assign(player,room.spawns[target]);
}
function addBullet(room,owner,angle,type='normal'){
  const player=room.players[owner],rocket=type==='rocket',piercing=type==='pierce',longRange=player.effects.rangeUntil>Date.now(),boosted=player.effects.bulletSpeedUntil>Date.now(),offset=20,speed=(rocket?8:piercing?7:5.5)*(boosted?1.65:1);
  room.nextBulletId=(room.nextBulletId||0)+1;
  room.bullets.push({id:room.nextBulletId,x:player.x+Math.cos(angle)*offset,y:player.y+Math.sin(angle)*offset,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,radius:rocket?22:piercing?14:BULLET_R,life:rocket?220:piercing?320:longRange?480:300,bounces:0,maxBounces:rocket?3:6,owner,type});
}
function fireForPlayer(room,owner,now=Date.now()){
  const player=room.players[owner];if(!player||player.cooldown>0)return false;
  const active=room.bullets.filter(bullet=>bullet.owner===owner).length,available=MAX_BULLETS-active;if(available<=0)return false;
  player.cooldown=28;player.turret=player.a;
  if(player.effects.pierces>0){player.effects.pierces--;addBullet(room,owner,player.a,'pierce')}
  else if(player.effects.rockets>0){player.effects.rockets--;addBullet(room,owner,player.a,'rocket')}
  else if(player.effects.doubleUntil>now&&available>=2){addBullet(room,owner,player.a-.09);addBullet(room,owner,player.a+.09)}
  else addBullet(room,owner,player.a);
  return true;
}
function updateBot(room,index,now){
  const bot=room.players[index],target=room.players[index===0?1:0];if(!bot||!target)return;
  bot.botThink=(bot.botThink||0)-1;
  if(bot.botThink<=0){
    const direct=Math.atan2(target.y-bot.y,target.x-bot.x),angles=[direct,direct-.42,direct+.42,bot.a-.8,bot.a+.8,direct+Math.PI/2,direct-Math.PI/2];
    let best=bot.a,bestScore=-Infinity;
    for(const angle of angles){const moved=moveCircle(room.walls,bot.x,bot.y,Math.cos(angle)*28,Math.sin(angle)*28,COLLISION_R,W,H),travel=Math.hypot(moved.x-bot.x,moved.y-bot.y),distance=Math.hypot(target.x-moved.x,target.y-moved.y),score=travel*8-distance*.018+Math.random()*8;if(score>bestScore){bestScore=score;best=angle}}
    bot.input={move:.82,heading:best};bot.botThink=10+Math.floor(Math.random()*12);
  }
  const distance=Math.hypot(target.x-bot.x,target.y-bot.y);
  if(distance<1400&&Math.random()<.035)fireForPlayer(room,index,now);
  if(bot.effects.mines>0&&distance<190&&Math.random()<.04){bot.effects.mines--;room.mines.push({x:bot.x,y:bot.y,owner:index,armed:45,life:900})}
}
function absorbOrEnd(room,target,winner){const player=room.players[target];if(player.effects.shieldUntil>Date.now()){player.effects.shieldUntil=0;return false}endRound(room,winner,target);return true}
function selfDamageWinner(room,target){return room.players.findIndex((_,index)=>index!==target)}

function tick(room){
  const now=Date.now();
  if(room.phase==='countdown'){const remaining=Math.max(0,Math.ceil((room.roundStartsAt-now)/1000));if(remaining!==room.countdown){room.countdown=remaining;broadcast(room)}if(remaining===0){room.phase='playing';broadcast(room)}return}
  if(room.phase!=='playing')return;
  if(now>=room.nextPowerupAt&&room.powerups.length<2){spawnPowerup(room);room.nextPowerupAt=now+8000}
  room.players.forEach((player,index)=>{if(player.isBot)updateBot(room,index,now)});
  room.players.forEach((player,index)=>{const phasing=player.effects.phaseUntil>now;if(!phasing&&player.wasPhasing)exitPhaseSafely(room,index);player.wasPhasing=phasing});

  const current=room.players.map(player=>({x:player.x,y:player.y}));
  const proposed=room.players.map((player,index)=>{
    player.cooldown=Math.max(0,player.cooldown-1);
    const speed=room.tankSpeed*(player.effects.speedUntil>now?1.7:1);
    const others=current.filter((_,other)=>other!==index);
    let commands;
    if(player.motionProtocol){
      if(now-(player.lastInputAt||0)>500){player.inputQueue.commands=[];player.inputQueue.processed=player.inputQueue.received;player.input={move:0,heading:player.a}}
      commands=consumeInputs(player.inputQueue);
    }else commands=[!player.isBot&&now-(player.lastInputAt||0)>250?{move:0,heading:player.a}:player.input||{move:0,heading:player.a}];
    let position={x:player.x,y:player.y,a:player.a};
    for(const command of commands){position=advanceTank(position,{move:command.move||0,heading:Number.isFinite(command.heading)?command.heading:position.a},player.effects.phaseUntil>now?[]:room.walls,speed,others);player.input=command}
    player.a=position.a;player.turret=position.a;return position;
  });
  const positions=preventMultipleCircleOverlap(current,proposed,COLLISION_R);room.players.forEach((player,index)=>Object.assign(player,positions[index]));

  for(let playerIndex=0;playerIndex<room.players.length;playerIndex++){
    const player=room.players[playerIndex];
    room.powerups=room.powerups.filter(power=>{if((player.x-power.x)**2+(player.y-power.y)**2<(COLLISION_R+24)**2){grantPower(player,power.type,now);return false}return true});
  }

  room.trails=room.trails.filter(trail=>--trail.life>0);
  room.reactions=room.reactions.filter(reaction=>--reaction.life>0);
  for(const bullet of room.bullets){
    const oldVx=bullet.vx,oldVy=bullet.vy,radius=bullet.radius||BULLET_R,bounced=bullet.type==='pierce'?advancePiercingBullet(bullet,radius,W,H):advanceBullet(bullet,room.walls,radius,W,H);bullet.life--;bullet.bounces+=bounced?1:0;
    if(bounced){const speed=Math.hypot(oldVx,oldVy)||1;room.trails.push({x1:bullet.x-oldVx/speed*52,y1:bullet.y-oldVy/speed*52,x2:bullet.x,y2:bullet.y,x3:bullet.x+bullet.vx/speed*52,y3:bullet.y+bullet.vy/speed*52,owner:bullet.owner,life:18})}
    const hit=room.players.findIndex((player,index)=>(index!==bullet.owner||(room.selfDamage&&bullet.bounces>0))&&(player.x-bullet.x)**2+(player.y-bullet.y)**2<(TANK_R+radius)**2);
    if(hit>=0){
      bullet.life=0;
      if(hit===bullet.owner){
        if(room.players[hit].effects.shieldUntil>now){room.players[hit].effects.shieldUntil=0;continue}
        room.players[hit].selfHits=(room.players[hit].selfHits||0)+1;
        if(room.players[hit].selfHits>=3){endRound(room,selfDamageWinner(room,hit),hit);return}
      }else if(absorbOrEnd(room,hit,bullet.owner))return;
    }
  }
  room.bullets=room.bullets.filter(bullet=>bullet.life>0&&bullet.bounces<=bullet.maxBounces);

  for(const mine of room.mines){mine.life--;mine.armed--;if(mine.armed>0)continue;const hit=room.players.findIndex((player,index)=>index!==mine.owner&&(player.x-mine.x)**2+(player.y-mine.y)**2<(COLLISION_R+25)**2);if(hit>=0){mine.life=0;if(absorbOrEnd(room,hit,mine.owner))return}}
  room.mines=room.mines.filter(mine=>mine.life>0);room.networkTick=(room.networkTick||0)+1;if(room.networkTick%3===0)io.to(room.code).volatile.emit('game-state',snapshot(room));
}

io.on('connection',socket=>{
  socket.on('latency-probe',reply=>{if(typeof reply==='function')reply()});
  socket.on('create-room',({speed,players,layout,selfDamage,profile}={})=>{const code=roomCode(),maxPlayers=clamp(Math.round(Number(players)||2),2,4),mapLayout=MAP_LAYOUTS[layout]?layout:'classic',tankSpeed=SPEEDS[speed]||SPEEDS.normal,arena=arenaFor(mapLayout),room={code,maxPlayers,mapLayout,tankSpeed,selfDamage:selfDamage===true,theme:'neon',roundId:0,explosion:null,spawns:arena.spawns,players:[{...assignProfile(profile),id:socket.id,ready:false,x:arena.spawns[0].x,y:arena.spawns[0].y,a:.78,turret:.78,score:0,input:{},cooldown:0,selfHits:0,effects:freshEffects()}],walls:arena.walls,bullets:[],trails:[],mines:[],powerups:[],reactions:[],phase:'waiting'};rooms.set(code,room);socket.join(code);socket.emit('room-joined',{code,slot:0,state:snapshot(room,true)})});
  socket.on('create-bot-game',({speed,profile}={})=>{const code=roomCode(),tankSpeed=SPEEDS[speed]||SPEEDS.normal,arena=arenaFor('classic'),room={code,maxPlayers:2,mapLayout:'classic',tankSpeed,selfDamage:false,theme:'neon',roundId:0,explosion:null,spawns:arena.spawns,players:[{...assignProfile(profile),id:socket.id,ready:true,score:0,effects:freshEffects()},{...assignProfile({name:'Bot',badge:'◆'},[assignProfile(profile)]),id:`bot-${code}`,isBot:true,ready:true,score:0,effects:freshEffects()}],walls:arena.walls,bullets:[],trails:[],mines:[],powerups:[],reactions:[],phase:'waiting'};newRound(room);rooms.set(code,room);socket.join(code);socket.emit('room-joined',{code,slot:0,state:snapshot(room,true)});broadcast(room)});
  socket.on('join-room',raw=>{const code=String((typeof raw==='string'?raw:raw?.code)||'').trim().toUpperCase(),room=rooms.get(code);if(!room)return socket.emit('room-error','Oda bulunamadı.');if(room.players.length>=room.maxPlayers)return socket.emit('room-error','Bu oda dolu.');const slot=room.players.length,spawn=room.spawns[slot];room.players.push({...assignProfile(raw?.profile,room.players),id:socket.id,ready:false,x:spawn.x,y:spawn.y,a:0,turret:0,score:0,input:{},cooldown:0,effects:freshEffects()});socket.join(code);socket.emit('room-joined',{code,slot,state:snapshot(room,true)});broadcast(room)});
  socket.on('set-ready',({code,ready})=>{const room=rooms.get(code),player=room?.players.find(item=>item.id===socket.id);if(!player||room.phase!=='waiting')return;player.ready=Boolean(ready);broadcast(room);startIfReady(room)});
  socket.on('reaction',({code,emoji})=>{const room=rooms.get(code),owner=room?.players.findIndex(item=>item.id===socket.id),player=room?.players[owner],now=Date.now();if(!player||room.phase!=='playing'||!REACTIONS.includes(emoji)||now-(player.lastReaction||0)<850)return;player.lastReaction=now;room.reactions.push({owner,emoji,x:player.x,y:player.y-74,life:105});broadcast(room)});
  socket.on('input-batch',({code,roundId,commands}={})=>{
    const room=rooms.get(code),player=room?.players.find(item=>item.id===socket.id);
    if(!player||room.phase!=='playing'||roundId!==room.roundId)return;
    player.inputQueue??=createInputQueue();player.motionProtocol=true;
    const before=player.inputQueue.received;enqueueInputs(player.inputQueue,commands);
    if(player.inputQueue.received>before)player.lastInputAt=Date.now();
  });
  socket.on('player-input',({code,input})=>{const room=rooms.get(code),player=room?.players.find(item=>item.id===socket.id);if(player&&!player.motionProtocol&&room.phase==='playing'){player.lastInputAt=Date.now();player.input={move:clamp(Number(input.move)||0,0,1),heading:Number.isFinite(input.heading)?Number(input.heading):player.a}}});
  socket.on('fire',({code})=>{const room=rooms.get(code),owner=room?.players.findIndex(player=>player.id===socket.id);if(!room||owner<0||room.phase!=='playing')return;if(fireForPlayer(room,owner))broadcast(room)});
  socket.on('deploy-mine',({code})=>{const room=rooms.get(code),owner=room?.players.findIndex(player=>player.id===socket.id),player=room?.players[owner];if(!player||room.phase!=='playing'||player.effects.mines<=0)return;const behind={x:player.x-Math.cos(player.a)*52,y:player.y-Math.sin(player.a)*52},position=circleTouchesWorld(room.walls,behind.x,behind.y,22,W,H)?player:behind;player.effects.mines--;room.mines.push({x:position.x,y:position.y,owner,armed:45,life:900});broadcast(room)});
  socket.on('leave-room',({code})=>{const room=rooms.get(code);if(!room||!room.players.some(player=>player.id===socket.id))return;socket.leave(code);if(room.players.length===1){rooms.delete(code);return}room.phase='disconnected';broadcast(room,'player-disconnected');setTimeout(()=>{if(rooms.get(room.code)===room)rooms.delete(room.code)},10000)});
  socket.on('disconnect',()=>{for(const room of rooms.values()){if(!room.players.some(player=>player.id===socket.id))continue;room.phase='disconnected';broadcast(room,'player-disconnected');setTimeout(()=>{if(rooms.get(room.code)===room)rooms.delete(room.code)},10000)}});
});
let previousTick=performance.now(),accumulator=0;
setInterval(()=>{
  const now=performance.now();accumulator=Math.min(100,accumulator+now-previousTick);previousTick=now;
  while(accumulator>=1000/60){rooms.forEach(tick);accumulator-=1000/60}
},4);
http.listen(process.env.PORT||3000,()=>console.log('Tank server running'));
