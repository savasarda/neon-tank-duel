import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io, Socket } from 'socket.io-client';
import './style.css';

type Effects={speed:boolean;double:boolean;shield:boolean;invisible:boolean;mines:number;rockets:number};
type Player={x:number;y:number;a:number;turret:number;score:number;moving?:boolean;effects?:Effects};
type Wall={x:number;y:number;w:number;h:number};
type Bullet={x:number;y:number;vx:number;vy:number;owner:number;type?:string;radius?:number};
type Trail={x1:number;y1:number;x2:number;y2:number;x3:number;y3:number;owner:number;life:number};
type Powerup={id:string;x:number;y:number;type:string};type Mine={x:number;y:number;owner:number;armed:number};
type Explosion={x:number;y:number;color:string;at:number};
type State={code:string;phase:string;countdown?:number;roundId?:number;theme?:string;explosion?:Explosion|null;players:Player[];walls:Wall[];bullets:Bullet[];trails?:Trail[];powerups?:Powerup[];mines?:Mine[];winner?:number};

const W=1400,H=1000;
const POWER_STYLE:Record<string,{label:string;color:string}>={speed:{label:'H',color:'#ffe66d'},double:{label:'2',color:'#ff9f43'},shield:{label:'K',color:'#74b9ff'},mine:{label:'M',color:'#ff5e67'},rocket:{label:'R',color:'#ff7b31'},invisible:{label:'G',color:'#b388ff'}};
const THEMES:Record<string,{name:string;floor:string;accent:string;wall:string;border:string}>={
  neon:{name:'NEON ŞEHİR',floor:'#070b18',accent:'#14204a',wall:'#426ba8',border:'#77a8ff'},
  desert:{name:'ÇÖL ÜSSÜ',floor:'#25170f',accent:'#6b3d20',wall:'#b9783e',border:'#ffc36b'},
  ice:{name:'BUZ GEÇİDİ',floor:'#061825',accent:'#164b65',wall:'#70bdd5',border:'#c5f7ff'},
  space:{name:'UZAY İSTASYONU',floor:'#03030c',accent:'#251848',wall:'#6550a4',border:'#bd93ff'},
};

function drawBackground(ctx:CanvasRenderingContext2D,theme:string,time:number){
  const style=THEMES[theme]??THEMES.neon;ctx.fillStyle=style.floor;ctx.fillRect(0,0,W,H);ctx.save();ctx.globalAlpha=.26;ctx.strokeStyle=style.accent;ctx.fillStyle=style.accent;
  if(theme==='space'){for(let i=0;i<90;i++){const x=(i*193)%W,y=(i*347)%H,r=i%7===0?3:1.5;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()}}
  else if(theme==='desert'){for(let i=0;i<70;i++){const x=(i*227)%W,y=(i*131)%H;ctx.beginPath();ctx.arc(x,y,2+(i%4),0,Math.PI*2);ctx.fill()}}
  else if(theme==='ice'){ctx.lineWidth=2;for(let i=0;i<16;i++){const x=(i*173)%W,y=(i*239)%H;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+35,y+22);ctx.lineTo(x+18,y+55);ctx.stroke()}}
  else{ctx.lineWidth=1;for(let x=0;x<W;x+=80){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}for(let y=0;y<H;y+=80){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}ctx.globalAlpha=.12+.05*Math.sin(time/500)}ctx.restore();
}

