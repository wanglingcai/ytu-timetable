const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
async function fixture(page){
 await page.clock.setFixedTime(new Date('2026-11-02T08:42:00+08:00'));
 await page.goto('/');
 await page.evaluate(()=>{
  const course=(id,name,start,end,weeks,day=1)=>Timetable.validateCourse({id,name,day,start,end,weeks,room:'A101'});
  const courses=[course('math','模拟数学',1,2,[1,3]),course('english','模拟英语',2,3,[1]),course('odd','其他周同位置课程',1,2,[2]),course('sporadic','学期仅上一次的课程',5,6,[4],3),{...course('personal','其他周个人安排',3,4,[2]),kind:'personal'}];
  localStorage.setItem('ytu-timetable-v1',JSON.stringify(Timetable.validateState({...Timetable.defaultState(),startDate:'2026-11-02',totalWeeks:4,courses})));
 });await page.reload();
}
test('图例小按钮切换灰色课程，跨视图、重启与备份恢复后保留偏好',async({page})=>{
 await fixture(page);
 await expect(page.locator('.course-card.inactive')).toHaveCount(2);
 await expect(page.locator('#toggleInactive')).toHaveAttribute('aria-label','隐藏非本周课程');
 const before=JSON.parse(await page.evaluate(()=>localStorage.getItem('ytu-timetable-v1')));
 await page.locator('#toggleInactive').click();
 await expect(page.locator('.course-card')).toHaveCount(2);await expect(page.locator('#conflictNotice')).toBeVisible();
 await expect(page.locator('#toggleInactive')).toHaveAttribute('aria-pressed','false');
 await page.locator('#viewToggle').click();await expect(page.locator('#listView .list-card')).toHaveCount(2);
 await page.reload();await expect(page.locator('.course-card')).toHaveCount(2);
 expect(JSON.parse(await page.evaluate(()=>localStorage.getItem('ytu-timetable-v1'))).courses).toEqual(before.courses);
 await page.locator('#allButton').click();await expect(page.locator('#allDialog')).toContainText('学期仅上一次的课程');
 await page.locator('#allDialog .close-dialog').click();
 const pending=page.waitForEvent('download');await page.locator('#backupButton').click();const download=await pending;
 const backup=JSON.parse(fs.readFileSync(await download.path(),'utf8'));expect(backup.showInactiveCourses).toBe(false);
 await page.evaluate(()=>localStorage.clear());await page.reload();
 await page.locator('#fileInput').setInputFiles({name:'显示偏好备份.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
 await page.locator('#reviewCheck').check();await page.locator('#saveImport').click();await expect(page.locator('.course-card.inactive')).toHaveCount(0);
 await page.locator('#toggleInactive').click();await expect(page.locator('.course-card.inactive')).toHaveCount(2);
});
test('冲突提示显示交叠日期节次时间和双方名称，可从详情查看另一门课',async({page})=>{
 await fixture(page);
 await expect(page.locator('#conflictNotice')).toContainText('第 1 周有 1 组时间冲突');
 await expect(page.locator('#conflictNotice')).toContainText('11/02 星期一 第 2 节（08:55–09:40）：模拟数学 与 模拟英语');
 await expect(page.locator('.course-card.conflict')).toHaveCount(2);
 await page.locator('#conflictNotice button').click();await expect(page.locator('#courseDetail .course-conflicts')).toContainText('第 1 周');
 await page.locator('#courseDetail .conflict-link').click();await expect(page.locator('#courseDetail .detail-name')).toHaveText('模拟英语');
 await page.locator('#courseDialog .close-dialog').click();await page.locator('#viewToggle').click();
 await expect(page.locator('#listView .list-card.conflict')).toHaveCount(2);
 await page.locator('#weekSelect').selectOption('2');await expect(page.locator('#conflictNotice')).not.toBeVisible();
});
test('导入预览指出发生冲突的周次和精确时间，不把不同周次当冲突',async({page})=>{
 await page.goto('/');
 await page.evaluate(()=>receivePortalImport({source:'self-portal',courses:[{name:'甲课程',day:2,start:1,end:2,weeks:[1,3]},{name:'乙课程',day:2,start:2,end:3,weeks:[3,4]},{name:'不同周课程',day:2,start:1,end:3,weeks:[2]}]}));
 await expect(page.locator('#importWarnings')).toContainText('1 组时间冲突');
 await expect(page.locator('#importWarnings')).toContainText('第 3 周 · 星期二 第 2 节（08:55–09:40）：甲课程 与 乙课程');
});
test('320px 小屏图例按钮与冲突内容没有横向溢出',async({page})=>{
 await page.setViewportSize({width:320,height:700});await fixture(page);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('#toggleInactive').click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/conflict-and-toggle-320.png',fullPage:true});
});
