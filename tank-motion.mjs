import { moveCircle } from './game-physics.mjs';

export const STEP_MS = 1000 / 60;
export const MAX_PENDING = 30;

// One command is exactly one physics step on both client and server.
export function advanceTank(position, input, walls, speed, others = [], arena = {}) {
  const move = Math.max(0, Math.min(1, input.move || 0));
  const difference = Math.atan2(Math.sin(input.heading - position.a), Math.cos(input.heading - position.a));
  const a = move > 0 ? position.a + Math.max(-0.3, Math.min(0.3, difference)) : position.a;
  const distance = move * speed / 2;
  const radius = arena.radius ?? 48;
  const next = moveCircle(walls, position.x, position.y, Math.cos(a) * distance, Math.sin(a) * distance, radius, arena.width ?? 1400, arena.height ?? 1000);
  if (others.some(other => (other.x - next.x) ** 2 + (other.y - next.y) ** 2 < (radius * 2) ** 2)) return { x: position.x, y: position.y, a };
  return { ...next, a };
}

export function replayTank(authoritative, pending, walls, speed, others = [], arena = {}) {
  let position = { x: authoritative.x, y: authoritative.y, a: authoritative.a };
  for (const command of pending) position = advanceTank(position, command, walls, speed, others, arena);
  return position;
}

export function createInputQueue() {
  return { commands: [], received: 0, processed: 0, credit: 0 };
}

export function enqueueInputs(queue, commands) {
  if (!Array.isArray(commands) || commands.length > MAX_PENDING) return;
  for (const command of commands) {
    if (!command || !Number.isSafeInteger(command.seq) || command.seq <= queue.received || command.seq > queue.received + MAX_PENDING || !Number.isFinite(command.move) || !Number.isFinite(command.heading)) continue;
    if (queue.commands.length >= MAX_PENDING) break;
    queue.received = command.seq;
    queue.commands.push({ seq: command.seq, move: Math.max(0, Math.min(1, command.move)), heading: command.heading });
  }
}

export function consumeInputs(queue) {
  // Server time, not client timestamps, grants movement. Bounded catch-up handles batching.
  queue.credit = Math.min(6, queue.credit + 1);
  const commands = queue.commands.splice(0, Math.min(2, queue.credit));
  queue.credit -= commands.length;
  for (const command of commands) queue.processed = command.seq;
  return commands;
}
