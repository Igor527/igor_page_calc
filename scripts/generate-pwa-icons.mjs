/**
 * Генерирует icon-192.png и icon-512.png из public/icon.svg для PWA.
 * Запускается до сборки (prebuild). Один источник правды — icon.svg с буквами UP в стиле Pico.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const svgPath = join(root, 'public', 'icon.svg');
const out192 = join(root, 'public', 'icon-192.png');
const out512 = join(root, 'public', 'icon-512.png');

async function run() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.warn('generate-pwa-icons: sharp не установлен. Установите: npm i -D sharp');
    process.exitCode = 0;
    return;
  }

  if (!existsSync(svgPath)) {
    console.warn('generate-pwa-icons: public/icon.svg не найден');
    process.exitCode = 1;
    return;
  }

  const svg = readFileSync(svgPath);

  await sharp(svg).resize(192, 192).png().toFile(out192);
  await sharp(svg).resize(512, 512).png().toFile(out512);

  console.log('PWA icons: public/icon-192.png, public/icon-512.png');
}

run().catch((e) => {
  console.error('generate-pwa-icons:', e);
  process.exitCode = 1;
});
