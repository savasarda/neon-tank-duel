export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function circleTouchesRect(x, y, radius, wall) {
  const closestX = clamp(x, wall.x, wall.x + wall.w);
  const closestY = clamp(y, wall.y, wall.y + wall.h);
  return (x - closestX) ** 2 + (y - closestY) ** 2 <= radius ** 2;
}

export function circleTouchesWorld(walls, x, y, radius, width, height) {
  if (x - radius <= 0 || y - radius <= 0 || x + radius >= width || y + radius >= height) return true;
  return walls.some(wall => circleTouchesRect(x, y, radius, wall));
}

export function moveCircle(walls, x, y, dx, dy, radius, width, height) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 2));
  const stepX = dx / steps, stepY = dy / steps;
  let nextX = x, nextY = y;
  for (let i = 0; i < steps; i++) {
    if (!circleTouchesWorld(walls, nextX + stepX, nextY, radius, width, height)) nextX += stepX;
    if (!circleTouchesWorld(walls, nextX, nextY + stepY, radius, width, height)) nextY += stepY;
  }
  return { x: nextX, y: nextY };
}

export function advanceBullet(bullet, walls, radius, width, height) {
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
