import { useState, useEffect, useCallback } from 'react';

export type SiteLang = 'en' | 'ru';

const LANG_KEY = 'site_lang';

export function getLang(): SiteLang {
  if (typeof window === 'undefined') return 'en';
  try {
    const val = localStorage.getItem(LANG_KEY);
    if (val === 'ru' || val === 'en') return val;
  } catch {
    // ignore
  }
  return 'en';
}

export function setLang(lang: SiteLang): void {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // ignore
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    document.documentElement.setAttribute('data-lang', lang);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sitelangchange', { detail: lang }));
  }
}

export function useLang(): {
  lang: SiteLang;
  setLang: (l: SiteLang) => void;
  toggleLang: () => void;
  isEn: boolean;
  isRu: boolean;
} {
  const [lang, setLangState] = useState<SiteLang>(getLang);

  useEffect(() => {
    const handleLangChange = (e: Event) => {
      const customEvent = e as CustomEvent<SiteLang>;
      if (customEvent.detail && (customEvent.detail === 'en' || customEvent.detail === 'ru')) {
        setLangState(customEvent.detail);
      } else {
        setLangState(getLang());
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === LANG_KEY) {
        setLangState(getLang());
      }
    };

    window.addEventListener('sitelangchange', handleLangChange);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('sitelangchange', handleLangChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const toggleLang = useCallback(() => {
    const next: SiteLang = lang === 'en' ? 'ru' : 'en';
    setLang(next);
  }, [lang]);

  return {
    lang,
    setLang,
    toggleLang,
    isEn: lang === 'en',
    isRu: lang === 'ru',
  };
}
