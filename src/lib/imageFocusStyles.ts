/**
 * Applies position/zoom styles to images that have data-pos-x (focus/cover mode).
 * Call on the editor container and on blog/notes content containers after render.
 */
export function applyImageFocusStyles(container: HTMLElement | null): void {
  if (!container) return;
  container.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
    const hasFocus = img.hasAttribute('data-pos-x') || img.hasAttribute('data-zoom');
    const x = Number(img.getAttribute('data-pos-x')) || 50;
    const y = Number(img.getAttribute('data-pos-y')) || 50;
    const zoom = Number(img.getAttribute('data-zoom')) || 1;
    const float = img.getAttribute('data-float');
    const rotate = Number(img.getAttribute('data-rotate')) || 0;
    const grayscale = img.getAttribute('data-grayscale') != null && img.getAttribute('data-grayscale') !== '0';

    if (hasFocus) {
      img.style.objectFit = 'cover';
      img.style.objectPosition = `${x}% ${y}%`;
      img.style.cursor = 'move';
    }
    if (float === 'left' || float === 'right') {
      img.style.float = float;
      img.style.margin = float === 'left' ? '0 1em 0.5em 0' : '0 0 0.5em 1em';
    } else if (float !== null) {
      img.style.float = '';
      img.style.margin = '';
    }
    img.style.filter = grayscale ? 'grayscale(100%)' : '';

    const transforms: string[] = [];
    if (hasFocus && zoom > 1) transforms.push(`scale(${zoom})`);
    if (rotate !== 0) transforms.push(`rotate(${rotate}deg)`);
    if (transforms.length) {
      img.style.transform = transforms.join(' ');
      img.style.transformOrigin = transforms.length > 1 || rotate !== 0 ? '50% 50%' : `${x}% ${y}%`;
    } else {
      img.style.transform = '';
      img.style.transformOrigin = '';
    }
    const wrap = img.closest('.image-resizer') || img.parentElement;
    if (wrap && (wrap as HTMLElement).style && hasFocus) (wrap as HTMLElement).style.overflow = 'hidden';
  });
}
