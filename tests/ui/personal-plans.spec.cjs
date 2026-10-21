const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
async function setup(page,withPlan=false) {
  await page.goto('/');
  await page.evaluate(withPlan=>{
    const T=Timetable,school=T.validateCourse({id:'school',name:'模拟学校课程',teacher:'模拟教师',room:'A101',day:2,start:1,end:2,weeks:Array.from({length:18},(_,i)=>i+1)});
    const courses=[school];
    if(withPlan)courses.push(T.validateCourse({id:'personal',kind:'personal',name:'模拟自习',notes:'保留这条备注',teacher:'',room:'图书馆',day:7,start:5,end:6,weeks:[8]}));
    localStorage.setItem('ytu-timetable-v1',JSON.stringify({...T.defaultState(),startDate:'2026-08-31',semester:'模拟学期',courses}));
  },withPlan);
  await page.reload();await page.locator('#weekSelect').selectOption('8');
}
test('点击空白格：单周默认、编辑备注、跨周、备份恢复与删除均保留学校课程',async({page})=>{
  await setup(page);
  await page.locator('.empty-slot[data-day="7"][data-section="5"]').click();
  await expect(page.locator('#editTitle')).toHaveText('添加个人安排');
  await expect(page.locator('#courseDay')).toHaveValue('7');await expect(page.locator('#courseSections')).toHaveValue('5');await expect(page.locator('#courseWeeks')).toHaveValue('8');
  await expect(page.locator('#courseTeacherField')).not.toBeVisible();
  await page.locator('#courseName').fill('图书馆自习');await page.locator('#courseSections').fill('5-6');await page.locator('#courseRoom').fill('图书馆二楼');
  await page.locator('#entryNotes').fill('复习第三章\n完成习题 <img src=x onerror="window.notesXss=1">');await page.locator('#saveCourse').click();
  await expect(page.locator('.personal-entry')).toHaveCount(1);
  await page.locator('#weekSelect').selectOption('9');await expect(page.locator('.personal-entry')).toHaveCount(0);
  await page.locator('#weekSelect').selectOption('8');await page.locator('.personal-entry').click();
  await expect(page.locator('#courseDetail')).toContainText('2026-10-25');await expect(page.locator('#courseDetail')).toContainText('复习第三章');
  expect(await page.evaluate(()=>window.notesXss)).toBeUndefined();
  await page.getByRole('button',{name:'修改安排',exact:true}).click();
  await expect(page.locator('#entryNotes')).toHaveValue(/复习第三章/);
  await page.locator('#courseWeeks').fill('8-10');await page.locator('#entryNotes').fill('复习数学\n整理错题');await page.locator('#saveCourse').click();
  await page.reload();await page.locator('#weekSelect').selectOption('9');await expect(page.locator('.personal-entry')).toHaveCount(1);
  const downloadPromise=page.waitForEvent('download');await page.locator('#backupButton').click();const download=await downloadPromise;
  const backup=JSON.parse(fs.readFileSync(await download.path(),'utf8'));expect(backup.courses.find(c=>c.kind==='personal').notes).toBe('复习数学\n整理错题');
  await page.evaluate(()=>localStorage.clear());await page.reload();
  await page.locator('#fileInput').setInputFiles({name:'备份.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await page.locator('#reviewCheck').check();await page.locator('#saveImport').click();await page.locator('#weekSelect').selectOption('8');
  await page.screenshot({path:'test-results/personal-plan-phone.png',fullPage:true});
  await page.locator('.personal-entry').click();await expect(page.locator('#courseDetail')).toContainText('整理错题');
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'删除安排',exact:true}).click();
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('ytu-timetable-v1')));expect(state.courses).toHaveLength(1);expect(state.courses[0].id).toBe('school');
});
test('同学期重新导入保留个人安排，切换学期取消确认不会丢数据',async({page})=>{
  await setup(page,true);
  const payload={source:'ytu-urp',rows:[['课程名称','星期','节次','周次'],['新模拟课程','星期四','3-4','1-16']],merges:[],warnings:[]};
  await page.evaluate(payload=>receivePortalImport(payload),payload);await page.locator('#reviewCheck').check();await page.locator('#saveImport').click();
  const before=await page.evaluate(()=>localStorage.getItem('ytu-timetable-v1'));
  expect(JSON.parse(before).courses.find(c=>c.kind==='personal')).toMatchObject({id:'personal',notes:'保留这条备注',weeks:[8]});
  await page.evaluate(payload=>receivePortalImport(payload),payload);await page.locator('#importStart').fill('2026-09-07');await page.locator('#reviewCheck').check();
  page.once('dialog',dialog=>dialog.dismiss());await page.locator('#saveImport').click();expect(await page.evaluate(()=>localStorage.getItem('ytu-timetable-v1'))).toBe(before);
  page.once('dialog',dialog=>dialog.accept());await page.locator('#saveImport').click();
  expect((await page.evaluate(()=>JSON.parse(localStorage.getItem('ytu-timetable-v1')))).courses.some(c=>c.kind==='personal')).toBe(false);
});
