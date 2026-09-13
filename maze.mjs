export const MAZE_COLS = 8;
export const MAZE_ROWS = 6;
export const MAZE_MARGIN = 40;

export function createMaze(width, height, wallThickness, random = Math.random) {
  const cols = MAZE_COLS;
  const rows = MAZE_ROWS;
  const margin = MAZE_MARGIN;
  const cellWidth = (width - margin * 2) / cols;
  const cellHeight = (height - margin * 2) / rows;
  const cells = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ seen: false, right: true, bottom: true })),
  );

  const stack = [[0, 0]];
  cells[0][0].seen = true;
  while (stack.length) {
    const [x, y] = stack.at(-1);
    const options = [];
    if (x > 0 && !cells[y][x - 1].seen) options.push([x - 1, y, 'left']);
    if (x < cols - 1 && !cells[y][x + 1].seen) options.push([x + 1, y, 'right']);
    if (y > 0 && !cells[y - 1][x].seen) options.push([x, y - 1, 'up']);
    if (y < rows - 1 && !cells[y + 1][x].seen) options.push([x, y + 1, 'down']);
    if (!options.length) {
      stack.pop();
      continue;
    }

    const [nextX, nextY, direction] = options[Math.floor(random() * options.length)];
    if (direction === 'right') cells[y][x].right = false;
    if (direction === 'left') cells[nextY][nextX].right = false;
    if (direction === 'down') cells[y][x].bottom = false;
    if (direction === 'up') cells[nextY][nextX].bottom = false;
    cells[nextY][nextX].seen = true;
    stack.push([nextX, nextY]);
  }

  for (let i = 0; i < 4; i++) {
    const x = Math.floor(random() * cols);
    const y = Math.floor(random() * rows);
    if (random() > 0.5 && x < cols - 1) cells[y][x].right = false;
    else if (y < rows - 1) cells[y][x].bottom = false;
  }

  const walls = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cell = cells[y][x];
      if (cell.right) {
        walls.push({
          x: margin + (x + 1) * cellWidth - wallThickness / 2,
          y: margin + y * cellHeight,
          w: wallThickness,
          h: cellHeight + wallThickness,
        });
      }
      if (cell.bottom) {
        walls.push({
          x: margin + x * cellWidth,
          y: margin + (y + 1) * cellHeight - wallThickness / 2,
          w: cellWidth + wallThickness,
          h: wallThickness,
        });
      }
    }
  }

  // Bitişik parçaları tek dikdörtgende birleştirerek duvar ek yerlerini kapat.
  for (let i = 0; i < walls.length; i++) {
    for (let j = walls.length - 1; j > i; j--) {
      const a = walls[i];
      const b = walls[j];
      if (a.w === b.w && a.x === b.x && a.y <= b.y + b.h && b.y <= a.y + a.h) {
        const top = Math.min(a.y, b.y);
        const bottom = Math.max(a.y + a.h, b.y + b.h);
        a.y = top;
        a.h = bottom - top;
        walls.splice(j, 1);
      } else if (a.h === b.h && a.y === b.y && a.x <= b.x + b.w && b.x <= a.x + a.w) {
        const left = Math.min(a.x, b.x);
        const right = Math.max(a.x + a.w, b.x + b.w);
        a.x = left;
        a.w = right - left;
        walls.splice(j, 1);
      }
    }
  }

  return {
    walls,
    spawns: [
      { x: margin + cellWidth / 2, y: margin + cellHeight / 2 },
      { x: margin + (cols - 0.5) * cellWidth, y: margin + (rows - 0.5) * cellHeight },
      { x: margin + (cols - 0.5) * cellWidth, y: margin + cellHeight / 2 },
      { x: margin + cellWidth / 2, y: margin + (rows - 0.5) * cellHeight },
    ],
  };
}
