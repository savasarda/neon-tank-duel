import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io, Socket } from 'socket.io-client';
import './style.css';
import { TANK_COLORS, BADGES } from '../player-profile.mjs';
import { advanceTank, replayTank, STEP_MS, MAX_PENDING, type Command } from '../tank-motion.mjs';

type Effects={speed:boolean;double:boolean;shield:boolean;invisible:boolean;range:boolean;bulletSpeed:boolean;phase:boolean;mines:number;rockets:number;pierces:number};
type Player={name?:string;color?:string;badge?:string;lastProcessedInput?:number;x:number;y:number;a:number;turret:number;score:number;selfHits?:number;ready?:boolean;moving?:boolean;isBot?:boolean;effects?:Effects};
type Wall={x:number;y:number;w:number;h:number};
type Bullet={id:number;bounces:number;x:number;y:number;vx:number;vy:number;owner:number;type?:string;radius?:number};
type Trail={x1:number;y1:number;x2:number;y2:number;x3:number;y3:number;owner:number;life:number};
type Powerup={id:string;x:number;y:number;type:string};type Mine={x:number;y:number;owner:number;armed:number};
type Explosion={x:number;y:number;color:string;at:number};
type Reaction={owner:number;emoji:string;x:number;y:number;life:number};
type State={code:string;maxPlayers?:number;mapLayout?:string;tankSpeed?:number;selfDamage?:boolean;serverTime?:number;phase:string;countdown?:number;roundId?:number;theme?:string;explosion?:Explosion|null;players:Player[];walls?:Wall[];bullets:Bullet[];trails?:Trail[];powerups?:Powerup[];mines?:Mine[];reactions?:Reaction[];winner?:number};

const W=1400,H=1000;
const PLAYER_COLORS=['#17e6ff','#ff3fb4','#ffe04b','#71ff6b'];
const playerColor=(player:Player|undefined,index:number)=>player?.color??PLAYER_COLORS[index]??'#fff';
const playerName=(player:Player|undefined,index:number)=>player?.name??`Oyuncu ${index+1}`;
type Profile={name:string;color:string;badge:string};
function loadProfile():Profile {
  try {const saved=JSON.parse(localStorage.getItem('neon-tank-profile')??'{}');return {name:typeof saved.name==='string'?saved.name.slice(0,12):'',color:TANK_COLORS.some(c=>c.value===saved.color)?saved.color:TANK_COLORS[0].value,badge:BADGES.some(b=>b.value===saved.badge)?saved.badge:BADGES[0].value}}catch{return{name:'',color:TANK_COLORS[0].value,badge:BADGES[0].value}}
}
const nameplates=new Map<string,HTMLCanvasElement>();
function drawNameplate(ctx:CanvasRenderingContext2D,player:Player,index:number,slot:number){
  if(player.effects?.invisible&&index!==slot)return;
  const color=playerColor(player,index),text=`${player.badge??'★'} ${playerName(player,index)}${slot===index?' · SEN':''}`,key=color+text;
  let label=nameplates.get(key);
  if(!label){label=document.createElement('canvas');const c=label.getContext('2d')!;c.font='bold 26px Arial';label.width=Math.ceil(c.measureText(text).width)+20;label.height=38;c.font='bold 26px Arial';c.fillStyle='#050916e8';c.fillRect(0,0,label.width,38);c.fillStyle=color;c.textBaseline='middle';c.fillText(text,10,20);if(nameplates.size>=32)nameplates.clear();nameplates.set(key,label)}
  const factor=Math.max(1,11*(ctx.canvas.width/Math.max(1,ctx.canvas.clientWidth))/(26*ctx.getTransform().a)),width=label.width*factor,height=label.height*factor;
  ctx.drawImage(label,Math.max(6,Math.min(W-width-6,player.x-width/2)),Math.max(6,player.y-54-height),width,height);
}
const POWER_STYLE:Record<string,{label:string;color:string}>={speed:{label:'S',color:'#ffe66d'},double:{label:'2',color:'#ff9f43'},shield:{label:'K',color:'#74b9ff'},mine:{label:'M',color:'#ff5e67'},rocket:{label:'R',color:'#ff7b31'},invisible:{label:'G',color:'#b388ff'},range:{label:'U',color:'#62ffb0'},pierce:{label:'D',color:'#ffffff'},bulletSpeed:{label:'»',color:'#ffdc5e'},phase:{label:'F',color:'#d58cff'}};
const THEMES:Record<string,{name:string;floor:string;accent:string;wall:string;border:string}>={
  neon:{name:'NEON ŞEHİR',floor:'#070b18',accent:'#14204a',wall:'#426ba8',border:'#77a8ff'},
  desert:{name:'ÇÖL ÜSSÜ',floor:'#25170f',accent:'#6b3d20',wall:'#b9783e',border:'#ffc36b'},
  ice:{name:'BUZ GEÇİDİ',floor:'#061825',accent:'#164b65',wall:'#70bdd5',border:'#c5f7ff'},
  space:{name:'UZAY İSTASYONU',floor:'#03030c',accent:'#251848',wall:'#6550a4',border:'#bd93ff'},
};
let arenaCache:{key:string;canvas:HTMLCanvasElement}|undefined;
let performanceDisplay={fps:60,ping:0,low:false};
const coarseDevice=matchMedia('(pointer:coarse)').matches;
const glow=(radius:number)=>coarseDevice||performanceDisplay.low?0:radius;

