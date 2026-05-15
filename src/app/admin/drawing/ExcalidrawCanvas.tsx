import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Excalidraw, THEME, type ExcalidrawImperativeAPI } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { appendSkeletons, embedSvgAsImage } from './excalidrawScene';

export type ExcalidrawCanvasHandle = {
  getApi: () => ExcalidrawImperativeAPI | null;
  appendSkeletons: typeof appendSkeletons;
  embedSvg: typeof embedSvgAsImage;
  resetScene: () => void;
};

type Props = {
  canvasRef: React.MutableRefObject<ExcalidrawCanvasHandle | null>;
  onApiReady?: (api: ExcalidrawImperativeAPI) => void;
};

function readSiteTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

const ExcalidrawCanvas = memo(function ExcalidrawCanvas({ canvasRef, onApiReady }: Props) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(readSiteTheme);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setTheme(readSiteTheme());
    const obs = new MutationObserver(sync);
    obs.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const bindApi = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      apiRef.current = api;
      canvasRef.current = {
        getApi: () => apiRef.current,
        appendSkeletons: (skeletons) => {
          if (apiRef.current) appendSkeletons(apiRef.current, skeletons);
        },
        embedSvg: (svg, name) => {
          if (apiRef.current) embedSvgAsImage(apiRef.current, svg, name);
        },
        resetScene: () => apiRef.current?.resetScene(),
      };
      onApiReady?.(api);
    },
    [canvasRef, onApiReady]
  );

  return (
    <div
      className="drawing-excalidraw-host"
      style={{
        flex: 1,
        position: 'relative',
        borderRight: '1px solid var(--pico-border-color)',
        minWidth: 0,
        minHeight: 0,
        height: '100%',
      }}
    >
      <Excalidraw
        excalidrawAPI={bindApi}
        theme={theme === 'dark' ? THEME.DARK : THEME.LIGHT}
        langCode="ru-RU"
        UIOptions={{
          canvasActions: {
            loadScene: false,
            export: false,
            saveAsImage: false,
          },
        }}
      />
    </div>
  );
});

export default ExcalidrawCanvas;
