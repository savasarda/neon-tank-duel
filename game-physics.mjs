export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function circleTouchesRect(x, y, radius, wall) {
  const closestX = clamp(x, wall.x, wall.x + wall.w);
  const closestY = clamp(y, wall.y, wall.y + wall.h);
  // Yalnızca gerçek örtüşmeyi çarpışma say. Tam teğet konumda tankın
  // duvar boyunca kayabilmesi gerekir; aksi halde köşelerde kilitlenir.
  return (x - closestX) ** 2 + (y - closestY) ** 2 < radius ** 2 - 1e-6;
}

export function sweptWalls(walls, x, y, dx, dy, radius) {
  const left = Math.min(x, x + dx) - radius, right = Math.max(x, x + dx) + radius;
  const top = Math.min(y, y + dy) - radius, bottom = Math.max(y, y + dy) + radius;
  return walls.filter(w => w.x <= right && w.x + w.w >= left && w.y <= bottom && w.y + w.h >= top);
}

export function circleTouchesWorld(walls, x, y, radius, width, height) {
  if (x - radius < 0 || y - radius < 0 || x + radius > width || y + radius > height) return true;
  return walls.some(wall => circleTouchesRect(x, y, radius, wall));
}

export function moveCircle(walls, x, y, dx, dy, radius, width, height) {
  if (dx === 0 && dy === 0) return { x, y };
  walls = sweptWalls(walls, x, y, dx, dy, radius);
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 2));
  const stepX = dx / steps, stepY = dy / steps;
  let nextX = x, nextY = y;
  for (let i = 0; i < steps; i++) {
    if (!circleTouchesWorld(walls, nextX + stepX, nextY, radius, width, height)) nextX += stepX;
    if (!circleTouchesWorld(walls, nextX, nextY + stepY, radius, width, height)) nextY += stepY;
  }
  return { x: nextX, y: nextY };
}

export function circlesOverlap(first, second, radius) {
  return (first.x - second.x) ** 2 + (first.y - second.y) ** 2 < (radius * 2) ** 2;
}

export function preventCircleOverlap(current, proposed, radius) {
  if (!circlesOverlap(proposed[0], proposed[1], radius)) return proposed;

  const firstOnly = [proposed[0], current[1]];
  const secondOnly = [current[0], proposed[1]];
  const firstIsSafe = !circlesOverlap(firstOnly[0], firstOnly[1], radius);
  const secondIsSafe = !circlesOverlap(secondOnly[0], secondOnly[1], radius);
  if (firstIsSafe && !secondIsSafe) return firstOnly;
  if (secondIsSafe && !firstIsSafe) return secondOnly;
  return current.map(position => ({ ...position }));
}

export function preventMultipleCircleOverlap(current, proposed, radius) {
  const result = proposed.map(position => ({ ...position }));
  let changed = true;
  while (changed) {
    changed = false;
    for (let first = 0; first < result.length; first++) {
      for (let second = first + 1; second < result.length; second++) {
        if (!circlesOverlap(result[first], result[second], radius)) continue;
        const firstMoved = result[first].x !== current[first].x || result[first].y !== current[first].y;
        const secondMoved = result[second].x !== current[second].x || result[second].y !== current[second].y;
        if (firstMoved) result[first] = { ...current[first] };
        if (secondMoved) result[second] = { ...current[second] };
        changed = firstMoved || secondMoved;
      }
    }
  }
  return result;
}

export function advanceBullet(bullet, walls, radius, width, height) {
  walls = sweptWalls(walls, bullet.x, bullet.y, bullet.vx, bullet.vy, radius);
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(bullet.vx), Math.abs(bullet.vy)) * 2));
  const stepX = bullet.vx / steps, stepY = bullet.vy / steps;
  for (let i = 0; i < steps; i++) {
    const hitX = circleTouchesWorld(walls, bullet.x + stepX, bullet.y, radius, width, height);
    const hitY = circleTouchesWorld(walls, bullet.x, bullet.y + stepY, radius, width, height);
    const hitCorner = !hitX && !hitY && circleTouchesWorld(walls, bullet.x + stepX, bullet.y + stepY, radius, width, height);
    if (hitX || hitY || hitCorner) {
      if (hitX || hitCorner) bullet.vx *= -1;
      if (hitY || hitCorner) bullet.vy *= -1;
      return true;
    }
    bullet.x += stepX;
    bullet.y += stepY;
  }
  return false;
}

export function advancePiercingBullet(bullet, radius, width, height) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(bullet.vx), Math.abs(bullet.vy)) * 2));
  let bounced = false;
  for (let i = 0; i < steps; i++) {
    let nextX = bullet.x + bullet.vx / steps;
    let nextY = bullet.y + bullet.vy / steps;
    if (nextX - radius < 0 || nextX + radius > width) {
      bullet.vx *= -1;
      nextX = bullet.x + bullet.vx / steps;
      bounced = true;
    }
    if (nextY - radius < 0 || nextY + radius > height) {
      bullet.vy *= -1;
      nextY = bullet.y + bullet.vy / steps;
      bounced = true;
    }
    bullet.x = nextX;
    bullet.y = nextY;
  }
  return bounced;
}