function drawBackground(ctx:CanvasRenderingContext2D,theme:string,time:number){
  const style=THEMES[theme]??THEMES.neon;ctx.fillStyle=style.floor;ctx.fillRect(0,0,W,H);ctx.save();ctx.globalAlpha=.26;ctx.strokeStyle=style.accent;ctx.fillStyle=style.accent;
  if(theme==='space'){for(let i=0;i<90;i++){const x=(i*193)%W,y=(i*347)%H,r=i%7===0?3:1.5;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()}}
  else if(theme==='desert'){for(let i=0;i<70;i++){const x=(i*227)%W,y=(i*131)%H;ctx.beginPath();ctx.arc(x,y,2+(i%4),0,Math.PI*2);ctx.fill()}}
  else if(theme==='ice'){ctx.lineWidth=2;for(let i=0;i<16;i++){const x=(i*173)%W,y=(i*239)%H;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+35,y+22);ctx.lineTo(x+18,y+55);ctx.stroke()}}
  else{ctx.lineWidth=1;for(let x=0;x<W;x+=80){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}for(let y=0;y<H;y+=80){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}ctx.globalAlpha=.12+.05*Math.sin(time/500)}ctx.restore();
}

function arenaLayer(state:State){
  const theme=state.theme??'neon',key=`${state.code}-${state.roundId??0}-${theme}-${state.walls?.length??0}`;
  if(arenaCache?.key===key)return arenaCache.canvas;
  const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;const context=canvas.getContext('2d')!,style=THEMES[theme]??THEMES.neon;
  drawBackground(context,theme,0);context.fillStyle=style.wall;context.shadowColor=style.border;context.shadowBlur=12;(state.walls??[]).forEach(wall=>context.fillRect(wall.x,wall.y,wall.w,wall.h));context.shadowBlur=0;context.strokeStyle=style.border;context.lineWidth=8;context.strokeRect(4,4,W-8,H-8);
  arenaCache={key,canvas};return canvas;
}

