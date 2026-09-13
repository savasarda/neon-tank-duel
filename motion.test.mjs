import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceTank,replayTank,createInputQueue,enqueueInputs,consumeInputs} from './tank-motion.mjs';
import {circleTouchesWorld} from './game-physics.mjs';

for(const latency of [0,3,8])for(const frameTicks of [1,2]){
 test(`prediction and acknowledged replay agree: ${latency*2*1000/60|0}ms RTT, ${60/frameTicks}fps`,()=>{
  let local={x:600,y:400,a:0},server={...local},seq=0,pending=[],outbox=[],wire=[],acks=[],maxError=0;
  const queue=createInputQueue(),walls=[{x:800,y:250,w:16,h:500}],speed=7.1;
  for(let tick=0;tick<480;tick++){
   if(tick%frameTicks===0)for(let step=0;step<frameTicks;step++){
    const command={seq:++seq,move:tick>420?0:1,heading:Math.floor(tick/90)*Math.PI/2};
    local=advanceTank(local,command,walls,speed);pending.push(command);outbox.push(command);
   }
   if(tick%2===0){wire.push({at:tick+latency,commands:outbox});outbox=[]}
   while(wire[0]?.at<=tick)enqueueInputs(queue,wire.shift().commands);
   for(const command of consumeInputs(queue))server=advanceTank(server,command,walls,speed);
   if(tick%3===0)acks.push({at:tick+latency,position:{...server},seq:queue.processed});
   while(acks[0]?.at<=tick){const ack=acks.shift();pending=pending.filter(command=>command.seq>ack.seq);const corrected=replayTank(ack.position,pending,walls,speed);maxError=Math.max(maxError,Math.hypot(corrected.x-local.x,corrected.y-local.y));local=corrected}
   assert.equal(circleTouchesWorld(walls,local.x,local.y,48,1400,1000),false);
  }
  assert.ok(maxError<1e-8,`unexpected correction ${maxError}`);
 });
}

test('input floods and duplicate commands cannot grant unlimited movement',()=>{
 const queue=createInputQueue();const commands=Array.from({length:30},(_,i)=>({seq:i+1,move:1,heading:0}));
 enqueueInputs(queue,commands);enqueueInputs(queue,commands);assert.equal(queue.commands.length,30);
 assert.equal(consumeInputs(queue).length,1);assert.equal(consumeInputs(queue).length,1);
 for(let i=0;i<28;i++)consumeInputs(queue);assert.equal(queue.processed,30);
 enqueueInputs(queue,[{seq:31,move:Infinity,heading:0}]);assert.equal(queue.commands.length,0);
});

test('tangent steering slides along a wall without penetrating or sticking',()=>{
 const walls=[{x:500,y:0,w:16,h:1000}];let p={x:452,y:200,a:Math.PI/4};
 for(let i=0;i<60;i++){p=advanceTank(p,{move:1,heading:Math.PI/4},walls,7.1);assert.equal(circleTouchesWorld(walls,p.x,p.y,48,1400,1000),false)}
 assert.ok(p.y>340);assert.ok(p.x<=452);
});

test('turning and stopping are deterministic and other tanks remain solid',()=>{
 let p={x:400,y:400,a:Math.PI-.02};p=advanceTank(p,{move:1,heading:-Math.PI+.02},[],7.1);
 assert.ok(Math.abs(p.a-Math.PI)<.03);
 const stopped=advanceTank(p,{move:0,heading:0},[],7.1);assert.deepEqual(stopped,p);
 p={x:200,y:300,a:0};for(let i=0;i<100;i++)p=advanceTank(p,{move:1,heading:0},[],7.1,[{x:400,y:300}]);assert.ok(p.x<=304);
});
