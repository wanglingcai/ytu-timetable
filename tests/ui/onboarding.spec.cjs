const { test, expect } = require('@playwright/test');
const path = require('node:path');
const T = require('../../app/src/main/assets/core.js');
const fixture = path.resolve(__dirname, '../../examples/课程清单模板.csv');

async function savePreview(page) {
  await expect(page.locator('#importDialog')).toBeVisible();
  await page.locator('#importStart').fill('2026-08-31');
  await page.locator('#reviewCheck').check();
  await page.locator('#saveImport').click();
}

test('首次欢迎、导入提示、四步引导、跳过与重新查看', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#welcomeDialog')).toBeVisible();
  await page.screenshot({ path: 'test-results/onboarding-welcome.png' });
  await page.locator('#welcomeImport').click();
  await expect(page.locator('#importChoice')).toContainText('先选择学校');
  await expect(page.locator('#selfPortalImport')).toContainText('输入教务网址');
  await page.locator('#importChoice .close-dialog').click();
  await page.locator('#fileInput').setInputFiles(fixture);
  await expect(page.locator('#importDialog')).toContainText('先核对');
  await expect(page.locator('#importDialog')).toContainText('学期结束');
  await savePreview(page);
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('ytu-timetable-v1'))).reminders.courseMinutes).toBe(-1);
  await expect(page.locator('#guideTitle')).toHaveText('查看不同周的安排');
  await expect(page.locator('#guideProgress')).toHaveText('1 / 4');
  await page.screenshot({ path: 'test-results/onboarding-guide.png' });
  await page.locator('#guideNext').click();
  await expect(page.locator('#guideTitle')).toHaveText('点开查看课程详情');
  await page.screenshot({ path: 'test-results/onboarding-guide-course.png' });
  await page.locator('#guidePrevious').click();
  await expect(page.locator('#guideProgress')).toHaveText('1 / 4');
  await page.locator('#guideNext').click();
  await page.locator('#guideNext').click();
  await expect(page.locator('#guideTitle')).toHaveText('灰色课程不在本周上课');
  await page.screenshot({ path: 'test-results/onboarding-guide-inactive.png' });
  await page.locator('#guideNext').click();
  await expect(page.locator('#guideTitle')).toHaveText('把自己的安排也记下来');
  await page.screenshot({ path: 'test-results/onboarding-guide-add.png' });
  await page.locator('#guideNext').click();
  await expect(page.locator('#guideOverlay')).toBeHidden();
  await page.reload();
  await expect(page.locator('#welcomeDialog')).toBeHidden();
  await expect(page.locator('#guideOverlay')).toBeHidden();
  await page.locator('#settingsButton').click();
  await page.locator('#replayGuide').click();
  await expect(page.locator('#guideOverlay')).toBeVisible();
  expect(await page.evaluate(() => window.handleAndroidBack())).toBe(true);
  await expect(page.locator('#guideOverlay')).toBeHidden();
});

test('示例标识明确，体验教程不占用首次真实导入引导', async ({ page }) => {
  await page.goto('/');
  await page.locator('#welcomeSample').click();
  await expect(page.locator('#importFileName')).toContainText('非本人真实课表');
  await savePreview(page);
  await expect(page.locator('#guideOverlay')).toBeVisible();
  await page.locator('#guideSkip').click();
  await page.reload();
  await expect(page.locator('#welcomeDialog')).toBeHidden();
  await expect(page.locator('#guideOverlay')).toBeHidden();
  await page.locator('#fileInput').setInputFiles(fixture);
  await savePreview(page);
  await expect(page.locator('#guideOverlay')).toBeVisible();
  await page.locator('#guideSkip').click();
  await page.reload();
  await expect(page.locator('#guideOverlay')).toBeHidden();
  await page.locator('#fileInput').setInputFiles(fixture);
  await savePreview(page);
  await expect(page.locator('#guideOverlay')).toBeHidden();
});

test('已有课表的老用户不弹欢迎，恢复备份不重复启动引导', async ({ page }) => {
  const course = T.validateCourse({ name: '课程', day: 1, start: 1, end: 2, weeks: [1] }, 0);
  const old = T.validateState({ ...T.defaultState(), courses: [course] });
  await page.addInitScript((value) => localStorage.setItem('ytu-timetable-v1', value), JSON.stringify(old));
  await page.goto('/');
  await expect(page.locator('#welcomeDialog')).toBeHidden();
  await expect(page.locator('#guideOverlay')).toBeHidden();
  await page.locator('#fileInput').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(old)) });
  await page.locator('#reviewCheck').check();
  await page.locator('#saveImport').click();
  await expect(page.locator('#guideOverlay')).toBeHidden();
  await page.reload();
  await expect(page.locator('#welcomeDialog')).toBeHidden();
  await expect(page.locator('#guideOverlay')).toBeHidden();
});

