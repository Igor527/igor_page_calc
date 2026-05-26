const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await page.goto('http://localhost:5173/cv', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    const cv = document.querySelector('.cv-view');
    if (!cv) return;
    cv.innerHTML = '<img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'400\' height=\'300\'/%3E" width="200" data-float="left" data-pos-x="50" data-zoom="1"><p>' + 'Текст резюме с обтеканием. '.repeat(50) + '</p>';
    document.querySelectorAll('.cv-view img').forEach((img) => {
      const float = img.getAttribute('data-float');
      if (float === 'left' || float === 'right') {
        img.style.float = float;
        img.style.margin = float === 'left' ? '0 1em 0.5em 0' : '0 0 0.5em 1em';
      }
    });
  });
  const m = await page.evaluate(() => {
    const doc = document.documentElement;
    const img = document.querySelector('.cv-view img');
    const s = img ? getComputedStyle(img) : null;
    return {
      overflow: doc.scrollWidth > doc.clientWidth + 1,
      scrollWidth: doc.scrollWidth,
      minWidth: s?.minWidth,
      border: s?.border,
      float: s?.float,
      imgWidth: img?.getBoundingClientRect().width,
    };
  });
  console.log(JSON.stringify(m, null, 2));
  await page.screenshot({ path: 'cv-mobile-float.png', fullPage: true });
  await browser.close();
})();
