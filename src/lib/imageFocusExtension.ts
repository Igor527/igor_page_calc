/**
 * Extends ImageResize with focus/position/zoom like the blog cover editor.
 * Attributes are stored as data-pos-x, data-pos-y, data-zoom on the img.
 */
import ImageResize from 'tiptap-extension-resize-image';

const DEFAULT_POS = 50;
const DEFAULT_ZOOM = 1;

export const ImageResizeWithFocus = ImageResize.extend({
  addAttributes() {
    const parent = this.parent && this.parent();
    return {
      ...(typeof parent === 'object' && parent !== null ? parent : {}),
      'data-pos-x': {
        default: DEFAULT_POS,
        parseHTML: (el: Element) => Number((el as HTMLElement).getAttribute('data-pos-x')) || DEFAULT_POS,
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs['data-pos-x'] != null && attrs['data-pos-x'] !== DEFAULT_POS ? { 'data-pos-x': String(attrs['data-pos-x']) } : {},
      },
      'data-pos-y': {
        default: DEFAULT_POS,
        parseHTML: (el: Element) => Number((el as HTMLElement).getAttribute('data-pos-y')) || DEFAULT_POS,
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs['data-pos-y'] != null && attrs['data-pos-y'] !== DEFAULT_POS ? { 'data-pos-y': String(attrs['data-pos-y']) } : {},
      },
      'data-zoom': {
        default: DEFAULT_ZOOM,
        parseHTML: (el: Element) => Number((el as HTMLElement).getAttribute('data-zoom')) || DEFAULT_ZOOM,
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs['data-zoom'] != null && attrs['data-zoom'] !== DEFAULT_ZOOM ? { 'data-zoom': String(attrs['data-zoom']) } : {},
      },
    };
  },
});

export const defaultImageFocus = { 'data-pos-x': DEFAULT_POS, 'data-pos-y': DEFAULT_POS, 'data-zoom': DEFAULT_ZOOM };
