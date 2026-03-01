/**
 * Applies position/zoom styles to images that have data-pos-x (focus/cover mode).
 * Call on the editor container and on blog/notes content containers after render.
 */
export function applyImageFocusStyles(container: HTMLElement | null): void {
  if (!container) return;
  container.querySelectorAll<HTMLImageElement>('img[data-pos-x]').forEach((img) => {
    const x = Number(img.getAttribute('data-pos-x')) || 50;
    const y = Number(img.getAttribute('data-pos-y')) || 50;
    const zoom = Number(img.getAttribute('data-zoom')) || 1;
    img.style.objectFit = 'cover';
    img.style.objectPosition = `${x}% ${y}%`;
    img.style.cursor = 'move';
    if (zoom > 1) {
      img.style.transform = `scale(${zoom})`;
      img.style.transformOrigin = `${x}% ${y}%`;
    } else {
      img.style.transform = '';
      img.style.transformOrigin = '';
    }
    const wrap = img.closest('.image-resizer') || img.parentElement;
    if (wrap && (wrap as HTMLElement).style) (wrap as HTMLElement).style.overflow = 'hidden';
  });
}
