const {test,expect}=require('@playwright/test');
const path=require('node:path');
const fs=require('node:fs');
const fixture=name=>path.resolve(__dirname,'../../examples',name);
async function importAndSave(page,filename='模拟URP网格.xlsx') {
  await page.locator('#fileInput').setInputFiles(fixture(filename));
  await expect(page.locator('#importDialog')).toBeVisible();
  await expect(page.locator('#previewList .list-card')).toHaveCount(5);
  await page.locator('#importStart').fill('2026-08-31');
  await page.locator('#reviewCheck').check();
  await page.locator('#saveImport').click();
  await expect(page.locator('#importDialog')).not.toBeVisible();
}
test('安卓尺寸：空态、文件预览、周次筛选、刷新后仍有课表',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await expect(page.locator('#emptyState')).toBeVisible();
  await page.screenshot({path:'test-results/empty-phone.png',fullPage:true});
  await page.locator('#fileInput').setInputFiles(fixture('模拟URP网格.xlsx'));
  await expect(page.locator('#previewList .list-card')).toHaveCount(5);
  await page.locator('#saveImport').click();await expect(page.locator('#importDialog')).toBeVisible();
  await expect(page.locator('#toast')).toContainText('勾选');
  await page.locator('#importStart').fill('2026-08-31');await page.locator('#reviewCheck').check();await page.locator('#saveImport').click();
  await page.locator('#weekSelect').selectOption('3');
  await expect(page.locator('.course-card:not(.inactive)')).toHaveCount(3);
  await expect(page.locator('.course-card').filter({hasText:'指定周'})).toHaveCount(1);
  await page.locator('#weekSelect').selectOption('8');
  await expect(page.locator('.course-card:not(.inactive)')).toHaveCount(2);
  await expect(page.locator('.course-card.inactive').filter({hasText:'单周'})).toHaveCount(1);
  await page.screenshot({path:'test-results/schedule-phone.png',fullPage:true});
  await page.reload();await expect(page.locator('#emptyState')).not.toBeVisible();
  await page.locator('#weekSelect').selectOption('9');await expect(page.locator('.course-card:not(.inactive)')).toHaveCount(4);
  await page.locator('#viewToggle').click();await expect(page.locator('#listView .list-card:not(.inactive)')).toHaveCount(4);
  await page.locator('#listView .list-card').first().click();await expect(page.locator('#courseDialog')).toBeVisible();
  expect(errors).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('二进制 XLS、HTML、CSV 均可通过真实文件选择导入',async({page})=>{
  for(const filename of ['模拟URP网格.xls','模拟URP网格.html','课程清单模板.csv']){await page.goto('/');await importAndSave(page,filename);await page.locator('#weekSelect').selectOption('3');await expect(page.locator('.course-card:not(.inactive)')).toHaveCount(filename.endsWith('.csv')?4:3);}
});
test('再次导入时展示新增、删除和调整课程',async({page})=>{
  await page.goto('/');await importAndSave(page,'课程清单模板.csv');
  const csv='课程名称,星期,节次,周次,教师,教室\n示例计算机网络,星期二,1-2,1-17,示例教师,新六教306\n新增课程,星期三,3-4,1-16,新教师,新教室';
  await page.locator('#fileInput').setInputFiles({name:'调课后.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
  await expect(page.locator('#importChanges')).toBeVisible();
  await expect(page.locator('#importChanges')).toContainText('新增 1');
  await expect(page.locator('#importChanges')).toContainText('删除 4');
  await expect(page.locator('#importChanges')).toContainText('调整 1');
  await expect(page.locator('#importChanges')).toContainText('新六教306');
});
test('设置校验、修改课程、备份恢复、失败导入不覆盖原数据',async({page})=>{
  await page.goto('/');await importAndSave(page);
  const before=await page.evaluate(()=>localStorage.getItem('ytu-timetable-v1'));
  await page.locator('#fileInput').setInputFiles({name:'坏文件.csv',mimeType:'text/csv',buffer:Buffer.from('not a course file')});
  await expect(page.locator('#toast')).toContainText('没有解析到有效课程');
  expect(await page.evaluate(()=>localStorage.getItem('ytu-timetable-v1'))).toEqual(before);
  await page.locator('#settingsButton').click();await page.locator('#startInput').fill('2026-09-01');await page.getByRole('button',{name:'保存设置',exact:true}).click();
  await expect(page.locator('#toast')).toContainText('周一');await expect(page.locator('#settingsDialog')).toBeVisible();
  await page.locator('#startInput').fill('2026-08-31');await page.getByRole('button',{name:'保存设置',exact:true}).click();
  await page.locator('#addButton').click();await page.locator('#addCourseButton').click();await page.locator('#courseName').fill('手动测试课');await page.locator('#courseSections').fill('3-4');await page.locator('#repeatCustom').click();await page.locator('#courseWeeks').fill('2,4,8-10');await page.getByRole('button',{name:'保存课程',exact:true}).click();
  await page.locator('#weekSelect').selectOption('8');await expect(page.locator('.course-card').filter({hasText:'手动测试课'})).toHaveCount(1);
  await page.locator('.course-card').filter({hasText:'手动测试课'}).click();await page.getByRole('button',{name:'修改课程',exact:true}).click();await page.locator('#courseRoom').fill('新增教室');await page.getByRole('button',{name:'保存课程',exact:true}).click();
  const downloadPromise=page.waitForEvent('download');await page.locator('#backupButton').click();const download=await downloadPromise;const file=await download.path();const saved=JSON.parse(fs.readFileSync(file,'utf8'));expect(saved.courses).toHaveLength(6);expect(saved.courses.find(c=>c.name==='手动测试课').room).toBe('新增教室');
  await page.evaluate(()=>localStorage.clear());await page.reload();await page.locator('#fileInput').setInputFiles({name:'备份.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await expect(page.locator('#previewList .list-card')).toHaveCount(6);await page.locator('#reviewCheck').check();await page.locator('#saveImport').click();
  await page.locator('#weekSelect').selectOption('8');await expect(page.locator('.course-card').filter({hasText:'手动测试课'})).toHaveCount(1);
});
test('恶意课程名仅显示为文本，应用不发起外部请求',async({page})=>{
  const remote=[];page.on('request',req=>{if(!req.url().startsWith('http://127.0.0.1:4173'))remote.push(req.url());});
  await page.goto('/');
  const csv='课程名称,星期,节次,周次,教室\n"<img src=x onerror=alert(1)>",星期一,1-2,1-20,A101';
  await page.locator('#fileInput').setInputFiles({name:'文本安全.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await expect(page.locator('#previewList')).toContainText('<img src=x onerror=alert(1)>');expect(await page.locator('#previewList img').count()).toBe(0);expect(remote).toEqual([]);
});
test('非本周灰色显示，单双周同位置都可点击，无课周保留参考安排',async({page})=>{
  await page.goto('/');
  const csv='课程名称,星期,节次,周次,教室\n双周正课,星期一,1-2,1-18双周,A101\n单周参考课,星期一,1-2,1-18单周,B202\n已结束课程,星期三,3-4,1-3,C303\n尚未开始课程,星期五,5-6,12-16,D404';
  await page.locator('#fileInput').setInputFiles({name:'周次显示.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
  await expect(page.locator('#previewList .list-card')).toHaveCount(4);
  await page.locator('#importStart').fill('2026-08-31');await page.locator('#reviewCheck').check();await page.locator('#saveImport').click();
  await page.locator('#weekSelect').selectOption('8');
  await expect(page.locator('.course-card:not(.inactive)')).toHaveCount(1);await expect(page.locator('.course-card.inactive')).toHaveCount(3);
  await expect(page.locator('#scheduleHeading')).toHaveText('本周安排 · 1 项');await expect(page.locator('#conflictNotice')).not.toBeVisible();
  const active=page.locator('.course-card:not(.inactive)'),odd=page.locator('.course-card.inactive').filter({hasText:'单周参考课'});
  const activeBounds=await active.boundingBox(),oddBounds=await odd.boundingBox();expect(activeBounds.y+activeBounds.height).toBeLessThanOrEqual(oddBounds.y+1);expect(activeBounds.width).toBeGreaterThan(35);expect(activeBounds.height).toBeGreaterThan(oddBounds.height);
  expect(await odd.evaluate(n=>getComputedStyle(n).backgroundColor)).toBe('rgba(241, 245, 249, 0.55)');
  await odd.click();await expect(page.locator('#courseDetail')).toContainText('第 8 周不上课（非本周）');await expect(page.locator('#courseDetail')).toContainText('B202');
  await page.locator('#courseDialog .close-dialog').click();await page.locator('#toast').evaluate(n=>n.hidden=true);
  await page.screenshot({path:'test-results/inactive-courses-phone.png',fullPage:true});
  await page.locator('#viewToggle').click();await expect(page.locator('#listView .list-card')).toHaveCount(4);await expect(page.locator('#listView .list-card.inactive')).toHaveCount(3);
  await page.locator('#weekSelect').selectOption('9');await expect(page.locator('.course-card:not(.inactive)')).toContainText('单周参考课');
  await page.locator('#weekSelect').selectOption('20');await expect(page.locator('.course-card.inactive')).toHaveCount(4);await expect(page.locator('#noWeekCourses')).toBeVisible();await expect(page.locator('#scheduleHeading')).toHaveText('第 20 周安排 · 0 项');
  await page.reload();expect((await page.evaluate(()=>JSON.parse(localStorage.getItem('ytu-timetable-v1')))).courses).toHaveLength(4);
});
