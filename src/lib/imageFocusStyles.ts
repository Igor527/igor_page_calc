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
    const wrap = (img.closest('.image-resizer') as HTMLElement | null);
    const parentP = (img.parentElement && img.parentElement.tagName === 'P' && img.parentElement.childNodes.length === 1)
      ? (img.parentElement as HTMLElement)
      : null;

    if (float === 'left' || float === 'right') {
      img.style.float = float;
      img.style.margin = float === 'left' ? '0 1em 0.5em 0' : '0 0 0.5em 1em';
      img.style.display = 'block';
      img.style.maxWidth = '50%';
      if (wrap) {
        wrap.style.float = float;
        wrap.style.margin = float === 'left' ? '0 1em 0.5em 0' : '0 0 0.5em 1em';
        wrap.style.display = 'block';
        wrap.style.maxWidth = '50%';
      }
    } else if (float === 'half') {
      img.style.float = 'none';
      img.style.display = 'inline-block';
      img.style.verticalAlign = 'top';
      img.style.width = 'calc(50% - 8px)';
      img.style.maxWidth = 'calc(50% - 8px)';
      img.style.margin = '4px';
      img.style.boxSizing = 'border-box';
      if (wrap) {
        wrap.style.float = 'none';
        wrap.style.display = 'inline-block';
        wrap.style.verticalAlign = 'top';
        wrap.style.width = 'calc(50% - 8px)';
        wrap.style.maxWidth = 'calc(50% - 8px)';
        wrap.style.margin = '4px';
        wrap.style.boxSizing = 'border-box';
        img.style.width = '100%';
        img.style.maxWidth = '100%';
      }
      if (parentP) {
        parentP.style.display = 'inline-block';
        parentP.style.verticalAlign = 'top';
        parentP.style.width = 'calc(50% - 8px)';
        parentP.style.margin = '4px';
        img.style.width = '100%';
      }
    } else if (float === 'third') {
      img.style.float = 'none';
      img.style.display = 'inline-block';
      img.style.verticalAlign = 'top';
      img.style.width = 'calc(33.333% - 8px)';
      img.style.maxWidth = 'calc(33.333% - 8px)';
      img.style.margin = '4px';
      img.style.boxSizing = 'border-box';
      if (wrap) {
        wrap.style.float = 'none';
        wrap.style.display = 'inline-block';
        wrap.style.verticalAlign = 'top';
        wrap.style.width = 'calc(33.333% - 8px)';
        wrap.style.maxWidth = 'calc(33.333% - 8px)';
        wrap.style.margin = '4px';
        wrap.style.boxSizing = 'border-box';
        img.style.width = '100%';
        img.style.maxWidth = '100%';
      }
      if (parentP) {
        parentP.style.display = 'inline-block';
        parentP.style.verticalAlign = 'top';
        parentP.style.width = 'calc(33.333% - 8px)';
        parentP.style.margin = '4px';
        img.style.width = '100%';
      }
    } else if (float === 'inline') {
      img.style.float = 'none';
      img.style.display = 'inline-block';
      img.style.verticalAlign = 'middle';
      img.style.margin = '0 6px';
      img.style.width = '';
      img.style.maxWidth = '';
      if (wrap) {
        wrap.style.float = 'none';
        wrap.style.display = 'inline-block';
        wrap.style.verticalAlign = 'middle';
        wrap.style.margin = '0 6px';
        wrap.style.width = '';
        wrap.style.maxWidth = '';
      }
    } else if (float !== null) {
      img.style.float = '';
      img.style.margin = '';
      img.style.display = '';
      img.style.width = '';
      img.style.maxWidth = '';
      if (wrap) {
        wrap.style.float = '';
        wrap.style.margin = '';
        wrap.style.display = '';
        wrap.style.width = '';
        wrap.style.maxWidth = '';
      }
      if (parentP) {
        parentP.style.display = '';
        parentP.style.verticalAlign = '';
        parentP.style.width = '';
        parentP.style.margin = '';
      }
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
    const overflowWrap = wrap || img.parentElement;
    if (overflowWrap && (overflowWrap as HTMLElement).style && hasFocus) (overflowWrap as HTMLElement).style.overflow = 'hidden';
  });
}