function drawTank(ctx:CanvasRenderingContext2D,player:Player,index:number,slot:number,time:number,hide:boolean){
  if(hide||(player.effects?.invisible&&index!==slot))return;const color=playerColor(player,index),treadOffset=player.moving?(time/28)%12:0;ctx.save();if(player.effects?.invisible)ctx.globalAlpha=.38;ctx.translate(player.x,player.y);
  if(player.effects?.phase){ctx.strokeStyle='#df9cff';ctx.shadowColor='#c778ff';ctx.shadowBlur=glow(30);ctx.lineWidth=6;ctx.globalAlpha=.8;ctx.setLineDash([8,7]);ctx.beginPath();ctx.arc(0,0,59+Math.sin(time/90)*3,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1}
  if(player.effects?.shield){ctx.strokeStyle='#b9f5ff';ctx.shadowColor='#74dfff';ctx.shadowBlur=glow(28);ctx.lineWidth=6;ctx.beginPath();ctx.arc(0,0,57+Math.sin(time/100)*2,0,Math.PI*2);ctx.stroke()}
  ctx.rotate(player.a);ctx.shadowColor=color;ctx.shadowBlur=glow(16);ctx.fillStyle='#111827';ctx.fillRect(-36,-31,70,15);ctx.fillRect(-36,16,70,15);ctx.fillStyle=color;for(let x=-34+treadOffset;x<34;x+=12){ctx.fillRect(x,-29,7,11);ctx.fillRect(x,18,7,11)}
  ctx.beginPath();ctx.moveTo(-27,-22);ctx.lineTo(22,-22);ctx.lineTo(33,-13);ctx.lineTo(33,13);ctx.lineTo(22,22);ctx.lineTo(-27,22);ctx.lineTo(-34,12);ctx.lineTo(-34,-12);ctx.closePath();ctx.fillStyle=color;ctx.fill();ctx.shadowBlur=glow(0);ctx.fillStyle='#ffffff44';ctx.fillRect(-18,-16,31,5);ctx.fillStyle='#071225';ctx.fillRect(-23,-10,15,20);ctx.restore();
  ctx.save();if(player.effects?.invisible)ctx.globalAlpha=.38;ctx.translate(player.x,player.y);ctx.rotate(player.turret??player.a);ctx.shadowColor=color;ctx.shadowBlur=glow(16);ctx.fillStyle='#e8fbff';ctx.fillRect(4,-6,58,12);ctx.fillStyle=color;ctx.beginPath();ctx.arc(2,0,19,0,Math.PI*2);ctx.fill();ctx.fillStyle='#081020';ctx.beginPath();ctx.arc(2,0,9,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.fillRect(54,-4,12,8);ctx.restore();
}

function drawExplosion(ctx:CanvasRenderingContext2D,explosion:Explosion|undefined|null,time:number){
  if(!explosion)return;const age=time-explosion.at;if(age<0||age>1500)return;const progress=age/1500;ctx.save();ctx.globalCompositeOperation='lighter';for(let i=0;i<28;i++){const angle=i*2.399+(i%3)*.17,speed=70+(i*37)%170,distance=speed*progress,size=Math.max(0,10*(1-progress))+(i%4);ctx.globalAlpha=1-progress;ctx.fillStyle=i%3===0?'#fff3a0':i%3===1?'#ff7a2f':explosion.color;ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=glow(18);ctx.beginPath();ctx.arc(explosion.x+Math.cos(angle)*distance,explosion.y+Math.sin(angle)*distance+110*progress*progress,size,0,Math.PI*2);ctx.fill()}ctx.globalAlpha=Math.max(0,1-progress*2);ctx.strokeStyle='#fff4c2';ctx.lineWidth=14*(1-progress);ctx.beginPath();ctx.arc(explosion.x,explosion.y,35+progress*120,0,Math.PI*2);ctx.stroke();ctx.restore();
}

function draw(ctx:CanvasRenderingContext2D,state:State,slot:number,time:number,transitionAge:number){
  const canvas=ctx.canvas,scale=Math.min(canvas.width/W,canvas.height/H),theme=state.theme??'neon',style=THEMES[theme]??THEMES.neon;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.setTransform(scale,0,0,scale,(canvas.width-W*scale)/2,(canvas.height-H*scale)/2);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(arenaLayer(state),0,0);
  (state.powerups??[]).forEach(power=>{const powerStyle=POWER_STYLE[power.type]??{label:'?',color:'#fff'},pulse=1+Math.sin(time/180)*.12;ctx.save();ctx.translate(power.x,power.y);ctx.scale(pulse,pulse);ctx.fillStyle='#081020';ctx.strokeStyle=powerStyle.color;ctx.shadowColor=powerStyle.color;ctx.shadowBlur=glow(22);ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,0,24,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle=powerStyle.color;ctx.font='700 25px Rajdhani';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(powerStyle.label,0,2);ctx.restore()});
  (state.mines??[]).forEach(mine=>{const color=playerColor(state.players[mine.owner],mine.owner);ctx.save();ctx.translate(mine.x,mine.y);ctx.fillStyle='#090b12';ctx.strokeStyle=color;ctx.lineWidth=4;ctx.shadowColor=color;ctx.shadowBlur=glow(mine.armed<=0?15:4);ctx.beginPath();for(let i=0;i<8;i++){const angle=i*Math.PI/4,r=i%2?12:22,x=Math.cos(angle)*r,y=Math.sin(angle)*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.closePath();ctx.fill();ctx.stroke();ctx.restore()});
  (state.trails??[]).slice(-16).forEach(trail=>{const color=playerColor(state.players[trail.owner],trail.owner);ctx.save();ctx.globalAlpha=Math.min(1,trail.life/10);ctx.strokeStyle=color;ctx.shadowColor=color;ctx.shadowBlur=glow(15);ctx.lineWidth=5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(trail.x1,trail.y1);ctx.lineTo(trail.x2,trail.y2);ctx.lineTo(trail.x3,trail.y3);ctx.stroke();for(let i=0;i<5;i++){const angle=i*2.4+trail.life*.2,distance=(18-trail.life)*2+i*3;ctx.fillStyle=i%2?'#fff':color;ctx.beginPath();ctx.arc(trail.x2+Math.cos(angle)*distance,trail.y2+Math.sin(angle)*distance,2+i%3,0,Math.PI*2);ctx.fill()}ctx.restore()});
  state.bullets.forEach(bullet=>{const color=bullet.type==='rocket'?'#ff8a35':bullet.type==='pierce'?'#ffffff':playerColor(state.players[bullet.owner],bullet.owner),speed=Math.hypot(bullet.vx,bullet.vy)||1;ctx.save();ctx.strokeStyle=color;ctx.globalAlpha=bullet.type==='pierce'?.9:.55;ctx.lineWidth=bullet.type==='rocket'?10:bullet.type==='pierce'?7:5;ctx.shadowColor=color;ctx.shadowBlur=glow(bullet.type==='pierce'?30:18);ctx.beginPath();ctx.moveTo(bullet.x-bullet.vx/speed*(bullet.type==='pierce'?70:42),bullet.y-bullet.vy/speed*(bullet.type==='pierce'?70:42));ctx.lineTo(bullet.x,bullet.y);ctx.stroke();ctx.globalAlpha=1;ctx.fillStyle=color;ctx.beginPath();ctx.arc(bullet.x,bullet.y,bullet.type==='rocket'?14:bullet.type==='pierce'?10:8,0,Math.PI*2);ctx.fill();ctx.restore()});
  state.players.forEach((player,index)=>drawTank(ctx,player,index,slot,time,Boolean(state.explosion&&state.phase!=='playing'&&Math.hypot(player.x-state.explosion.x,player.y-state.explosion.y)<5)));
  state.players.forEach((player,index)=>drawNameplate(ctx,player,index,slot));
  (state.reactions??[]).forEach(reaction=>{ctx.save();ctx.globalAlpha=Math.min(1,reaction.life/20);ctx.font='36px Arial';ctx.textAlign='center';ctx.fillStyle='#fff';ctx.shadowColor='#000';ctx.shadowBlur=glow(8);ctx.fillText(reaction.emoji,reaction.x,reaction.y-(105-reaction.life)*.22);ctx.restore()});
  drawExplosion(ctx,state.explosion,time);
  ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle=performanceDisplay.low?'#ffdb69':'#a9c8f2';ctx.font='600 11px Rajdhani, Arial';ctx.textAlign='left';ctx.fillText(`${performanceDisplay.fps} FPS · ${performanceDisplay.ping} ms${performanceDisplay.low?' · TASARRUF':''}`,12,canvas.height-12);ctx.restore();
  if(transitionAge<750){const progress=transitionAge/750;ctx.save();ctx.globalAlpha=Math.max(0,1-progress);ctx.fillStyle=style.floor;ctx.fillRect(0,0,W,H);ctx.globalAlpha=Math.sin(progress*Math.PI);ctx.fillStyle=style.border;ctx.shadowColor=style.border;ctx.shadowBlur=glow(40);ctx.fillRect(progress*W-45,0,90,H);ctx.restore()}
}

function blend(from:number,to:number,amount:number){return from+(to-from)*amount}
function blendAngle(from:number,to:number,amount:number){const delta=Math.atan2(Math.sin(to-from),Math.cos(to-from));return from+delta*amount}
function touchesWall(walls:Wall[],x:number,y:number,radius:number){if(x-radius<0||y-radius<0||x+radius>W||y+radius>H)return true;return walls.some(wall=>{const nearX=Math.max(wall.x,Math.min(x,wall.x+wall.w)),nearY=Math.max(wall.y,Math.min(y,wall.y+wall.h));return(x-nearX)**2+(y-nearY)**2<radius**2-1e-6})}
function movePredicted(walls:Wall[],x:number,y:number,dx:number,dy:number){const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))*2));for(let i=0;i<steps;i++){if(!touchesWall(walls,x+dx/steps,y,48))x+=dx/steps;if(!touchesWall(walls,x,y+dy/steps,48))y+=dy/steps}return{x,y}}
function smoothState(from:State|undefined,to:State,amount:number){
  if(!from||from.roundId!==to.roundId||from.phase!==to.phase)return {...to,players:to.players.map(player=>({...player})),bullets:to.bullets.map(bullet=>({...bullet}))};
  return {...to,players:to.players.map((player,index)=>{const previous=from.players[index];return previous?{...player,x:blend(previous.x,player.x,amount),y:blend(previous.y,player.y,amount),a:blendAngle(previous.a,player.a,amount),turret:blendAngle(previous.turret??previous.a,player.turret??player.a,amount)}:player}),bullets:to.bullets.map((bullet)=>{const previous=from.bullets.find(item=>item.id===bullet.id);return previous&&previous.bounces===bullet.bounces?{...bullet,x:blend(previous.x,bullet.x,amount),y:blend(previous.y,bullet.y,amount)}:bullet})}
}

