interface Point { x: number; y: number; }
interface Rect { left: number; right: number; top: number; bottom: number; }
export function headingToSubmenu(origin: Point, previous: Point, point: Point, submenu: Rect, side: 'left' | 'right') {
  const direction = side === 'right' ? 1 : -1;
  const edge = side === 'right' ? submenu.left : submenu.right;
  if (direction * (point.x - previous.x) < -1 || direction * (point.x - origin.x) < 0 || direction * (edge - point.x) < 0) return false;
  const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const top = { x: edge, y: submenu.top - 8 }, bottom = { x: edge, y: submenu.bottom + 8 };
  const signs = [cross(origin, top, point), cross(top, bottom, point), cross(bottom, origin, point)];
  return signs.every(value => value >= 0) || signs.every(value => value <= 0);
}
