export interface ToastRect { x: number; y: number; width: number; height: number; }
export function toastPlacement(area: ToastRect, pet?: ToastRect) {
  const width = Math.min(456, area.width - 32);
  const height = Math.min(640, area.height - 32);
  const cardWidth = width - 96;
  const side = pet && pet.x + pet.width + cardWidth + 24 > area.x + area.width ? 'left' : 'right';
  const vertical = pet && pet.y + pet.height / 2 < area.y + area.height / 2 ? 'top' : 'bottom';
  const x = pet ? side === 'right' ? pet.x + pet.width + 8 - 48 : pet.x - cardWidth - 8 - 48 : area.x + area.width - width - 16;
  const y = pet ? vertical === 'top' ? pet.y - 48 : pet.y + pet.height + 48 - height : area.y + area.height - height - 16;
  const bounds = {
    x: Math.round(Math.max(area.x + 16, Math.min(x, area.x + area.width - width - 16))),
    y: Math.round(Math.max(area.y + 16, Math.min(y, area.y + area.height - height - 16))),
    width, height,
  };
  const cardLeft = Math.max(8, Math.min(x + 48 - bounds.x, width - cardWidth - 8));
  const desiredAnchor = pet ? vertical === 'top' ? pet.y : pet.y + pet.height : bounds.y + height - 48;
  const anchor = Math.max(8, Math.min(desiredAnchor - bounds.y, height - 8));
  return { side, vertical, bounds, cardLeft, anchor } as const;
}
