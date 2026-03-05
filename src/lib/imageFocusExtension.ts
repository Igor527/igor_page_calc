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
      'data-float': {
        default: null,
        parseHTML: (el: Element) => (el as HTMLElement).getAttribute('data-float') || null,
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs['data-float'] ? { 'data-float': String(attrs['data-float']) } : {},
      },
      'data-rotate': {
        default: 0,
        parseHTML: (el: Element) => Number((el as HTMLElement).getAttribute('data-rotate')) || 0,
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs['data-rotate'] != null && Number(attrs['data-rotate']) !== 0 ? { 'data-rotate': String(attrs['data-rotate']) } : {},
      },
      'data-grayscale': {
        default: null,
        parseHTML: (el: Element) => (el as HTMLElement).getAttribute('data-grayscale') != null,
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs['data-grayscale'] ? { 'data-grayscale': '1' } : {},
      },
    };
  },
});

export const defaultImageFocus = { 'data-pos-x': DEFAULT_POS, 'data-pos-y': DEFAULT_POS, 'data-zoom': DEFAULT_ZOOM };
