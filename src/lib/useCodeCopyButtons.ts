import { useEffect, type RefObject } from 'react';

const ATTR = 'data-code-copy';

function addCopyButton(pre: HTMLPreElement) {
  if (pre.querySelector(`.code-copy-btn`)) return;

  const btn = document.createElement('button');
  btn.className = 'code-copy-btn';
  btn.setAttribute(ATTR, '1');
  btn.textContent = 'Копировать';
  btn.type = 'button';

  btn.addEventListener('click', () => {
    const code = pre.querySelector('code');
    const text = (code || pre).textContent || '';
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = 'Скопировано!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = 'Копировать';
        btn.classList.remove('copied');
      }, 1500);
    });
  });

  pre.style.position = 'relative';
  pre.appendChild(btn);
}

function processContainer(container: HTMLElement) {
  container.querySelectorAll<HTMLPreElement>('pre').forEach(addCopyButton);
}

const DEBOUNCE_MS = 120;

/**
 * Adds a "Copy" button overlay to every <pre> inside the container.
 * Uses MutationObserver with debounce to avoid freezing on paste (many mutations at once).
 */
export function useCodeCopyButtons(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    processContainer(el);

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        timeoutId = null;
        if (el.isConnected) processContainer(el);
      }, DEBOUNCE_MS);
    });
    observer.observe(el, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [ref]);
}

/**
 * Imperative version: attach copy buttons to all <pre> inside a container.
 * Useful for static rendered HTML (dangerouslySetInnerHTML).
 */
export function attachCodeCopyButtons(container: HTMLElement | null) {
  if (container) processContainer(container);
}
