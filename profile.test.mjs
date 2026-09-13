import test from 'node:test';
import assert from 'node:assert/strict';
import {assignProfile,TANK_COLORS} from './player-profile.mjs';
test('three matching profiles get distinct names and colors',()=>{
 const players=[];for(let i=0;i<3;i++)players.push(assignProfile({name:'Emin',color:TANK_COLORS[0].value,badge:'♛'},players));
 assert.equal(new Set(players.map(p=>p.name)).size,3);assert.equal(new Set(players.map(p=>p.color)).size,3);assert.ok(players.every(p=>p.badge==='♛'));
});
test('invalid profile input is bounded and Turkish names are retained',()=>{
 assert.equal(assignProfile({name:' Çağrı Öztürk '}).name,'Çağrı Öztürk');
 const profile=assignProfile({name:'\u202e<script>01234567890123456789',color:'url(evil)',badge:'<img>'});
 assert.ok(profile.name.length<=12);assert.ok(!profile.name.includes('<'));assert.ok(!profile.name.includes('\u202e'));assert.equal(profile.badge,'★');assert.ok(TANK_COLORS.some(c=>c.value===profile.color));
 assert.equal(assignProfile(null).name,'Oyuncu 1');
});
