import { circleTouchesWorld } from './game-physics.mjs';

export const SURVIVOR_ARENA = { width: 1800, height: 1200, radius: 30, tankRadius: 25 };
export const RESPAWN_MS = 3000;
export const SPAWN_SHIELD_MS = 1500;

export function applySurvivorDeath(room, winner, loser, now, winScore = 5) {
  const target = room.players[loser];
  if (!target || target.respawnAt || room.phase !== 'playing') return false;
  target.respawnAt = now + RESPAWN_MS;
  target.input = { move: 0, heading: target.a };
  if (target.inputQueue) target.inputQueue.commands = [];
  target.effects = Object.fromEntries(Object.keys(target.effects).map(key => [key, 0]));
  target.selfHits = 0;
  target.deaths = (target.deaths || 0) + 1;
  room.players[winner].score++;
  room.bullets = room.bullets.filter(bullet => bullet.owner !== loser);
  room.mines = room.mines.filter(mine => mine.owner !== loser);
  if (room.players[winner].score >= winScore) {
    room.phase = 'match-over';
    room.winner = winner;
  }
  return true;
}

export function pickRespawn(room, random = Math.random) {
  const { width, height, radius } = room.arena;
  const margin = radius + 25;
  const safe = (x, y) =>
    !circleTouchesWorld(room.walls, x, y, radius, width, height) &&
    room.players.every(player => player.respawnAt || (player.x - x) ** 2 + (player.y - y) ** 2 >= 180 ** 2) &&
    room.bullets.every(bullet => (bullet.x - x) ** 2 + (bullet.y - y) ** 2 >= 110 ** 2) &&
    room.mines.every(mine => (mine.x - x) ** 2 + (mine.y - y) ** 2 >= 110 ** 2);

  for (let attempt = 0; attempt < 300; attempt++) {
    const x = margin + random() * (width - margin * 2);
    const y = margin + random() * (height - margin * 2);
    if (safe(x, y)) return { x, y };
  }
  for (let y = margin; y < height - margin; y += radius * 2) {
    for (let x = margin; x < width - margin; x += radius * 2) {
      if (safe(x, y)) return { x, y };
    }
  }
  return null;
}
