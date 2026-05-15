import {
  exportToSvg,
  serializeAsJSON,
  restoreElements,
  restoreAppState,
  convertToExcalidrawElements,
  type ExcalidrawImperativeAPI,
  type ExcalidrawElementSkeleton,
} from '@excalidraw/excalidraw';

const SCENE_MARKERS = ['<!-- excalidraw-scene:', '<!-- tldraw-snapshot:'] as const;
const SCENE_END = ' -->';

export function extractEmbeddedScenePayload(fileContent: string): { payload: string; format: 'excalidraw' | 'tldraw' } | null {
  for (const marker of SCENE_MARKERS) {
    const start = fileContent.lastIndexOf(marker);
    if (start < 0) continue;
    const payloadFrom = start + marker.length;
    const end = fileContent.indexOf(SCENE_END, payloadFrom);
    if (end <= payloadFrom) continue;
    return {
      payload: fileContent.slice(payloadFrom, end).trim(),
      format: marker.includes('excalidraw') ? 'excalidraw' : 'tldraw',
    };
  }
  return null;
}

export function parseScenePayload(encoded: string): {
  elements: ReturnType<typeof restoreElements>;
  appState: ReturnType<typeof restoreAppState>;
  files: Record<string, unknown>;
} | null {
  try {
    const json = JSON.parse(decodeURIComponent(encoded));
    if (json.document?.store) {
      return null;
    }
    const elements = json.elements ?? [];
    const appState = json.appState ?? {};
    const files = json.files ?? {};
    return {
      elements: restoreElements(elements, null),
      appState: restoreAppState(appState, null),
      files,
    };
  } catch {
    return null;
  }
}

export async function buildSvgWithScene(api: ExcalidrawImperativeAPI): Promise<string> {
  const elements = api.getSceneElements();
  const appState = api.getAppState();
  const files = api.getFiles();
  const svgEl = await exportToSvg({
    elements,
    appState,
    files,
    exportPadding: 32,
  });
  const svgMarkup =
    typeof svgEl === 'string' ? svgEl : new XMLSerializer().serializeToString(svgEl);
  const sceneJson = serializeAsJSON(elements, appState, files, 'local');
  const encoded = encodeURIComponent(sceneJson);
  return `${svgMarkup}\n<!-- excalidraw-scene: ${encoded} -->`;
}

export function sceneCenter(api: ExcalidrawImperativeAPI): { x: number; y: number } {
  const appState = api.getAppState();
  const zoom = appState.zoom?.value ?? 1;
  const w = appState.width ?? 800;
  const h = appState.height ?? 600;
  return {
    x: -appState.scrollX + w / 2 / zoom,
    y: -appState.scrollY + h / 2 / zoom,
  };
}

export function appendSkeletons(api: ExcalidrawImperativeAPI, skeletons: ExcalidrawElementSkeleton[]) {
  const { x, y } = sceneCenter(api);
  const converted = convertToExcalidrawElements(
    skeletons.map((s, i) => ({
      ...s,
      x: (s.x ?? x - 80) + (i % 3) * 24,
      y: (s.y ?? y - 40) + Math.floor(i / 3) * 24,
    })),
    { regenerateIds: true }
  );
  api.updateScene({ elements: [...api.getSceneElements(), ...converted] });
}

export function embedSvgAsImage(api: ExcalidrawImperativeAPI, svgContent: string, _name: string) {
  const fileId = `file-${Date.now()}` as Parameters<ExcalidrawImperativeAPI['addFiles']>[0][0]['id'];
  const dataURL = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgContent)))}`;
  const { x, y } = sceneCenter(api);
  api.addFiles([
    {
      id: fileId,
      mimeType: 'image/svg+xml',
      dataURL,
      created: Date.now(),
    },
  ]);
  const [image] = convertToExcalidrawElements(
    [
      {
        type: 'image',
        x: x - 200,
        y: y - 150,
        width: 400,
        height: 300,
        fileId,
      },
    ],
    { regenerateIds: true }
  );
  api.updateScene({ elements: [...api.getSceneElements(), image] });
}
