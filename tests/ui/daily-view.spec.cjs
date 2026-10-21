const {test,expect}=require('@playwright/test');
const path=require('node:path');
async function sample(page) {
  await page.clock.install({time:new Date('2026-10-21T13:35:20+08:00')});
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  await page.evaluate(()=>{
    const T=Timetable,school={id:'math-wed',name:'高等数学',teacher:'模拟教师',room:'六教306',day:3,start:5,end:6,weeks:[8],color:1};
    const courses=[school,{...school,id:'math-thu',day:4,start:1,end:2,color:7},{...school,id:'gray',name:'大学物理',weeks:[9]},
      {...school,id:'english',name:'大学英语',day:2,start:3,end:4},
      {...school,id:'plan',kind:'personal',name:'图书馆自习',teacher:'',notes:'复习第三章',room:'图书馆二楼',reminderMinutes:15,day:7,weeks:[8]}].map(T.validateCourse);
    localStorage.setItem('ytu-timetable-v1',JSON.stringify({...T.defaultState(),startDate:'2026-08-31',semester:'2026 · 秋季学期',courses}));
  });await page.reload();
}
test('首页真实下一节、时间线、稳定配色和切周后的定位',async({page})=>{
  await sample(page);
  await expect(page.locator('#nextName')).toHaveText('高等数学');await expect(page.locator('#nextCountdown')).toHaveText('还有 25 分钟');
  await expect(page.locator('#nextMeta')).toContainText('今天 14:00–15:40 · 六教306');
  expect((await page.locator('#scheduleGrid').boundingBox()).y).toBeLessThan(330);
  await expect(page.locator('.today-column')).toHaveCount(12);await expect(page.locator('.current-time')).toHaveCount(1);
  const math=page.locator('.course-card').filter({hasText:'高等数学'});await expect(math).toHaveCount(2);
  expect(await math.nth(0).evaluate(n=>n.className.match(/palette-\d/)[0])).toBe(await math.nth(1).evaluate(n=>n.className.match(/palette-\d/)[0]));
  await page.screenshot({path:'test-results/daily-home-phone.png'});
  await page.locator('#weekSelect').selectOption('9');await expect(page.locator('.current-time')).toHaveCount(0);await expect(page.locator('#nextName')).toHaveText('高等数学');
  await page.locator('#nextCard').click();await expect(page.locator('#weekSelect')).toHaveValue('8');await expect(page.locator('#courseDetail')).toContainText('第 8 周上课');
  await page.locator('#courseDialog .close-dialog').click();
  await page.clock.fastForward(25*60000);await expect(page.locator('#nextCountdown')).toHaveText('正在上课');
  await page.clock.fastForward(101*60000);await expect(page.locator('#nextMeta')).toContainText('明天 08:00');
});
test('底部添加、快捷周次、备注展开、短视口保存与取消草稿',async({page})=>{
  await sample(page);await page.locator('.empty-slot[data-day="7"][data-section="7"]').click();
  await expect(page.locator('#editContext')).toHaveText('10月25日 星期日 · 第 7 节');
  await expect(page.locator('#repeatOnce')).toHaveAttribute('aria-pressed','true');await expect(page.locator('#customWeeksField')).not.toBeVisible();await expect(page.locator('#entryNotes')).not.toBeVisible();
  await page.locator('#courseName').fill('操场跑步');await page.locator('#courseRoom').fill('东操场');
  await page.screenshot({path:'test-results/daily-editor-phone.png'});
  await page.locator('#repeatWeekly').click();await expect(page.locator('#courseWeeks')).toHaveValue('1-20');await expect(page.locator('#editContext')).toContainText('每周星期日');
  await page.locator('#repeatCustom').click();await page.locator('#courseWeeks').fill('8-10');
  await page.locator('#notesDetails summary').click();await page.locator('#entryNotes').fill('先热身，再跑三圈');
  await page.setViewportSize({width:393,height:450});
  expect((await page.locator('#editDialog').boundingBox()).y).toBeGreaterThanOrEqual(0);
  await page.locator('#saveCourse').click();await expect(page.locator('#editDialog')).not.toBeVisible();
  const saved=await page.evaluate(()=>localStorage.getItem('ytu-timetable-v1'));
  expect(JSON.parse(saved).courses.find(c=>c.name==='操场跑步')).toMatchObject({weeks:[8,9,10],notes:'先热身，再跑三圈'});
  await page.setViewportSize({width:393,height:852});await page.locator('#addButton').click();await page.locator('#addPersonalButton').click();await page.locator('#courseName').fill('未保存草稿');await page.locator('#cancelEdit').click();
  expect(await page.evaluate(()=>localStorage.getItem('ytu-timetable-v1'))).toBe(saved);
  await page.locator('#allButton').click();await page.locator('#allList .list-card').filter({hasText:'操场跑步'}).click();
  expect(await page.evaluate(()=>handleAndroidBack())).toBe(true);await expect(page.locator('#courseDialog')).not.toBeVisible();await expect(page.locator('#allDialog')).toBeVisible();
  expect(await page.evaluate(()=>handleAndroidBack())).toBe(true);await expect(page.locator('#allDialog')).not.toBeVisible();
});
test('统一导入入口可选择文件，空课表也能从加号添加个人安排',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await page.locator('#emptyImport').click();await expect(page.locator('#importChoice')).toBeVisible();
  const waiting=page.waitForEvent('filechooser');await page.locator('#fileImport').click();await(await waiting).setFiles(path.resolve(__dirname,'../../examples/课程清单模板.csv'));
  await expect(page.locator('#importDialog')).toBeVisible();await page.locator('#cancelImport').click();
  await page.locator('#importButton').click();await page.locator('#portalImport').click();await expect(page.locator('#importChoice')).not.toBeVisible();await expect(page.locator('#toast')).toBeVisible();
  await page.locator('#addButton').click();await page.locator('#addPersonalButton').click();await page.locator('#courseName').fill('模拟晨读');await page.locator('#saveCourse').click();
  await expect(page.locator('#scheduleSection')).toBeVisible();await expect(page.locator('.personal-entry')).toHaveCount(1);
});
test('320px 小屏和宽屏下课表及底部面板无横向溢出，错误提示位于面板内',async({page})=>{
  await sample(page);
  for(const width of [320,393,768]) {
    await page.setViewportSize({width,height:852});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.locator('#addButton').click();await page.locator('#addCourseButton').click();await page.locator('#courseName').fill('模拟补课');await page.locator('#courseSections').fill('8-3');await page.locator('#saveCourse').click();
    await expect(page.locator('#editDialog #toast')).toBeVisible();await expect(page.locator('#toast')).toContainText('节次格式');
    expect(await page.evaluate(()=>document.querySelector('#editDialog').scrollWidth<=document.querySelector('#editDialog').clientWidth+1)).toBe(true);
    await page.locator('#cancelEdit').click();
  }
});
