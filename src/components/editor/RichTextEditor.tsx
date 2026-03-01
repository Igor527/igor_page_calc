import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useEditor, EditorContent, Extension } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { Underline } from '@tiptap/extension-underline';
import { Highlight } from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Details, DetailsSummary, DetailsContent } from '@tiptap/extension-details';
import EmojiPicker from 'emoji-picker-react';
import type { EmojiClickData } from 'emoji-picker-react';
import type { Editor } from '@tiptap/core';
import { sanitizeHtml } from '@/lib/security';
import { ImageResizeWithFocus, defaultImageFocus } from '@/lib/imageFocusExtension';
import { applyImageFocusStyles } from '@/lib/imageFocusStyles';

/* Custom FontSize extension via TextStyle inline style */
const FontSize = Extension.create({
  name: 'fontSize',
  addGlobalAttributes() {
    return [{
      types: ['textStyle'],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: el => (el as HTMLElement).style.fontSize || null,
          renderHTML: attrs => {
            if (!attrs.fontSize) return {};
            return { style: `font-size: ${attrs.fontSize}` };
          },
        },
      },
    }];
  },
});

const MAX_IMG_W = 800;

function resizeImage(dataUrl: string): Promise<string> {
  return new Promise(resolve => {
    const img = new window.Image();
    img.onload = () => {
      if (img.width <= MAX_IMG_W) { resolve(dataUrl); return; }
      const r = MAX_IMG_W / img.width;
      const c = document.createElement('canvas');
      c.width = MAX_IMG_W;
      c.height = Math.round(img.height * r);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

const btnStyle: React.CSSProperties = {
  padding: '3px 7px', fontSize: 12, lineHeight: 1.2,
  border: '1px solid var(--pico-border-color)',
  borderRadius: 4, cursor: 'pointer',
  background: 'var(--pico-form-element-background-color)',
  color: 'var(--pico-color)',
};
const btnActive: React.CSSProperties = { ...btnStyle, background: 'var(--pico-primary)', color: 'var(--pico-primary-inverse)' };

const FONT_SIZES = [
  { label: 'Мелкий', value: '12px' },
  { label: 'Обычный', value: '' },
  { label: 'Крупный', value: '18px' },
  { label: 'Большой', value: '22px' },
  { label: 'Огромный', value: '28px' },
];

/* Panel for image position/zoom when image is selected (like cover editor) */
const ImageFocusBubbleMenu: React.FC<{ editor: ReturnType<typeof useEditor> extends React.MutableRefObject<infer T> ? T : { chain: () => unknown; getAttributes: (name: string) => Record<string, unknown> }; onClose: () => void }> = ({ editor, onClose }) => {
  const attrs = editor?.getAttributes?.('imageResize') ?? {};
  const posX = Number(attrs['data-pos-x']) || 50;
  const posY = Number(attrs['data-pos-y']) || 50;
  const zoom = Number(attrs['data-zoom']) || 1;
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const update = useCallback(
    (updates: Record<string, number>) => {
      editor?.chain().focus().updateAttributes('imageResize', updates).run();
    },
    [editor]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!containerRef.current) return;
      e.preventDefault();
      dragging.current = true;
      let prevX = e.clientX;
      let prevY = e.clientY;
      let curX = posX;
      let curY = posY;
      const sensitivity = 0.35;
      const onMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        const dx = ev.clientX - prevX;
        const dy = ev.clientY - prevY;
        prevX = ev.clientX;
        prevY = ev.clientY;
        curX = Math.max(0, Math.min(100, curX - dx * sensitivity));
        curY = Math.max(0, Math.min(100, curY - dy * sensitivity));
        update({ 'data-pos-x': curX, 'data-pos-y': curY });
      };
      const onUp = () => {
        dragging.current = false;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [posX, posY, update]
  );

  if (!editor) return null;

  return (
    <div
      ref={containerRef}
      style={{
        padding: 10,
        background: 'var(--pico-card-background-color)',
        border: '1px solid var(--pico-border-color)',
        borderRadius: 8,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        minWidth: 260,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Позиция и зум</div>
      <div
        onMouseDown={handleMouseDown}
        style={{
          cursor: 'move',
          userSelect: 'none',
          padding: '8px 10px',
          marginBottom: 8,
          background: 'var(--pico-background-color)',
          borderRadius: 6,
          border: '1px dashed var(--pico-border-color)',
          fontSize: 11,
          color: 'var(--pico-muted-color)',
        }}
      >
        Перетащите для сдвига • X: {Math.round(posX)}% Y: {Math.round(posY)}%
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          Зум
          <input
            type="range"
            min={100}
            max={300}
            value={Math.round(zoom * 100)}
            onChange={(e) => update({ 'data-zoom': Number(e.target.value) / 100 })}
            style={{ width: 80 }}
          />
          <span style={{ minWidth: 28 }}>{Math.round(zoom * 100)}%</span>
        </label>
        <button
          type="button"
          onClick={() => update(defaultImageFocus)}
          style={{ padding: '4px 10px', fontSize: 11, border: '1px solid var(--pico-border-color)', borderRadius: 6, background: 'var(--pico-background-color)', cursor: 'pointer' }}
        >
          Сброс
        </button>
      </div>
    </div>
  );
};

const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, placeholder, minHeight = 200 }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const suppressUpdate = useRef(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const emojiRef = useRef<HTMLDivElement>(null);
  // Кнопки «Копировать» на блоках кода не вешаем в редакторе — только в режиме просмотра (блог/заметки), иначе зависание при вставке и при нажатии «Код»

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      ImageResizeWithFocus.configure({ inline: false, allowBase64: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Underline,
      Highlight.configure({ multicolor: false }),
      TextStyle,
      FontSize,
      Placeholder.configure({ placeholder: placeholder || 'Начните писать...' }),
      Details.configure({ persist: true }),
      DetailsSummary,
      DetailsContent,
    ],
    content: value || '',
    onUpdate({ editor: e }) {
      suppressUpdate.current = true;
      onChange(sanitizeHtml(e.getHTML()));
    },
    editorProps: {
      attributes: { class: 'rte-body' },
      handlePaste(_view, event) {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            if (file) insertImageFile(file);
            return true;
          }
        }
        return false;
      },
      handleDrop(_view, event) {
        const files = event.dataTransfer?.files;
        if (!files) return false;
        for (const file of files) {
          if (file.type.startsWith('image/')) {
            event.preventDefault();
            insertImageFile(file);
            return true;
          }
        }
        return false;
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (suppressUpdate.current) { suppressUpdate.current = false; return; }
    const next = value || '';
    if (editor.getHTML() !== next) {
      editor.commands.setContent(next, false);
    }
  }, [value, editor]);

  // Close emoji picker on outside click
  useEffect(() => {
    if (!showEmoji) return;
    const handler = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setShowEmoji(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEmoji]);

  const insertImageFile = useCallback(async (file: File) => {
    if (!editor) return;
    const dataUrl = await fileToDataUrl(file);
    const resized = await resizeImage(dataUrl);
    editor.chain().focus().setImage({ src: resized }).run();
  }, [editor]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !editor) return;
    for (const file of files) {
      if (file.type.startsWith('image/')) await insertImageFile(file);
    }
    e.target.value = '';
  }, [editor, insertImageFile]);

  const setFontSize = useCallback((size: string) => {
    if (!editor) return;
    if (!size) {
      editor.chain().focus().unsetMark('textStyle').run();
    } else {
      editor.chain().focus().setMark('textStyle', { fontSize: size }).run();
    }
  }, [editor]);

  const insertImageFromUrl = useCallback(() => {
    if (!editor) return;
    const url = window.prompt('URL изображения:');
    if (url) editor.chain().focus().setImage({ src: url }).run();
  }, [editor]);

  // Apply position/zoom styles to images with data-pos-x (in editor DOM)
  const applyImageStylesRef = useRef<() => void>(() => {});
  applyImageStylesRef.current = () => {
    requestAnimationFrame(() => applyImageFocusStyles(wrapRef.current));
  };
  useEffect(() => {
    if (!editor || !wrapRef.current) return;
    const run = () => applyImageStylesRef.current();
    editor.on('update', run);
    editor.on('selectionUpdate', run);
    run();
    return () => {
      editor.off('update', run);
      editor.off('selectionUpdate', run);
    };
  }, [editor]);

  // Drag on image to shift position (like cover editor) — delegated on wrapRef
  const editorRef = useRef(editor);
  editorRef.current = editor;
  useEffect(() => {
    const wrap = wrapRef.current;
    const ed = () => editorRef.current;
    if (!wrap || !ed()) return;

    const handleImageMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const img = target.tagName === 'IMG' ? target : target.closest?.('img[data-pos-x]');
      const imageEl = img as HTMLImageElement | null;
      if (!imageEl || imageEl.getAttribute('data-pos-x') == null) return;
      if (!wrap.contains(imageEl)) return;

      const editorInstance = ed();
      if (!editorInstance?.view) return;

      const view = editorInstance.view;
      const pos = view.posAtDOM(imageEl, -1);
      const node = editorInstance.state.doc.nodeAt(pos);
      if (!node || node.type.name !== 'imageResize') return;

      e.preventDefault();
      let curX = Number(node.attrs['data-pos-x']) || 50;
      let curY = Number(node.attrs['data-pos-y']) || 50;
      let prevX = e.clientX;
      let prevY = e.clientY;
      const sensitivity = 0.35;

      editorInstance.commands.setNodeSelection(pos);

      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - prevX;
        const dy = ev.clientY - prevY;
        prevX = ev.clientX;
        prevY = ev.clientY;
        curX = Math.max(0, Math.min(100, curX - dx * sensitivity));
        curY = Math.max(0, Math.min(100, curY - dy * sensitivity));
        editorInstance.chain().focus().updateAttributes('imageResize', { 'data-pos-x': curX, 'data-pos-y': curY }).run();
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };

    wrap.addEventListener('mousedown', handleImageMouseDown, true);
    return () => wrap.removeEventListener('mousedown', handleImageMouseDown, true);
  }, []);

  const handleEmojiClick = useCallback((emojiData: EmojiClickData) => {
    if (!editor) return;
    editor.chain().focus().insertContent(emojiData.emoji).run();
    setShowEmoji(false);
  }, [editor]);

  if (!editor) return null;

  const TB = ({ cmd, icon, active, title }: { cmd: () => void; icon: string; active?: boolean; title?: string }) => (
    <button type="button" onClick={cmd} style={active ? btnActive : btnStyle} title={title || icon}>{icon}</button>
  );

  return (
    <div ref={wrapRef} style={{ border: '1px solid var(--pico-border-color)', borderRadius: 8, overflow: 'hidden', background: 'var(--pico-form-element-background-color)', position: 'relative' }}>
      {/* Toolbar row 1: text formatting */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, padding: '6px 8px', borderBottom: '1px solid var(--pico-border-color)', background: 'var(--pico-card-background-color)', alignItems: 'center' }}>
        <TB cmd={() => editor.chain().focus().toggleBold().run()} icon="B" active={editor.isActive('bold')} title="Жирный" />
        <TB cmd={() => editor.chain().focus().toggleItalic().run()} icon="I" active={editor.isActive('italic')} title="Курсив" />
        <TB cmd={() => editor.chain().focus().toggleUnderline().run()} icon="U" active={editor.isActive('underline')} title="Подчёркнутый" />
        <TB cmd={() => editor.chain().focus().toggleStrike().run()} icon="S̶" active={editor.isActive('strike')} title="Зачёркнутый" />
        <TB cmd={() => editor.chain().focus().toggleCode().run()} icon="`" active={editor.isActive('code')} title="Инлайн-код" />
        <TB cmd={() => editor.chain().focus().toggleHighlight().run()} icon="🖍" active={editor.isActive('highlight')} title="Выделение" />
        <span style={{ width: 1, background: 'var(--pico-border-color)', margin: '0 2px', alignSelf: 'stretch' }} />
        <TB cmd={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} icon="H2" active={editor.isActive('heading', { level: 2 })} title="Заголовок 2" />
        <TB cmd={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} icon="H3" active={editor.isActive('heading', { level: 3 })} title="Заголовок 3" />
        <TB cmd={() => editor.chain().focus().toggleHeading({ level: 4 }).run()} icon="H4" active={editor.isActive('heading', { level: 4 })} title="Заголовок 4" />
        <span style={{ width: 1, background: 'var(--pico-border-color)', margin: '0 2px', alignSelf: 'stretch' }} />
        <select
          value={(() => { const a = editor.getAttributes('textStyle'); return a.fontSize || ''; })()}
          onChange={e => setFontSize(e.target.value)}
          style={{ padding: '2px 4px', fontSize: 11, border: '1px solid var(--pico-border-color)', borderRadius: 4, background: 'var(--pico-form-element-background-color)', color: 'var(--pico-color)', height: 24 }}
          title="Размер шрифта"
        >
          {FONT_SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
      {/* Toolbar row 2: structure + alignment + media */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, padding: '4px 8px', borderBottom: '1px solid var(--pico-border-color)', background: 'var(--pico-card-background-color)', alignItems: 'center' }}>
        <TB cmd={() => editor.chain().focus().toggleBulletList().run()} icon="•" active={editor.isActive('bulletList')} title="Маркеры" />
        <TB cmd={() => editor.chain().focus().toggleOrderedList().run()} icon="1." active={editor.isActive('orderedList')} title="Нумерация" />
        <TB cmd={() => editor.chain().focus().toggleBlockquote().run()} icon="❝" active={editor.isActive('blockquote')} title="Цитата" />
        <TB cmd={() => editor.chain().focus().toggleCodeBlock().run()} icon="</>" active={editor.isActive('codeBlock')} title="Код" />
        <TB cmd={() => editor.chain().focus().setDetails().run()} icon="▶" active={editor.isActive('details')} title="Спойлер / Свернуть" />
        <span style={{ width: 1, background: 'var(--pico-border-color)', margin: '0 2px', alignSelf: 'stretch' }} />
        <TB cmd={() => editor.chain().focus().setTextAlign('left').run()} icon="⫷" active={editor.isActive({ textAlign: 'left' })} title="По левому" />
        <TB cmd={() => editor.chain().focus().setTextAlign('center').run()} icon="☰" active={editor.isActive({ textAlign: 'center' })} title="По центру" />
        <TB cmd={() => editor.chain().focus().setTextAlign('right').run()} icon="⫸" active={editor.isActive({ textAlign: 'right' })} title="По правому" />
        <span style={{ width: 1, background: 'var(--pico-border-color)', margin: '0 2px', alignSelf: 'stretch' }} />
        <TB cmd={() => fileRef.current?.click()} icon="🖼" title="Картинка из файла" />
        <TB cmd={insertImageFromUrl} icon="🔗" title="Картинка по URL" />
        <TB cmd={() => editor.chain().focus().setHorizontalRule().run()} icon="—" title="Разделитель" />
        <TB cmd={() => setShowEmoji(!showEmoji)} icon="😊" title="Эмодзи" />
        <span style={{ width: 1, background: 'var(--pico-border-color)', margin: '0 2px', alignSelf: 'stretch' }} />
        <TB cmd={() => editor.chain().focus().undo().run()} icon="↩" title="Отмена" />
        <TB cmd={() => editor.chain().focus().redo().run()} icon="↪" title="Повтор" />
      </div>

      {/* Emoji picker dropdown */}
      {showEmoji && (
        <div ref={emojiRef} style={{ position: 'absolute', zIndex: 50, top: 80, right: 8 }}>
          <EmojiPicker onEmojiClick={handleEmojiClick} width={320} height={400}
            searchPlaceholder="Поиск эмодзи..."
            previewConfig={{ showPreview: false }}
          />
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFileUpload} style={{ display: 'none' }} />

      <BubbleMenu
        editor={editor}
        shouldShow={({ editor: e }) => e.isActive('imageResize')}
      >
        <ImageFocusBubbleMenu editor={editor} onClose={() => editor.commands.focus()} />
      </BubbleMenu>

      <EditorContent editor={editor} style={{ minHeight, padding: '8px 12px', fontSize: 15, lineHeight: 1.7, color: 'var(--pico-color)' }} />
    </div>
  );
};

export default RichTextEditor;