function App(){
  const [profile,setProfile]=useState<Profile>(loadProfile);
  useEffect(()=>{try{localStorage.setItem('neon-tank-profile',JSON.stringify(profile))}catch{}},[profile]);
  const [socket,setSocket]=useState<Socket>();const [state,setState]=useState<State>();const [slot,setSlot]=useState<number>();const [code,setCode]=useState('');const [join,setJoin]=useState('');const [speed,setSpeed]=useState('normal');const [playerCount,setPlayerCount]=useState(2);const [layout,setLayout]=useState('classic');const [selfDamage,setSelfDamage]=useState(false);const [emojiOpen,setEmojiOpen]=useState(false);const [err,setErr]=useState('');const [drive,setDrive]=useState({x:0,y:0});const [metrics,setMetrics]=useState({fps:60,ping:0,low:false});
  const canvas=useRef<HTMLCanvasElement>(null),controls=useRef({move:0,heading:0}),connectedToGame=useRef(false),slotRef=useRef<number>(),latestState=useRef<State>(),previousState=useRef<State>(),stateArrivedAt=useRef(0),prediction=useRef<{x:number;y:number;a:number}>(),previousPrediction=useRef<{x:number;y:number;a:number}>(),pendingInputs=useRef<Command[]>([]),outbox=useRef<Command[]>([]),inputSequence=useRef(0),simulationTime=useRef(0),visualError=useRef({x:0,y:0}),lowQuality=useRef(false),lastRound=useRef<number>(),transitionStart=useRef(0),uiSignature=useRef(''),snapshots=useRef<{state:State;at:number}[]>([]);
  const returnToMenu=()=>{latestState.current=undefined;snapshots.current=[];prediction.current=undefined;pendingInputs.current=[];outbox.current=[];uiSignature.current='';controls.current.move=0;setState(undefined);setSlot(undefined);setCode('');setEmojiOpen(false);setErr('')};
  slotRef.current=slot;
  performanceDisplay=metrics;
  const acceptState=(next:State)=>{
    const current=latestState.current,changed=!current||current.code!==next.code||current.roundId!==next.roundId||current.phase!==next.phase;
    const merged={...next,walls:next.walls??current?.walls??[]},stamp=performance.now();
    previousState.current=current;latestState.current=merged;stateArrivedAt.current=stamp;
    if(changed){
      snapshots.current=[];prediction.current=undefined;previousPrediction.current=undefined;pendingInputs.current=[];outbox.current=[];inputSequence.current=0;simulationTime.current=0;visualError.current={x:0,y:0};
      controls.current={move:0,heading:merged.players[slotRef.current??0]?.a??0};
    }
    const local=merged.players[slotRef.current??0];
    if(local&&merged.phase==='playing'){
      pendingInputs.current=pendingInputs.current.filter(command=>command.seq>(local.lastProcessedInput??0));
      const reconciled=replayTank(local,pendingInputs.current,local.effects?.phase?[]:merged.walls, (merged.tankSpeed??7.1)*(local.effects?.speed?1.7:1),merged.players.filter((_,i)=>i!==slotRef.current));
      const old=prediction.current;
      if(old&&Math.hypot(old.x-reconciled.x,old.y-reconciled.y)<48){
        visualError.current.x+=old.x-reconciled.x;visualError.current.y+=old.y-reconciled.y;
      }else visualError.current={x:0,y:0};
      if(old&&previousPrediction.current){
        previousPrediction.current={x:previousPrediction.current.x+reconciled.x-old.x,y:previousPrediction.current.y+reconciled.y-old.y,a:previousPrediction.current.a+reconciled.a-old.a};
      }else previousPrediction.current=reconciled;
      prediction.current=reconciled;
    }
    snapshots.current.push({state:merged,at:stamp});if(snapshots.current.length>12)snapshots.current.shift();
    const signature=JSON.stringify([merged.code,merged.roundId,merged.phase,merged.countdown,merged.winner,merged.selfDamage,merged.players.map((p,i)=>[p.name,p.color,p.badge,p.score,p.selfHits,p.ready,p.effects,merged.bullets.filter(b=>b.owner===i).length])]);
    if(signature!==uiSignature.current){uiSignature.current=signature;setState(merged)}
  };
  const requestLandscape=async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen?.()}catch{}const orientation=screen.orientation as unknown as{lock?:(mode:string)=>Promise<void>};void orientation.lock?.('landscape').catch(()=>undefined)};
  useEffect(()=>{const connection=io();setSocket(connection);connection.on('room-joined',(data:{code:string;slot:number;state:State})=>{slotRef.current=data.slot;setCode(data.code);setSlot(data.slot);acceptState(data.state);setErr('')});connection.on('game-state',acceptState);connection.on('disconnect',()=>{controls.current.move=0;prediction.current=undefined;setErr('Bağlantı kesildi. Menüden tekrar katılın.')});connection.on('round-result',(next:State)=>{navigator.vibrate?.([80,45,120]);acceptState(next)});connection.on('match-result',(next:State)=>{navigator.vibrate?.([110,55,160]);acceptState(next)});connection.on('return-to-menu',returnToMenu);connection.on('player-disconnected',()=>setErr('Rakibin bağlantısı kesildi. Oda kısa süre içinde kapanacak.'));connection.on('room-error',setErr);return()=>{connection.close()}},[]);
  connectedToGame.current=Boolean(state&&slot!==undefined);
  useEffect(()=>{if(!state)return;const stopScroll=(event:TouchEvent)=>event.preventDefault();document.documentElement.classList.add('game-active');document.addEventListener('touchmove',stopScroll,{passive:false});return()=>{document.documentElement.classList.remove('game-active');document.removeEventListener('touchmove',stopScroll)}},[Boolean(state)]);
  useEffect(()=>{const ready=Boolean(state&&slot!==undefined&&state.players[slot]?.ready);document.documentElement.classList.toggle('self-ready',ready);return()=>document.documentElement.classList.remove('self-ready')},[Boolean(state&&slot!==undefined&&state.players[slot]?.ready)]);
  useEffect(()=>{const root=document.documentElement,hits=Math.min(3,state?.players[slot??-1]?.selfHits??0),enabled=Boolean(state?.selfDamage&&slot!==undefined);root.classList.toggle('self-damage',enabled);root.classList.remove('self-damage-hits-0','self-damage-hits-1','self-damage-hits-2','self-damage-hits-3');if(enabled)root.classList.add(`self-damage-hits-${hits}`);return()=>{root.classList.remove('self-damage','self-damage-hits-0','self-damage-hits-1','self-damage-hits-2','self-damage-hits-3')}},[state?.selfDamage,state?.players[slot??-1]?.selfHits,slot]);
  useEffect(()=>{
    if(!socket||slot===undefined||!code)return;
    const timer=setInterval(()=>{
      if(!socket.connected||!socket.io.engine?.transport?.writable||!outbox.current.length)return;
      socket.emit('input-batch',{code,roundId:latestState.current?.roundId,commands:outbox.current.splice(0,MAX_PENDING)});
    },1000/30);
    return()=>clearInterval(timer);
  },[slot,socket,code]);
  useEffect(()=>{if(!socket)return;const timer=setInterval(()=>{const started=performance.now();socket.timeout(1500).emit('latency-probe',(error?:Error)=>{if(!error)setMetrics(current=>({...current,ping:Math.round(performance.now()-started)}))})},2000);return()=>clearInterval(timer)},[socket]);
  useEffect(()=>{
    const element=canvas.current;if(!element||slot===undefined)return;
    const context=element.getContext('2d')!;
    let frame=0,frames=0,windowStart=performance.now(),lastFrame=windowStart,badWindows=0,goodWindows=0;
    const resize=()=>{
      const ratio=Math.min(devicePixelRatio,lowQuality.current?1:coarseDevice?1.25:1.5,Math.sqrt((lowQuality.current?450000:900000)/Math.max(1,element.clientWidth*element.clientHeight)));
      const width=Math.max(1,Math.round(element.clientWidth*ratio)),height=Math.max(1,Math.round(element.clientHeight*ratio));
      if(element.width!==width||element.height!==height){element.width=width;element.height=height}
    };
    const animate=(stamp:number)=>{
      frame=requestAnimationFrame(animate);
      if(document.hidden){lastFrame=stamp;windowStart=stamp;frames=0;return}
      if(stamp-lastFrame<15.5)return;
      const delta=Math.min(100,stamp-lastFrame);lastFrame=stamp;frames++;
      if(stamp-windowStart>=2000){
        const fps=Math.round(frames*1000/(stamp-windowStart));badWindows=fps<40?badWindows+1:0;goodWindows=fps>56?goodWindows+1:0;
        if(!lowQuality.current&&badWindows>=2){lowQuality.current=true;resize()}
        else if(lowQuality.current&&goodWindows>=10){lowQuality.current=false;goodWindows=0;resize()}
        setMetrics(value=>({...value,fps,low:lowQuality.current}));frames=0;windowStart=stamp;
      }
      const current=latestState.current;if(!current)return;
      const buffer=snapshots.current,target=stamp-100;
      let before=buffer[0],after=buffer[0];
      for(const entry of buffer){if(entry.at<=target)before=entry;if(entry.at>=target){after=entry;break}after=entry}
      const amount=before&&after&&after.at>before.at?Math.min(1,Math.max(0,(target-before.at)/(after.at-before.at))):1;
      const display=before&&after?smoothState(before.state,after.state,amount):smoothState(undefined,current,1);
      if(display.phase!==current.phase||display.roundId!==current.roundId)Object.assign(display,smoothState(undefined,current,1));
      const local=current.players[slot];
      if(local&&current.phase==='playing'&&stamp-stateArrivedAt.current<500&&socket?.connected){
        prediction.current??={x:local.x,y:local.y,a:local.a};
        previousPrediction.current??=prediction.current;
        simulationTime.current+=delta;
        const speed=(current.tankSpeed??7.1)*(local.effects?.speed?1.7:1),others=current.players.filter((_,i)=>i!==slot);
        while(simulationTime.current>=STEP_MS){
          simulationTime.current-=STEP_MS;
          if(pendingInputs.current.length>=MAX_PENDING)continue;
          const command={seq:++inputSequence.current,move:controls.current.move,heading:controls.current.heading};
          previousPrediction.current=prediction.current;
          prediction.current=advanceTank(prediction.current,command,local.effects?.phase?[]:current.walls??[],speed,others);
          pendingInputs.current.push(command);outbox.current.push(command);
        }
        const alpha=Math.min(1,simulationTime.current/STEP_MS),previous=previousPrediction.current,predicted=prediction.current;
        visualError.current.x*=Math.exp(-delta/80);visualError.current.y*=Math.exp(-delta/80);
        const x=blend(previous.x,predicted.x,alpha),y=blend(previous.y,predicted.y,alpha);
        const displayed=movePredicted(local.effects?.phase?[]:current.walls??[],predicted.x,predicted.y,x+visualError.current.x-predicted.x,y+visualError.current.y-predicted.y);
        const safe=others.some(other=>Math.hypot(other.x-displayed.x,other.y-displayed.y)<96)?predicted:displayed;
        const a=blendAngle(previous.a,predicted.a,alpha);
        display.players[slot]={...local,...safe,a,turret:a,moving:controls.current.move>.05};
      }else{prediction.current=undefined;previousPrediction.current=undefined;simulationTime.current=0;visualError.current={x:0,y:0}}
      if(lastRound.current!==current.roundId){lastRound.current=current.roundId;transitionStart.current=Date.now()}
      draw(context,display,slot,Date.now(),Date.now()-transitionStart.current);
    };
    const observer=new ResizeObserver(resize);observer.observe(element);resize();frame=requestAnimationFrame(animate);
    return()=>{cancelAnimationFrame(frame);observer.disconnect()};
  },[slot,code,socket]);
  const share=async()=>{const text=`Neon Tank Düellosu odama katıl: ${code}`;if(navigator.share)await navigator.share({title:'Neon Tank Düellosu',text});else await navigator.clipboard.writeText(code)};
  const driveInput=(rawX:number,rawY:number)=>{const length=Math.hypot(rawX,rawY),factor=length>.5?.5/length:1,x=rawX*factor,y=rawY*factor,power=Math.min(1,Math.hypot(x,y)*2);controls.current={move:power,heading:power>.05?Math.atan2(y,x):controls.current.heading};setDrive({x:x*2,y:y*2})};
  const release=()=>{controls.current={...controls.current,move:0};setDrive({x:0,y:0})};
  useEffect(()=>{
    if(!state)return;
    let active:number|undefined,origin={x:0,y:0};
    const down=(event:PointerEvent)=>{
      if(active!==undefined||latestState.current?.phase!=='playing'||event.clientX>innerWidth*.46||event.clientY<52)return;
      if((event.target as Element).closest('button,input,select,header,.invite,.emoji-picker'))return;
      active=event.pointerId;origin={x:event.clientX,y:event.clientY};release();
      (event.target as Element).setPointerCapture?.(event.pointerId);
    };
    const move=(event:PointerEvent)=>{if(event.pointerId!==active)return;
      const x=event.clientX-origin.x,y=event.clientY-origin.y,length=Math.hypot(x,y);
      if(length<8){release();return}
      const strength=Math.min(1,(length-8)/48);driveInput(x/length*strength*.5,y/length*strength*.5);
    };
    const stop=()=>{active=undefined;release();if(socket?.connected)socket.emit('player-input',{code,input:controls.current})};
    const up=(event:PointerEvent)=>{if(event.pointerId===active)stop()};
    const hidden=()=>{if(document.hidden)stop()};
    window.addEventListener('pointerdown',down);window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);window.addEventListener('lostpointercapture',up);window.addEventListener('blur',stop);document.addEventListener('visibilitychange',hidden);
    return()=>{window.removeEventListener('pointerdown',down);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);window.removeEventListener('lostpointercapture',up);window.removeEventListener('blur',stop);document.removeEventListener('visibilitychange',hidden);controls.current.move=0};
  },[Boolean(state),socket,code]);
  if(!state)return <main className="lobby"><div className="menu-stars"/><div className="game-badge">ONLINE • 2–4 OYUNCU</div><div className="tank-logo"><span>◢</span><i/></div><div className="brand">NEON<br/><b>TANK DUEL</b></div><p className="tagline">Labirente gir. Sekmeyi hesapla. Rakiplerini yok et.</p><div className="feature-row"><span>⚡ GÜÇLER</span><span>◈ 4 ARENA</span><span>● ONLINE</span></div><section className="lobby-card"><div className="profile-editor">
