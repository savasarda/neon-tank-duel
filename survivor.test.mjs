import test from 'node:test';
import assert from 'node:assert/strict';
import { createMaze } from './maze.mjs';
import { circleTouchesWorld } from './game-physics.mjs';
import { advanceTank } from './tank-motion.mjs';
import { applySurvivorDeath, pickRespawn, SURVIVOR_ARENA, RESPAWN_MS } from './survivor.mjs';

const player = (x, y, score = 0) => ({ x, y, a: 0, score, effects: { speedUntil: 100, mines: 1 }, inputQueue: { commands: [{ seq: 1 }] } });
const room = () => ({ phase: 'playing', roundId: 7, walls: [], arena: SURVIVOR_ARENA, players: [player(200, 200), player(1000, 800)], bullets: [{ owner: 1 }, { owner: 0 }], mines: [{ owner: 1 }] });

test('Survivor death scores without ending the round and ignores repeated hits', () => {
  const match = room();
  assert.equal(applySurvivorDeath(match, 0, 1, 1000), true);
  assert.equal(match.phase, 'playing');
  assert.equal(match.roundId, 7);
  assert.equal(match.players[0].score, 1);
  assert.equal(match.players[1].respawnAt, 1000 + RESPAWN_MS);
  assert.deepEqual(match.players[1].inputQueue.commands, []);
  assert.equal(match.bullets.length, 1);
  assert.equal(match.mines.length, 0);
  assert.equal(applySurvivorDeath(match, 0, 1, 1001), false);
  assert.equal(match.players[0].score, 1);
});

test('Survivor ends the match on the fifth point', () => {
  const match = room();
  match.players[0].score = 4;
  applySurvivorDeath(match, 0, 1, 1000);
  assert.equal(match.phase, 'match-over');
  assert.equal(match.winner, 0);
  assert.equal(match.players[0].score, 5);
});

test('Survivor respawn chooses a clear point away from combat', () => {
  const match = room();
  const maze = createMaze(SURVIVOR_ARENA.width, SURVIVOR_ARENA.height, 16);
  match.walls = maze.walls;
  match.players[1].respawnAt = 4000;
  match.bullets = [{ x: 800, y: 600 }];
  match.mines = [{ x: 700, y: 500 }];
  for (let index = 0; index < 30; index++) {
    const spawn = pickRespawn(match);
    assert.ok(spawn);
    assert.equal(circleTouchesWorld(match.walls, spawn.x, spawn.y, SURVIVOR_ARENA.radius, SURVIVOR_ARENA.width, SURVIVOR_ARENA.height), false);
    assert.ok(Math.hypot(spawn.x - match.players[0].x, spawn.y - match.players[0].y) >= 180);
    assert.ok(Math.hypot(spawn.x - 800, spawn.y - 600) >= 110);
  }
});

test('Survivor movement uses the larger arena and smaller collision radius', () => {
  const next = advanceTank({ x: 1600, y: 1000, a: 0 }, { move: 1, heading: 0 }, [], 7.1, [], SURVIVOR_ARENA);
  assert.ok(next.x > 1600);
});

test('Survivor corner spawns remain clear in larger random mazes', () => {
  for (let index = 0; index < 100; index++) {
    const maze = createMaze(SURVIVOR_ARENA.width, SURVIVOR_ARENA.height, 16);
    for (const spawn of maze.spawns) {
      assert.equal(circleTouchesWorld(maze.walls, spawn.x, spawn.y, SURVIVOR_ARENA.radius, SURVIVOR_ARENA.width, SURVIVOR_ARENA.height), false);
    }
  }
});