test('跳过欢迎后不会重复显示，缺少课程时重看自动略过相关步骤', async ({ page }) => {
  await page.goto('/');
  await page.locator('#welcomeSkip').click();
  await page.reload();
  await expect(page.locator('#welcomeDialog')).toBeHidden();
  await page.locator('#settingsButton').click();
  await page.locator('#replayGuide').click();
  await expect(page.locator('#guideProgress')).toHaveText('1 / 2');
  await page.locator('#guideNext').click();
  await expect(page.locator('#guideTitle')).toHaveText('把自己的安排也记下来');
  await page.keyboard.press('Escape');
  await expect(page.locator('#guideOverlay')).toBeHidden();
});

test('新用户主动选择提醒后才显示权限入口', async ({ page }) => {
  await page.addInitScript(() => {
    window.permissionCalls = [];
    window.AndroidLocal = {
      readState: () => localStorage.getItem('ytu-timetable-v1') || '',
      saveState: (json) => { localStorage.setItem('ytu-timetable-v1', json); return true; },
      reminderStatus: () => JSON.stringify({ notifications: false, exact: false }),
      reminderPermission: (kind) => permissionCalls.push(kind)
    };
  });
  await page.goto('/');
  await page.locator('#welcomeSkip').click();
  await page.locator('#settingsButton').click();
  await expect(page.locator('#courseReminder')).toHaveValue('-1');
  await expect(page.locator('#notificationPermission')).toBeHidden();
  expect(await page.evaluate(() => permissionCalls)).toEqual([]);
  await page.locator('#courseReminder').selectOption('10');
  await expect(page.locator('#notificationPermission')).toBeVisible();
  expect(await page.evaluate(() => permissionCalls)).toEqual([]);
  await page.locator('#notificationPermission').click();
  expect(await page.evaluate(() => permissionCalls)).toEqual(['notifications']);
});

test('小屏引导按钮可见且可以逐步完成', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await page.locator('#welcomeImport').click();
  await page.locator('#importChoice .close-dialog').click();
  await page.locator('#fileInput').setInputFiles(fixture);
  await savePreview(page);
  for (let i = 0; i < 4; i++) {
    await expect(page.locator('#guideCard')).toBeInViewport();
    await expect(page.locator('#guideNext')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('#guideNext').click();
  }
  await expect(page.locator('#guideOverlay')).toBeHidden();
});

test('高亮区域可体验真实功能，打开详情或添加后返回继续引导', async ({ page }) => {
  await page.goto('/');
  await page.locator('#welcomeImport').click();
  await page.locator('#importChoice .close-dialog').click();
  await page.locator('#fileInput').setInputFiles(fixture);
  await savePreview(page);
  await expect(page.locator('#guideTitle')).toHaveText('查看不同周的安排');
  const beforeWeek=await page.locator('#weekSelect').inputValue();
  await page.locator('#prevWeek').click();
  await expect(page.locator('#weekSelect')).not.toHaveValue(beforeWeek);
  await expect(page.locator('#guideTitle')).toHaveText('查看不同周的安排');
  await page.locator('#guideNext').click();
  await expect(page.locator('#guideTitle')).toHaveText('点开查看课程详情');
  await page.locator('#gridView .course-card').first().click();
  await expect(page.locator('#guideOverlay')).toBeHidden();
  await expect(page.locator('#courseDialog, #overlapDialog')).toHaveCount(2);
  const opened=page.locator('dialog[open]');
  await expect(opened).toBeVisible();
  await opened.locator('.close-dialog').click();
  await expect(page.locator('#guideOverlay')).toBeVisible();
  await expect(page.locator('#guideTitle')).toHaveText('点开查看课程详情');
  await page.locator('#guideNext').click();
  const toggle=page.locator('#toggleInactive');
  const pressed=await toggle.getAttribute('aria-pressed');
  await toggle.click();await expect(toggle).not.toHaveAttribute('aria-pressed',pressed);
  expect(JSON.parse(await page.evaluate(()=>localStorage.getItem('ytu-timetable-v1'))).showInactiveCourses).toBe(pressed==='false');
  await expect(page.locator('#guideTitle')).toHaveText('灰色课程不在本周上课');
  await toggle.click();await expect(toggle).toHaveAttribute('aria-pressed',pressed);
  await page.locator('#guideNext').click();
  await page.locator('#addButton').click();
  await expect(page.locator('#guideOverlay')).toBeHidden();
  await expect(page.locator('#addChoice')).toBeVisible();
  expect(await page.evaluate(()=>window.handleAndroidBack())).toBe(true);
  await expect(page.locator('#addChoice')).toBeHidden();
  await expect(page.locator('#guideOverlay')).toBeVisible();
  await page.locator('#guideSkip').click();await expect(page.locator('#guideOverlay')).toBeHidden();
});
