import React from 'react';

export type PageLoadingVariant = 'page' | 'editor' | 'cards';

const skeletonBase: React.CSSProperties = {
  background: 'var(--pico-muted-border-color)',
  borderRadius: 8,
  animation: 'page-loading-pulse 1.2s ease-in-out infinite',
};

function Bar({ width, height = 14, style }: { width: string | number; height?: number; style?: React.CSSProperties }) {
  return <div style={{ ...skeletonBase, width, height, ...style }} aria-hidden />;
}

export const PageLoadingFallback: React.FC<{ variant?: PageLoadingVariant }> = ({ variant = 'page' }) => (
  <div
    className="page-loading-fallback"
    role="status"
    aria-live="polite"
    aria-busy="true"
    aria-label="Загрузка страницы"
    style={{ maxWidth: variant === 'editor' ? '100%' : 750, margin: '0 auto', padding: '24px 16px' }}
  >
    {variant === 'editor' && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 280 }}>
        <Bar width="40%" height={20} />
        <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 200 }}>
          <Bar width="28%" height="100%" style={{ minHeight: 180 }} />
          <Bar width="42%" height="100%" style={{ minHeight: 180 }} />
          <Bar width="28%" height="100%" style={{ minHeight: 180 }} />
        </div>
      </div>
    )}
    {variant === 'cards' && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Bar width="55%" height={22} />
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              padding: 16,
              border: '1px solid var(--pico-border-color)',
              borderRadius: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <Bar width="70%" height={16} />
            <Bar width="100%" />
            <Bar width="85%" />
          </div>
        ))}
      </div>
    )}
    {variant === 'page' && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Bar width="60%" height={28} />
        <Bar width="100%" />
        <Bar width="92%" />
        <Bar width="78%" />
        <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
          <Bar width={120} height={36} />
          <Bar width={100} height={36} />
        </div>
      </div>
    )}
    <span className="sr-only">Загрузка…</span>
  </div>
);

export function loadingVariantForPath(path: string): PageLoadingVariant {
  if (path.startsWith('/editor') || path.startsWith('/admin/') || path === '/planner') return 'editor';
  if (path.startsWith('/calculators') || path === '/blog' || path.startsWith('/blog/')) return 'cards';
  return 'page';
}
