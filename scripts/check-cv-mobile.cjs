const { chromium } = require('playwright');

async function audit(page, label) {
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    const cv = document.querySelector('.cv-view');
    const imgs = cv ? [...cv.querySelectorAll('img')] : [];
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      hasHorizontalOverflow: doc.scrollWidth > doc.clientWidth + 1,
      cvExists: !!cv,
      imgCount: imgs.length,
      imgStyles: imgs.map((img) => ({
        minWidth: getComputedStyle(img).minWidth,
        borderStyle: getComputedStyle(img).borderStyle,
        float: getComputedStyle(img).float,
        width: Math.round(img.getBoundingClientRect().width),
      })),
    };
  });
  console.log(label, JSON.stringify(metrics, null, 2));
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });

  await page.goto('http://localhost:5173/cv', { waitUntil: 'networkidle' });
  await audit(page, 'public-text');

  await page.setContent(`
    <div class="cv-view rte-body" style="max-width:720px;padding:24px 20px">
      <img src="https://via.placeholder.com/400x300" data-float="left" style="width:200px" alt="test">
      <p>${'Long paragraph text '.repeat(40)}</p>
    </div>
  `);
  await audit(page, 'public-float-img');

  await page.setViewportSize({ width: 320, height: 568 });
  await audit(page, 'public-float-320');

  await browser.close();
})();
