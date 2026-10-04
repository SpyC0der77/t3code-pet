import type { ToastRect } from './toast-layout';
export function menuPlacement(area: ToastRect, point: { x: number; y: number }, heights: { main: number; sub: number; top: number }) {
  const margin = 8, gap = 4;
  const mainWidth = Math.min(264, area.width - margin * 2), subWidth = Math.min(240, area.width - margin * 2);
  const mainHeight = Math.min(heights.main, area.height - margin * 2), subHeight = Math.min(heights.sub, area.height - margin * 2);
  const clampX = (x: number, width: number) => Math.max(area.x + margin, Math.min(x, area.x + area.width - margin - width));
  const clampY = (y: number, height: number) => Math.max(area.y + margin, Math.min(y, area.y + area.height - margin - height));
  const main = { x: clampX(point.x, mainWidth), y: clampY(point.y, mainHeight), width: mainWidth, height: mainHeight };
  const stacked = main.x - area.x - margin < subWidth + gap && area.x + area.width - margin - main.x - mainWidth < subWidth + gap;
  const side = main.x + mainWidth + gap + subWidth <= area.x + area.width - margin ? 'right' : 'left';
  const sub = subHeight ? { x: stacked ? main.x : side === 'right' ? main.x + mainWidth + gap : main.x - subWidth - gap,
    y: clampY(main.y + (stacked ? 0 : heights.top), subHeight), width: subWidth, height: subHeight } : null;
  // Reserve the submenu's canvas before showing the menu. Resizing or moving
  // a transparent native window while its panels are visible causes flicker.
  const reservedX = stacked ? main.x : side === 'right' ? main.x + mainWidth + gap : main.x - subWidth - gap;
  const x = Math.min(main.x, reservedX), y = area.y + margin;
  const bounds = { x, y, width: Math.max(main.x + main.width, reservedX + subWidth) - x,
    height: area.height - margin * 2 };
  return { bounds, main: { ...main, x: main.x - x, y: main.y - y },
    sub: sub ? { ...sub, x: sub.x - x, y: sub.y - y } : null, side, stacked, availableHeight: area.height - margin * 2 } as const;
}
