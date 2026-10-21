const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
async function setup(page) {
  await page.goto('/');
  await page.evaluate(()=>{
    const school=Timetable.validateCourse({id:'school',name:'模拟数学',day:1,start:1,end:2,weeks:[1,3,5],room:'A101'});
    localStorage.setItem('ytu-timetable-v1',JSON.stringify({...Timetable.defaultState(),startDate:'2026-08-31',courses:[school]}));
  });
  await page.reload();await page.locator('#weekSelect').selectOption('8');
}
test('课程提醒与个人安排分别设置，修改后备份恢复保留提醒',async({page})=>{
  await setup(page);await page.locator('#settingsButton').click();
  await expect(page.locator('#courseReminder')).toHaveValue('10');
  await expect(page.locator('#reminderStatus')).toContainText('浏览器仅保存设置');
  await expect(page.locator('#notificationPermission')).not.toBeVisible();
  for(const minutes of ['0','5','15','30','-1','10']) {
    await page.locator('#courseReminder').selectOption(minutes);await page.getByRole('button',{name:'保存设置',exact:true}).click();
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('ytu-timetable-v1')).reminders.courseMinutes)).toBe(Number(minutes));
    await page.locator('#settingsButton').click();await expect(page.locator('#courseReminder')).toHaveValue(minutes);
  }
  await page.locator('#settingsDialog .close-dialog').click();
  await page.locator('.empty-slot[data-day="7"][data-section="5"]').click();await expect(page.locator('#personalReminder')).toHaveValue('-1');
  await page.locator('#courseName').fill('模拟自习');await page.locator('#personalReminder').selectOption('15');await page.locator('#saveCourse').click();
  await page.locator('.personal-entry').click();await expect(page.locator('#courseDetail')).toContainText('提前 15 分钟');
  await page.getByRole('button',{name:'修改安排',exact:true}).click();await expect(page.locator('#personalReminder')).toHaveValue('15');
  await page.locator('#personalReminder').selectOption('0');await page.locator('#saveCourse').click();
  const waiting=page.waitForEvent('download');await page.locator('#backupButton').click();const download=await waiting;
  const state=JSON.parse(fs.readFileSync(await download.path(),'utf8'));expect(state.courses.find(c=>c.kind==='personal').reminderMinutes).toBe(0);
  await page.evaluate(()=>localStorage.clear());await page.reload();
  await page.locator('#fileInput').setInputFiles({name:'模拟提醒备份.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(state))});
  await page.locator('#reviewCheck').check();await page.locator('#saveImport').click();
  await page.evaluate(()=>openReminder({id:JSON.parse(localStorage.getItem('ytu-timetable-v1')).courses.find(c=>c.kind==='personal').id,date:'2026-10-25'}));
  await expect(page.locator('#weekSelect')).toHaveValue('8');await expect(page.locator('#courseDetail')).toContainText('模拟自习');await expect(page.locator('#courseDetail')).toContainText('准点提醒');
  await page.getByRole('button',{name:'修改安排',exact:true}).click();await page.locator('#personalReminder').selectOption('-1');await page.locator('#saveCourse').click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('ytu-timetable-v1')).courses.find(c=>c.kind==='personal').reminderMinutes)).toBe(-1);
});
test('通知跳转定位实际周次，过期或已删通知不打开错误详情',async({page})=>{
  await setup(page);await page.evaluate(()=>openReminder({id:'school',date:'2026-09-14'}));
  await expect(page.locator('#weekSelect')).toHaveValue('3');await expect(page.locator('#courseDetail')).toContainText('第 3 周上课');
  await page.locator('#courseDialog .close-dialog').click();
  await page.evaluate(()=>openReminder({id:'school',date:'2026-09-07'}));await expect(page.locator('#courseDialog')).not.toBeVisible();await expect(page.locator('#toast')).toContainText('日期已改变');
  await page.evaluate(()=>openReminder({id:'deleted',date:'2026-09-14'}));await expect(page.locator('#courseDialog')).not.toBeVisible();await expect(page.locator('#toast')).toContainText('删除或替换');
});
test('安卓权限入口与状态文案，返回系统设置可刷新',async({page})=>{
  await page.addInitScript(()=>{
    window.mockPermissions={notifications:false,exact:false,nextAt:0};window.permissionCalls=[];
    window.AndroidLocal={readState:()=>localStorage.getItem('ytu-timetable-v1')||'',saveState:json=>{localStorage.setItem('ytu-timetable-v1',json);return true;},reminderStatus:()=>JSON.stringify(window.mockPermissions),reminderPermission:kind=>window.permissionCalls.push(kind)};
  });
  await setup(page);await expect(page.locator('#reminderPermissionHint')).toBeVisible();await page.locator('#reminderSettingsButton').click();
  await expect(page.locator('#reminderStatus')).toContainText('通知未开启');await page.locator('#notificationPermission').click();await page.locator('#exactReminderPermission').click();
  expect(await page.evaluate(()=>permissionCalls)).toEqual(['notifications','exact']);
  await page.evaluate(()=>{mockPermissions.notifications=true;refreshReminderStatus();});await expect(page.locator('#reminderStatus')).toContainText('可能延迟');
  await page.evaluate(()=>{mockPermissions.exact=true;mockPermissions.nextAt=new Date(2026,9,25,13,50).getTime();refreshReminderStatus();});await expect(page.locator('#reminderStatus')).toContainText('下一次提醒');await expect(page.locator('#exactReminderPermission')).not.toBeVisible();
  await expect(page.locator('#reminderPermissionHint')).not.toBeVisible();
  await page.locator('#settingsDialog').evaluate(dialog=>dialog.scrollTop=0);
  await page.screenshot({path:'test-results/reminder-settings-phone.png'});
});
