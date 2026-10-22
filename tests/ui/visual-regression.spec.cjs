const { test, expect } = require('@playwright/test');
const path = require('node:path');

async function fixture(page, width = 393) {
  await page.setViewportSize({ width, height: 852 });
  await page.clock.install({ time: new Date('2026-10-21T13:35:20+08:00') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.evaluate(() => {
    const school = { teacher: '模拟教师', room: '六教306', day: 3, start: 5, end: 6, weeks: [8] };
    const courses = [
      { ...school, id: 'math', name: '高等数学' },
      { ...school, id: 'gray', name: '大学物理', weeks: [9] },
      { ...school, id: 'english', name: '大学英语', day: 2, start: 3, end: 4 },
      { ...school, id: 'long', name: '计算机网络课程设计与实践_03', day: 7, start: 3, end: 4 },
      { ...school, id: 'single', name: '单节课程', day: 4, start: 1, end: 1 },
      {
        ...school,
        id: 'plan',
        kind: 'personal',
        name: '图书馆自习',
        day: 5,
        room: '图书馆二楼',
        notes: '复习第三章',
        reminderMinutes: 15
      }
    ].map(Timetable.validateCourse);
    localStorage.setItem(
      'ytu-timetable-v1',
      JSON.stringify({
        ...Timetable.defaultState(),
        startDate: '2026-08-31',
        semester: '2026 · 秋季学期',
        courses
      })
    );
  });
  await page.reload();
}

for (const width of [320, 393, 768]) {
  test(`重构对照：${width}px 首页`, async ({ page }) => {
    await fixture(page, width);
    await expect(page).toHaveScreenshot(`home-${width}.png`, { fullPage: true, maxDiffPixels: 0 });
  });
}

test('重构对照：列表、详情与非本周', async ({ page }) => {
  await fixture(page);
  await page.locator('#viewToggle').click();
  await expect(page).toHaveScreenshot('list.png', { fullPage: true, maxDiffPixels: 0 });
  await page.locator('#listView .list-card').filter({ hasText: '大学英语' }).click();
  await expect(page).toHaveScreenshot('detail.png', { maxDiffPixels: 0 });
  await page.locator('#courseDialog .close-dialog').click();
  await page.locator('#viewToggle').click();
  await page.locator('#weekSelect').selectOption('9');
  await expect(page).toHaveScreenshot('week-nine.png', { fullPage: true, maxDiffPixels: 0 });
});

test('重构对照：编辑面板与短视口', async ({ page }) => {
  await fixture(page);
  await page.locator('.empty-slot[data-day="7"][data-section="7"]').click();
  await page.locator('#courseName').fill('操场跑步');
  await page.locator('#courseRoom').fill('东操场');
  await expect(page).toHaveScreenshot('editor.png', { maxDiffPixels: 0 });
  await page.setViewportSize({ width: 393, height: 450 });
  await expect(page).toHaveScreenshot('editor-short.png', { maxDiffPixels: 0 });
});

test('重构对照：设置与文件导入预览', async ({ page }) => {
  await fixture(page);
  await page.locator('#settingsButton').click();
  await expect(page).toHaveScreenshot('settings.png', { maxDiffPixels: 0 });
  await page.locator('#settingsDialog .close-dialog').click();
  await page
    .locator('#fileInput')
    .setInputFiles(path.resolve(__dirname, '../../examples/课程清单模板.csv'));
  await expect(page).toHaveScreenshot('import.png', { maxDiffPixels: 0 });
});

test('重构对照：透明壁纸、空态与添加菜单', async ({ page }) => {
  await fixture(page);
  const buffer = Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 640;
      const context = canvas.getContext('2d');
      const gradient = context.createLinearGradient(0, 0, 320, 640);
      gradient.addColorStop(0, '#35c7ef');
      gradient.addColorStop(1, '#ffc2d7');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 320, 640);
      return canvas.toDataURL('image/png').split(',')[1];
    }),
    'base64'
  );
  await page
    .locator('#backgroundInput')
    .setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer });
  await expect(page.locator('body')).toHaveClass(/has-wallpaper/);
  await page.waitForFunction(() => document.querySelector('#wallpaperImage').naturalWidth > 0);
  await page.locator('#backgroundMask').evaluate((n) => {
    n.value = '35';
    n.dispatchEvent(new Event('input'));
    n.dispatchEvent(new Event('change'));
  });
  await expect(page).toHaveScreenshot('wallpaper.png', { fullPage: true, maxDiffPixels: 0 });
  await page.locator('#addButton').click();
  await expect(page).toHaveScreenshot('add-menu.png', { maxDiffPixels: 0 });
  await page.evaluate(() => {
    localStorage.removeItem('ytu-timetable-v1');
  });
  await page.reload();
  await expect(page).toHaveScreenshot('empty-wallpaper.png', { fullPage: true, maxDiffPixels: 0 });
});