function drawTank(ctx:CanvasRenderingContext2D,player:Player,index:number,slot:number,time:number,hide:boolean){
  if(hide||(player.effects?.invisible&&index!==slot))return;const color=index===0?'#17e6ff':'#ff3fb4',treadOffset=player.moving?(time/28)%12:0;ctx.save();if(player.effects?.invisible)ctx.globalAlpha=.38;ctx.translate(player.x,player.y);
  if(player.effects?.shield){ctx.strokeStyle='#b9f5ff';ctx.shadowColor='#74dfff';ctx.shadowBlur=28;ctx.lineWidth=6;ctx.beginPath();ctx.arc(0,0,57+Math.sin(time/100)*2,0,Math.PI*2);ctx.stroke()}
  ctx.rotate(player.a);ctx.shadowColor=color;ctx.shadowBlur=16;ctx.fillStyle='#111827';ctx.fillRect(-36,-31,70,15);ctx.fillRect(-36,16,70,15);ctx.fillStyle=color;for(let x=-34+treadOffset;x<34;x+=12){ctx.fillRect(x,-29,7,11);ctx.fillRect(x,18,7,11)}
  ctx.beginPath();ctx.moveTo(-27,-22);ctx.lineTo(22,-22);ctx.lineTo(33,-13);ctx.lineTo(33,13);ctx.lineTo(22,22);ctx.lineTo(-27,22);ctx.lineTo(-34,12);ctx.lineTo(-34,-12);ctx.closePath();ctx.fillStyle=color;ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#ffffff44';ctx.fillRect(-18,-16,31,5);ctx.fillStyle='#071225';ctx.fillRect(-23,-10,15,20);ctx.restore();
  ctx.save();if(player.effects?.invisible)ctx.globalAlpha=.38;ctx.translate(player.x,player.y);ctx.rotate(player.turret??player.a);ctx.shadowColor=color;ctx.shadowBlur=16;ctx.fillStyle='#e8fbff';ctx.fillRect(4,-6,58,12);ctx.fillStyle=color;ctx.beginPath();ctx.arc(2,0,19,0,Math.PI*2);ctx.fill();ctx.fillStyle='#081020';ctx.beginPath();ctx.arc(2,0,9,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.fillRect(54,-4,12,8);ctx.restore();
}

function drawExplosion(ctx:CanvasRenderingContext2D,explosion:Explosion|undefined|null,time:number){
  if(!explosion)return;const age=time-explosion.at;if(age<0||age>1500)return;const progress=age/1500;ctx.save();ctx.globalCompositeOperation='lighter';for(let i=0;i<42;i++){const angle=i*2.399+(i%3)*.17,speed=70+(i*37)%170,distance=speed*progress,size=Math.max(0,10*(1-progress))+(i%4);ctx.globalAlpha=1-progress;ctx.fillStyle=i%3===0?'#fff3a0':i%3===1?'#ff7a2f':explosion.color;ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=18;ctx.beginPath();ctx.arc(explosion.x+Math.cos(angle)*distance,explosion.y+Math.sin(angle)*distance+110*progress*progress,size,0,Math.PI*2);ctx.fill()}ctx.globalAlpha=Math.max(0,1-progress*2);ctx.strokeStyle='#fff4c2';ctx.lineWidth=14*(1-progress);ctx.beginPath();ctx.arc(explosion.x,explosion.y,35+progress*120,0,Math.PI*2);ctx.stroke();ctx.restore();
}

function draw(ctx:CanvasRenderingContext2D,state:State,slot:number,time:number,transitionAge:number){
  const canvas=ctx.canvas,scale=Math.min(canvas.width/W,canvas.height/H),theme=state.theme??'neon',style=THEMES[theme]??THEMES.neon;ctx.setTransform(scale,0,0,scale,(canvas.width-W*scale)/2,(canvas.height-H*scale)/2);ctx.clearRect(0,0,W,H);drawBackground(ctx,theme,time);
  ctx.fillStyle=style.wall;ctx.shadowColor=style.border;ctx.shadowBlur=12;state.walls.forEach(wall=>ctx.fillRect(wall.x,wall.y,wall.w,wall.h));ctx.shadowBlur=0;ctx.strokeStyle=style.border;ctx.lineWidth=8;ctx.strokeRect(4,4,W-8,H-8);
  (state.powerups??[]).forEach(power=>{const powerStyle=POWER_STYLE[power.type]??{label:'?',color:'#fff'},pulse=1+Math.sin(time/180)*.12;ctx.save();ctx.translate(power.x,power.y);ctx.scale(pulse,pulse);ctx.fillStyle='#081020';ctx.strokeStyle=powerStyle.color;ctx.shadowColor=powerStyle.color;ctx.shadowBlur=22;ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,0,24,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle=powerStyle.color;ctx.font='700 25px Rajdhani';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(powerStyle.label,0,2);ctx.restore()});
  (state.mines??[]).forEach(mine=>{const color=mine.owner===0?'#17e6ff':'#ff3fb4';ctx.save();ctx.translate(mine.x,mine.y);ctx.fillStyle='#090b12';ctx.strokeStyle=color;ctx.lineWidth=4;ctx.shadowColor=color;ctx.shadowBlur=mine.armed<=0?15:4;ctx.beginPath();for(let i=0;i<8;i++){const angle=i*Math.PI/4,r=i%2?12:22,x=Math.cos(angle)*r,y=Math.sin(angle)*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.closePath();ctx.fill();ctx.stroke();ctx.restore()});
  (state.trails??[]).forEach(trail=>{const color=trail.owner===0?'#17e6ff':'#ff3fb4';ctx.save();ctx.globalAlpha=Math.min(1,trail.life/10);ctx.strokeStyle=color;ctx.shadowColor=color;ctx.shadowBlur=15;ctx.lineWidth=5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(trail.x1,trail.y1);ctx.lineTo(trail.x2,trail.y2);ctx.lineTo(trail.x3,trail.y3);ctx.stroke();for(let i=0;i<9;i++){const angle=i*2.4+trail.life*.2,distance=(18-trail.life)*2+i*3;ctx.fillStyle=i%2?'#fff':color;ctx.beginPath();ctx.arc(trail.x2+Math.cos(angle)*distance,trail.y2+Math.sin(angle)*distance,2+i%3,0,Math.PI*2);ctx.fill()}ctx.restore()});
  state.bullets.forEach(bullet=>{const color=bullet.type==='rocket'?'#ff8a35':bullet.owner===0?'#17e6ff':'#ff3fb4',speed=Math.hypot(bullet.vx,bullet.vy)||1;ctx.save();ctx.strokeStyle=color;ctx.globalAlpha=.55;ctx.lineWidth=bullet.type==='rocket'?10:5;ctx.shadowColor=color;ctx.shadowBlur=18;ctx.beginPath();ctx.moveTo(bullet.x-bullet.vx/speed*42,bullet.y-bullet.vy/speed*42);ctx.lineTo(bullet.x,bullet.y);ctx.stroke();ctx.globalAlpha=1;ctx.fillStyle=color;ctx.beginPath();ctx.arc(bullet.x,bullet.y,bullet.type==='rocket'?14:8,0,Math.PI*2);ctx.fill();ctx.restore()});
  state.players.forEach((player,index)=>drawTank(ctx,player,index,slot,time,Boolean(state.explosion&&state.phase!=='playing'&&Math.hypot(player.x-state.explosion.x,player.y-state.explosion.y)<5)));
  drawExplosion(ctx,state.explosion,time);
  if(transitionAge<750){const progress=transitionAge/750;ctx.save();ctx.globalAlpha=Math.max(0,1-progress);ctx.fillStyle=style.floor;ctx.fillRect(0,0,W,H);ctx.globalAlpha=Math.sin(progress*Math.PI);ctx.fillStyle=style.border;ctx.shadowColor=style.border;ctx.shadowBlur=40;ctx.fillRect(progress*W-45,0,90,H);ctx.restore()}
}

function App(){
  const [socket,setSocket]=useState<Socket>();const [state,setState]=useState<State>();const [slot,setSlot]=useState<number>();const [code,setCode]=useState('');const [join,setJoin]=useState('');const [speed,setSpeed]=useState('normal');const [err,setErr]=useState('');const [drive,setDrive]=useState({x:0,y:0});
  const canvas=useRef<HTMLCanvasElement>(null),controls=useRef({move:0,heading:0}),connectedToGame=useRef(false),latestState=useRef<State>(),lastRound=useRef<number>(),transitionStart=useRef(0);
  latestState.current=state;
  const requestLandscape=async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen?.()}catch{}const orientation=screen.orientation as unknown as{lock?:(mode:string)=>Promise<void>};void orientation.lock?.('landscape').catch(()=>undefined)};
  useEffect(()=>{const connection=io();setSocket(connection);connection.on('room-joined',(data:{code:string;slot:number;state:State})=>{setCode(data.code);setSlot(data.slot);setState(data.state);setErr('')});connection.on('game-state',setState);connection.on('round-result',setState);connection.on('match-result',setState);connection.on('player-disconnected',()=>setErr('Rakibin bağlantısı kesildi. Oda kısa süre içinde kapanacak.'));connection.on('room-error',setErr);return()=>{connection.close()}},[]);
  connectedToGame.current=Boolean(state&&slot!==undefined);
  useEffect(()=>{if(!socket||slot===undefined||!code)return;const timer=setInterval(()=>{if(connectedToGame.current)socket.emit('player-input',{code,input:controls.current})},1000/60);return()=>clearInterval(timer)},[slot,socket,code]);
  useEffect(()=>{const element=canvas.current;if(!element||slot===undefined)return;const context=element.getContext('2d')!;let frame=0;const resize=()=>{element.width=element.clientWidth*devicePixelRatio;element.height=element.clientHeight*devicePixelRatio};const animate=()=>{const current=latestState.current,now=Date.now();if(current){if(lastRound.current!==current.roundId){lastRound.current=current.roundId;transitionStart.current=now}draw(context,current,slot,now,now-transitionStart.current)}frame=requestAnimationFrame(animate)};resize();animate();window.addEventListener('resize',resize);return()=>{cancelAnimationFrame(frame);window.removeEventListener('resize',resize)}},[slot,code]);
  const share=async()=>{const text=`Neon Tank Düellosu odama katıl: ${code}`;if(navigator.share)await navigator.share({title:'Neon Tank Düellosu',text});else await navigator.clipboard.writeText(code)};
  const pointer=(event:React.PointerEvent<HTMLDivElement>)=>{const box=event.currentTarget.getBoundingClientRect(),rawX=(event.clientX-box.left)/box.width-.5,rawY=(event.clientY-box.top)/box.height-.5,length=Math.hypot(rawX,rawY),factor=length>.5?.5/length:1,x=rawX*factor,y=rawY*factor,power=Math.min(1,Math.hypot(x,y)*2);controls.current={move:power,heading:power>.05?Math.atan2(y,x):controls.current.heading};setDrive({x:x*2,y:y*2})};
  const release=()=>{controls.current={...controls.current,move:0};setDrive({x:0,y:0})};
  if(!state)return <main className="lobby"><div className="menu-stars"/><div className="game-badge">ONLINE • 1V1</div><div className="tank-logo"><span>◢</span><i/></div><div className="brand">NEON<br/><b>TANK DUEL</b></div><p className="tagline">Labirente gir. Sekmeyi hesapla. Rakibini yok et.</p><div className="feature-row"><span>⚡ GÜÇLER</span><span>◈ 4 ARENA</span><span>● ONLINE</span></div><section className="lobby-card"><label className="speed">TANK HIZI<select value={speed} onChange={event=>setSpeed(event.target.value)}><option value="slow">Yavaş</option><option value="normal">Normal</option><option value="fast">Hızlı</option></select></label><button className="primary" onClick={()=>{requestLandscape();socket?.emit('create-room',{speed})}}>＋ ODA OLUŞTUR</button><div className="or"><span/>VEYA<span/></div><div className="join-row"><input value={join} onChange={event=>setJoin(event.target.value.toUpperCase())} maxLength={4} placeholder="ODA KODU"/><button className="secondary" onClick={()=>{requestLandscape();socket?.emit('join-room',join)}}>KATIL</button></div></section>{err&&<small>{err}</small>}<footer>İLK 5 SKOR MAÇI KAZANIR</footer></main>;
  const player=state.players[slot!],effects=player?.effects,ammo=5-state.bullets.filter(bullet=>bullet.owner===slot).length,theme=THEMES[state.theme??'neon']??THEMES.neon;
  const leave=()=>{socket?.emit('leave-room',{code});setState(undefined);setSlot(undefined);setCode('');setErr('')};
  const headline=state.phase==='waiting'?'Rakip bekleniyor…':state.phase==='countdown'?'TUR HAZIRLANIYOR':state.phase==='result'?(state.winner===slot?'ELİ KAZANDIN!':'RAKİBİN KAZANDI'):state.phase==='match-over'?(state.winner===slot?'MAÇ SENİN!':'MAÇ BİTTİ'):'HEDEFİ YOK ET';
  const activePowers=[effects?.speed&&'⚡ HIZ',effects?.double&&'Ⅱ ÇİFT',effects?.shield&&'◇ KALKAN',effects?.invisible&&'◌ GİZLİ',Boolean(effects?.rockets)&&`R ROKET ×${effects?.rockets}`].filter(Boolean);
  return <main className={`game theme-${state.theme??'neon'}`}><header><button className="menu" onClick={leave}>MENÜ</button><div className="round-title"><strong>{headline}</strong><em>{theme.name}</em></div><span className="score"><i>{player?.score??0}</i> — {state.players[slot===0?1:0]?.score??0}</span></header><div className="power-status">{activePowers.map(item=><span key={String(item)}>{item}</span>)}</div><canvas ref={canvas}/>{state.phase==='waiting'&&<section className="invite"><b>Oda kodun: {code}</b><button onClick={share}>DAVETİ PAYLAŞ</button></section>}{state.phase==='countdown'&&<div className="countdown" key={state.countdown}>{state.countdown||'BAŞLA!'}</div>}<section className="controls"><div className="stick move" onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);pointer(event)}} onPointerMove={pointer} onPointerUp={release} onPointerCancel={release}><span className="knob" style={{transform:`translate(${drive.x*32}px,${drive.y*32}px)`}}>SÜR</span></div>{Boolean(effects?.mines)&&<button className="mine-button" onPointerDown={event=>{event.preventDefault();socket?.emit('deploy-mine',{code})}}>MAYIN<br/>×{effects?.mines}</button>}<button className="fire" onPointerDown={event=>{event.preventDefault();socket?.emit('fire',{code})}}><span>ATEŞ</span><span className="ammo" aria-label={`${ammo} mermi kaldı`}>{[0,1,2,3,4].map(index=><i key={index} className={index<ammo?'loaded':'used'}>●</i>)}</span></button></section>{err&&<small>{err}</small>}</main>;
}

createRoot(document.getElementById('root')!).render(<App/>);
