import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io, Socket } from 'socket.io-client';
import './style.css';

type Effects={speed:boolean;double:boolean;shield:boolean;invisible:boolean;mines:number;rockets:number};
type Player={x:number;y:number;a:number;turret:number;score:number;effects?:Effects};
type Wall={x:number;y:number;w:number;h:number};
type Bullet={x:number;y:number;owner:number;type?:string;radius?:number};
type Trail={x1:number;y1:number;x2:number;y2:number;x3:number;y3:number;owner:number;life:number};
type Powerup={id:string;x:number;y:number;type:string};
type Mine={x:number;y:number;owner:number;armed:number};
type State={code:string;phase:string;countdown?:number;players:Player[];walls:Wall[];bullets:Bullet[];trails?:Trail[];powerups?:Powerup[];mines?:Mine[];winner?:number};

const W=1400,H=1000;
const POWER_STYLE:Record<string,{label:string;color:string}>={
  speed:{label:'H',color:'#ffe66d'},double:{label:'2',color:'#ff9f43'},shield:{label:'K',color:'#74b9ff'},
  mine:{label:'M',color:'#ff5e67'},rocket:{label:'R',color:'#ff7b31'},invisible:{label:'G',color:'#b388ff'},
};

function draw(ctx:CanvasRenderingContext2D,state:State,slot:number){
  const canvas=ctx.canvas,scale=Math.min(canvas.width/W,canvas.height/H);
  ctx.setTransform(scale,0,0,scale,(canvas.width-W*scale)/2,(canvas.height-H*scale)/2);
  ctx.clearRect(0,0,W,H);ctx.fillStyle='#080b16';ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#426ba8';ctx.shadowColor='#4f8cff';ctx.shadowBlur=10;state.walls.forEach(wall=>ctx.fillRect(wall.x,wall.y,wall.w,wall.h));
  ctx.shadowBlur=0;ctx.strokeStyle='#77a8ff';ctx.lineWidth=8;ctx.strokeRect(4,4,W-8,H-8);

  (state.powerups??[]).forEach(power=>{const style=POWER_STYLE[power.type]??{label:'?',color:'#fff'},pulse=1+Math.sin(Date.now()/180)*.12;ctx.save();ctx.translate(power.x,power.y);ctx.scale(pulse,pulse);ctx.fillStyle='#081020';ctx.strokeStyle=style.color;ctx.shadowColor=style.color;ctx.shadowBlur=22;ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,0,24,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle=style.color;ctx.font='700 25px Rajdhani';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(style.label,0,2);ctx.restore()});
  (state.mines??[]).forEach(mine=>{const color=mine.owner===0?'#17e6ff':'#ff3fb4';ctx.save();ctx.translate(mine.x,mine.y);ctx.fillStyle='#090b12';ctx.strokeStyle=color;ctx.lineWidth=4;ctx.shadowColor=color;ctx.shadowBlur=mine.armed<=0?15:4;ctx.beginPath();for(let i=0;i<8;i++){const angle=i*Math.PI/4,r=i%2?12:22;const x=Math.cos(angle)*r,y=Math.sin(angle)*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.closePath();ctx.fill();ctx.stroke();ctx.restore()});
  (state.trails??[]).forEach(trail=>{const color=trail.owner===0?'#17e6ff':'#ff3fb4';ctx.save();ctx.globalAlpha=Math.min(1,trail.life/10);ctx.strokeStyle=color;ctx.shadowColor=color;ctx.shadowBlur=15;ctx.lineWidth=5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(trail.x1,trail.y1);ctx.lineTo(trail.x2,trail.y2);ctx.lineTo(trail.x3,trail.y3);ctx.stroke();ctx.restore()});
  state.bullets.forEach(bullet=>{const color=bullet.type==='rocket'?'#ff8a35':bullet.owner===0?'#17e6ff':'#ff3fb4';ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=bullet.type==='rocket'?26:16;ctx.beginPath();ctx.arc(bullet.x,bullet.y,bullet.type==='rocket'?14:8,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0});
  state.players.forEach((player,index)=>{if(player.effects?.invisible&&index!==slot)return;const color=index===0?'#17e6ff':'#ff3fb4';ctx.save();if(player.effects?.invisible)ctx.globalAlpha=.38;ctx.translate(player.x,player.y);if(player.effects?.shield){ctx.strokeStyle='#9ee8ff';ctx.shadowColor='#74b9ff';ctx.shadowBlur=24;ctx.lineWidth=6;ctx.beginPath();ctx.arc(0,0,55,0,Math.PI*2);ctx.stroke()}ctx.rotate(player.a);ctx.shadowColor=color;ctx.shadowBlur=18;ctx.fillStyle=color;ctx.fillRect(-30,-24,60,48);ctx.fillStyle='#061328';ctx.beginPath();ctx.arc(0,0,15,0,Math.PI*2);ctx.fill();ctx.restore();ctx.save();if(player.effects?.invisible)ctx.globalAlpha=.38;ctx.translate(player.x,player.y);ctx.rotate(player.turret??player.a);ctx.shadowColor=color;ctx.shadowBlur=14;ctx.fillStyle='#d9f9ff';ctx.fillRect(0,-7,58,14);ctx.fillStyle=color;ctx.beginPath();ctx.arc(0,0,18,0,Math.PI*2);ctx.fill();ctx.restore()});
}

function App(){
  const [socket,setSocket]=useState<Socket>();const [state,setState]=useState<State>();const [slot,setSlot]=useState<number>();const [code,setCode]=useState('');const [join,setJoin]=useState('');const [speed,setSpeed]=useState('normal');const [err,setErr]=useState('');const [drive,setDrive]=useState({x:0,y:0});
  const canvas=useRef<HTMLCanvasElement>(null),controls=useRef({move:0,heading:0}),connectedToGame=useRef(false);
  const requestLandscape=async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen?.()}catch{}const orientation=screen.orientation as unknown as {lock?:(mode:string)=>Promise<void>};void orientation.lock?.('landscape').catch(()=>undefined)};
  useEffect(()=>{const connection=io();setSocket(connection);connection.on('room-joined',(data:{code:string;slot:number;state:State})=>{setCode(data.code);setSlot(data.slot);setState(data.state);setErr('')});connection.on('game-state',setState);connection.on('round-result',setState);connection.on('match-result',setState);connection.on('player-disconnected',()=>setErr('Rakibin bağlantısı kesildi. Oda kısa süre içinde kapanacak.'));connection.on('room-error',setErr);return()=>{connection.close()}},[]);
  connectedToGame.current=Boolean(state&&slot!==undefined);
  useEffect(()=>{if(!socket||slot===undefined||!code)return;const timer=setInterval(()=>{if(connectedToGame.current)socket.emit('player-input',{code,input:controls.current})},1000/60);return()=>clearInterval(timer)},[slot,socket,code]);
  useEffect(()=>{const element=canvas.current;if(!element||!state||slot===undefined)return;const context=element.getContext('2d')!;const resize=()=>{element.width=element.clientWidth*devicePixelRatio;element.height=element.clientHeight*devicePixelRatio;draw(context,state,slot)};resize();window.addEventListener('resize',resize);draw(context,state,slot);return()=>window.removeEventListener('resize',resize)},[state,slot]);
  const share=async()=>{const text=`Neon Tank Düellosu odama katıl: ${code}`;if(navigator.share)await navigator.share({title:'Neon Tank Düellosu',text});else await navigator.clipboard.writeText(code)};
  const pointer=(event:React.PointerEvent<HTMLDivElement>)=>{const box=event.currentTarget.getBoundingClientRect(),rawX=(event.clientX-box.left)/box.width-.5,rawY=(event.clientY-box.top)/box.height-.5,length=Math.hypot(rawX,rawY),factor=length>.5?.5/length:1,x=rawX*factor,y=rawY*factor,power=Math.min(1,Math.hypot(x,y)*2);controls.current={move:power,heading:power>.05?Math.atan2(y,x):controls.current.heading};setDrive({x:x*2,y:y*2})};
  const release=()=>{controls.current={...controls.current,move:0};setDrive({x:0,y:0})};
  if(!state)return <main className="lobby"><div className="brand">NEON<br/><b>TANK DUEL</b></div><p>İki telefon. Tek arena. Son tank ayakta kalır.</p><label className="speed">TANK HIZI<select value={speed} onChange={event=>setSpeed(event.target.value)}><option value="slow">Yavaş</option><option value="normal">Normal</option><option value="fast">Hızlı</option></select></label><button onClick={()=>{requestLandscape();socket?.emit('create-room',{speed})}}>ODA OLUŞTUR</button><div className="or">veya</div><input value={join} onChange={event=>setJoin(event.target.value.toUpperCase())} maxLength={4} placeholder="ODA KODU"/><button className="secondary" onClick={()=>{requestLandscape();socket?.emit('join-room',join)}}>KATIL</button>{err&&<small>{err}</small>}</main>;

  const player=state.players[slot!],effects=player?.effects,ammo=5-state.bullets.filter(bullet=>bullet.owner===slot).length;
  const leave=()=>{socket?.emit('leave-room',{code});setState(undefined);setSlot(undefined);setCode('');setErr('')};
  const headline=state.phase==='waiting'?'Rakip bekleniyor…':state.phase==='countdown'?'TUR HAZIRLANIYOR':state.phase==='result'?(state.winner===slot?'ELİ KAZANDIN!':'RAKİBİN KAZANDI'):state.phase==='match-over'?(state.winner===slot?'MAÇ SENİN!':'MAÇ BİTTİ'):'HEDEFİ YOK ET';
  const activePowers=[effects?.speed&&'⚡ HIZ',effects?.double&&'Ⅱ ÇİFT',effects?.shield&&'◇ KALKAN',effects?.invisible&&'◌ GİZLİ',Boolean(effects?.rockets)&&`R ROKET ×${effects?.rockets}`].filter(Boolean);
  return <main className="game"><header><button className="menu" onClick={leave}>MENÜ</button><strong>{headline}</strong><span className="score"><i>{player?.score??0}</i> — {state.players[slot===0?1:0]?.score??0}</span></header><div className="power-status">{activePowers.map(item=><span key={String(item)}>{item}</span>)}</div><canvas ref={canvas}/>{state.phase==='waiting'&&<section className="invite"><b>Oda kodun: {code}</b><button onClick={share}>DAVETİ PAYLAŞ</button></section>}{state.phase==='countdown'&&<div className="countdown" key={state.countdown}>{state.countdown||'BAŞLA!'}</div>}<section className="controls"><div className="stick move" onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);pointer(event)}} onPointerMove={pointer} onPointerUp={release} onPointerCancel={release}><span className="knob" style={{transform:`translate(${drive.x*32}px,${drive.y*32}px)`}}>SÜR</span></div>{Boolean(effects?.mines)&&<button className="mine-button" onPointerDown={event=>{event.preventDefault();socket?.emit('deploy-mine',{code})}}>MAYIN<br/>×{effects?.mines}</button>}<button className="fire" onPointerDown={event=>{event.preventDefault();socket?.emit('fire',{code})}}><span>ATEŞ</span><span className="ammo" aria-label={`${ammo} mermi kaldı`}>{[0,1,2,3,4].map(index=><i key={index} className={index<ammo?'loaded':'used'}>●</i>)}</span></button></section>{err&&<small>{err}</small>}</main>;
}

createRoot(document.getElementById('root')!).render(<App/>);