<label className="profile-name">TAKMA AD<input value={profile.name} maxLength={12} placeholder="Adını yaz" autoComplete="nickname" onChange={event=>setProfile({...profile,name:event.target.value})}/></label>
<div className="profile-preview" style={{color:profile.color}}>{profile.badge} {profile.name.trim()||'Senin tankın'}</div>
<fieldset className="profile-options"><legend>TANK RENGİ</legend><div className="color-options">{TANK_COLORS.map(color=><button type="button" key={color.value} aria-label={color.label} aria-pressed={profile.color===color.value} style={{backgroundColor:color.value}} onClick={()=>setProfile({...profile,color:color.value})}>{profile.color===color.value?'✓':''}</button>)}</div></fieldset>
<fieldset className="profile-options"><legend>ROZET</legend><div className="badge-options">{BADGES.map(badge=><button type="button" key={badge.value} aria-label={badge.label} aria-pressed={profile.badge===badge.value} onClick={()=>setProfile({...profile,badge:badge.value})}>{badge.value}</button>)}</div></fieldset>
<small className="profile-help">Aynı renk seçilirse odada boş bir renk atanır.</small></div>
<div className="room-settings"><label className="speed">TANK HIZI<select value={speed} onChange={event=>setSpeed(event.target.value)}><option value="slow">Yavaş</option><option value="normal">Normal</option><option value="fast">Hızlı</option></select></label><label className="speed">KİŞİ SAYISI<select value={playerCount} onChange={event=>setPlayerCount(Number(event.target.value))}><option value={2}>2 Oyuncu</option><option value={3}>3 Oyuncu</option><option value={4}>4 Oyuncu</option></select></label></div>
<label className="speed">HARİTA DÜZENİ<select value={layout} onChange={event=>setLayout(event.target.value)}><option value="classic">Klasik Labirent</option><option value="narrow">Dar Koridorlar</option><option value="open">Açık Arena</option><option value="corners">Dört Köşe</option></select></label>
<label className="rule-toggle"><input type="checkbox" checked={selfDamage} onChange={event=>setSelfDamage(event.target.checked)}/><span><b>KENDİ MERMİN HASAR VERSİN</b><small>Açıkken seken kendi mermin 3 kez sana değerse rakip eli kazanır.</small></span></label>
<button className="primary" onClick={()=>{requestLandscape();socket?.emit('create-room',{speed,players:playerCount,layout,selfDamage,profile})}}>＋ ONLINE ODA OLUŞTUR</button><button className="bot-game" onClick={()=>{requestLandscape();socket?.emit('create-bot-game',{speed,profile})}}>◆ YAPAY ZEKAYA KARŞI</button><div className="power-guide"><b>GÜÇ KAPSÜLLERİ</b><span>H Hız · 2 Çift · K Kalkan · U Menzil · D Delici · R Roket · M Mayın · G Gizli</span></div><div className="or"><span/>ODA KODUYLA KATIL<span/></div><div className="join-row"><input value={join} onChange={event=>setJoin(event.target.value.toUpperCase())} maxLength={4} placeholder="ODA KODU"/><button className="secondary" onClick={()=>{requestLandscape();socket?.emit('join-room',{code:join,profile})}}>KATIL</button></div></section>{err&&<small>{err}</small>}<footer>İLK 5 SKOR MAÇI KAZANIR</footer></main>;
  const player=state.players[slot!],effects=player?.effects,ammo=5-state.bullets.filter(bullet=>bullet.owner===slot).length,theme=THEMES[state.theme??'neon']??THEMES.neon;
  const leave=()=>{socket?.emit('leave-room',{code});returnToMenu()};
  const headline=state.phase==='waiting'?`Oyuncular bekleniyor ${state.players.length}/${state.maxPlayers??2}`:state.phase==='countdown'?'TUR HAZIRLANIYOR':state.phase==='result'?(state.winner===slot?'ELİ KAZANDIN!':`${playerName(state.players[state.winner??0],state.winner??0)} KAZANDI`):state.phase==='match-over'?`${playerName(state.players[state.winner??0],state.winner??0)} MAÇI KAZANDI!`:'HEDEFİ YOK ET';
  const activePowers=[effects?.speed&&'⚡ HIZ',effects?.bulletSpeed&&'» HIZLI MERMİ',effects?.phase&&'F FAZ GEÇİŞİ',effects?.double&&'Ⅱ ÇİFT',effects?.shield&&'◇ KALKAN',effects?.invisible&&'◌ GİZLİ',effects?.range&&'↗ UZUN MENZİL',Boolean(effects?.rockets)&&`R ROKET ×${effects?.rockets}`,Boolean(effects?.pierces)&&`D DELİCİ ×${effects?.pierces}`].filter(Boolean);
  const sendReaction=(emoji:string)=>{navigator.vibrate?.(12);socket?.emit('reaction',{code,emoji});setEmojiOpen(false)};
  return <main className={`game theme-${state.theme??'neon'}`}><div className="orientation-hint"><span>↻</span><div><b>TELEFONUNU YATAY ÇEVİR</b><small>En iyi oyun deneyimi için</small></div></div><header><button className="menu" onClick={leave}>MENÜ</button><div className="round-title"><strong>{headline}</strong><em>{theme.name}{state.players.some(item=>item.isBot)?' • YAPAY ZEKÂ':''}</em></div><div className="scoreboard">{state.players.map((item,index)=><span key={index} className={index===slot?'mine':''} style={{color:playerColor(item,index)}} title={`${playerName(item,index)}${index===slot?' (Sen)':''}`}><i>{item.badge??'★'}</i><span className="score-name">{playerName(item,index)}</span><b>{item.score}</b></span>)}</div><button className="emoji-button" onClick={()=>setEmojiOpen(open=>!open)}>😀</button></header>{emojiOpen&&<div className="emoji-picker">{['😄','😎','😱','🔥','💥','👋'].map(emoji=><button key={emoji} onClick={()=>sendReaction(emoji)}>{emoji}</button>)}</div>}<div className="power-status">{activePowers.map(item=><span key={String(item)}>{item}</span>)}</div><canvas ref={canvas}/>{state.phase==='waiting'&&<section className="invite"><b>Oda kodun: {code}</b><small>{state.players.length}/{state.maxPlayers??2} oyuncu katıldı • {state.mapLayout==='narrow'?'Dar Koridor':state.mapLayout==='open'?'Açık Arena':state.mapLayout==='corners'?'Dört Köşe':'Klasik Labirent'}</small><div className="ready-list">{state.players.map((item,index)=><span key={index} className={item.ready?'ready':''} style={{color:playerColor(item,index)}}>{item.badge??'★'} {playerName(item,index)}{index===slot?' (Sen)':''} · {item.ready?'HAZIR':'BEKLİYOR'}</span>)}</div><button className="ready-button" onClick={()=>{navigator.vibrate?.(20);socket?.emit('set-ready',{code,ready:!player?.ready})}}>{player?.ready?'HAZIR DEĞİLİM':'HAZIRIM'}</button><button onClick={share}>DAVETİ PAYLAŞ</button></section>}{state.phase==='countdown'&&<div className="countdown" key={state.countdown}>{state.countdown||'BAŞLA!'}</div>}<section className="controls"><div className="stick move"><span className="knob" style={{transform:`translate(${drive.x*32}px,${drive.y*32}px)`}}>SÜR</span></div>{Boolean(effects?.mines)&&<button className="mine-button" onPointerDown={event=>{event.preventDefault();navigator.vibrate?.(16);socket?.emit('deploy-mine',{code})}}>MAYIN<br/>×{effects?.mines}</button>}<button className="fire" onPointerDown={event=>{event.preventDefault();navigator.vibrate?.(12);socket?.emit('fire',{code})}}><span>ATEŞ</span><span className="ammo" aria-label={`${ammo} mermi kaldı`}>{[0,1,2,3,4].map(index=><i key={index} className={index<ammo?'loaded':'used'}>●</i>)}</span></button></section>{err&&<small>{err}</small>}</main>;
}

createRoot(document.getElementById('root')!).render(<App/>);
