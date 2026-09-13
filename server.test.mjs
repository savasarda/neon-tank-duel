import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceBullet, circleTouchesWorld, moveCircle } from './game-physics.mjs';
import { createMaze } from './maze.mjs';

const WIDTH=600,HEIGHT=400,WALLS=[{x:290,y:40,w:20,h:320}];

test('tank cannot cross a full-height wall from any approach angle',()=>{
  for(let angle=0;angle<Math.PI*2;angle+=Math.PI/90){let p={x:120,y:200};
    for(let i=0;i<500;i++)p=moveCircle(WALLS,p.x,p.y,Math.cos(angle)*8,Math.sin(angle)*8,30,WIDTH,HEIGHT);
    assert.equal(circleTouchesWorld(WALLS,p.x,p.y,30,WIDTH,HEIGHT),false);
    if(Math.cos(angle)>0.5)assert.ok(p.x<290,'tank wall centerline crossed');
  }
});

test('bullet always reflects before entering a vertical wall',()=>{
  for(let degrees=-75;degrees<=75;degrees+=3){const angle=degrees*Math.PI/180;const b={x:80,y:200,vx:Math.cos(angle)*18,vy:Math.sin(angle)*18};
    for(let i=0;i<180;i++){advanceBullet(b,WALLS,8,WIDTH,HEIGHT);assert.equal(circleTouchesWorld(WALLS,b.x,b.y,8,WIDTH,HEIGHT),false)}
  }
});

test('bullet cannot escape through a joined wall corner',()=>{
  const corner=[{x:290,y:40,w:20,h:180},{x:290,y:200,w:180,h:20}];const b={x:200,y:110,vx:14,vy:14};
  for(let i=0;i<240;i++){advanceBullet(b,corner,8,WIDTH,HEIGHT);assert.equal(circleTouchesWorld(corner,b.x,b.y,8,WIDTH,HEIGHT),false)}
});

test('both tanks spawn clear of walls and can leave their starting cell in 1000 random mazes',()=>{
  const width=1400,height=1000,wallThickness=16,tankRadius=48;
  const directions=[[1,0],[-1,0],[0,1],[0,-1]];
  for(let iteration=0;iteration<1000;iteration++){
    const {walls,spawns}=createMaze(width,height,wallThickness);
    for(const spawn of spawns){
      assert.equal(circleTouchesWorld(walls,spawn.x,spawn.y,tankRadius,width,height),false,`spawn intersects a wall in maze ${iteration}`);
      const canLeave=directions.some(([dx,dy])=>{
        let position={...spawn};
        for(let step=0;step<80;step++)position=moveCircle(walls,position.x,position.y,dx*3,dy*3,tankRadius,width,height);
        return Math.hypot(position.x-spawn.x,position.y-spawn.y)>60;
      });
      assert.equal(canLeave,true,`spawn has no traversable exit in maze ${iteration}`);
    }
  }
});
