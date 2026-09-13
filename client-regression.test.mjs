import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const source=readFileSync(new URL('./src/main.tsx',import.meta.url),'utf8');
const functions=source.slice(source.indexOf('function blend('),source.indexOf('function App('));
const context=vm.createContext({});
vm.runInContext(ts.transpile(functions,{target:ts.ScriptTarget.ES2022})+';globalThis.interpolate=smoothState',context);
const state=()=>({code:'TEST',phase:'playing',roundId:1,players:[{x:100,y:100,a:0,turret:0}],bullets:[]});
test('rendering a first or new-round snapshot never mutates authoritative players',()=>{
 const current=state();const before=JSON.stringify(current);const display=context.interpolate(undefined,current,1);
 display.players[0].x=900;assert.equal(JSON.stringify(current),before);
});
test('removed bullet does not transfer its position to another bullet',()=>{
 const from=state(),to=state();from.bullets=[{id:1,bounces:0,x:10,y:10},{id:2,bounces:0,x:100,y:100}];to.bullets=[{id:2,bounces:0,x:120,y:100}];
 const display=context.interpolate(from,to,.5);assert.equal(display.bullets[0].x,110);assert.equal(to.bullets[0].x,120);
});
test('a reflected bullet is not interpolated across its pre-bounce path',()=>{
 const from=state(),to=state();from.bullets=[{id:1,bounces:0,x:10,y:10}];to.bullets=[{id:1,bounces:1,x:20,y:10}];assert.equal(context.interpolate(from,to,.5).bullets[0].x,20);
});
