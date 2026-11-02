const {test,expect}=require('@playwright/test');
const payload={source:'self-portal',schoolName:'测试学校',courses:[{name:'数学',day:1,start:1,end:2,weeks:[1,2,3,16],teacher:'',room:''}]};
test('未识别日期时必须填写，周数按课程最晚周建议，不会提前保存',async({page})=>{
  await page.goto('/'); await page.evaluate(p=>receivePortalImport(p),payload);
  await expect(page.locator('#importStart')).toHaveValue(''); await expect(page.locator('#importWeeks')).toHaveValue('16');
  await expect(page.locator('#importDateSuggestion')).toContainText('未识别'); await expect(page.locator('#importWeeksSuggestion')).toContainText('16 周');
  await page.locator('#reviewCheck').check(); await page.locator('#saveImport').click();
  await expect(page.locator('#toast')).toContainText('第一周周一'); expect(await page.evaluate(()=>localStorage.getItem('ytu-timetable-v1'))).toBeNull();
  await page.locator('#importStart').fill('2026-08-31'); await page.locator('#saveImport').click();
  expect(JSON.parse(await page.evaluate(()=>localStorage.getItem('ytu-timetable-v1'))).totalWeeks).toBe(16);
});
test('官网识别日期填入预览；来源冲突不使用旧日期，并保持现有课表',async({page})=>{
  await page.goto('/'); await page.evaluate(p=>receivePortalImport({...p,semester:{startDate:'2026-08-31',source:'页面当前日期和当前教学周'}}),payload);
  await expect(page.locator('#importStart')).toHaveValue('2026-08-31'); await expect(page.locator('#importDateSuggestion')).toContainText('当前教学周');
  await page.locator('#reviewCheck').check(); await page.locator('#saveImport').click();
  const before=await page.evaluate(()=>localStorage.getItem('ytu-timetable-v1'));
  await page.evaluate(p=>receivePortalImport({...p,semester:{conflict:true}}),payload);
  await expect(page.locator('#importStart')).toHaveValue(''); await expect(page.locator('#importDateSuggestion')).toContainText('冲突');
  await page.locator('#reviewCheck').check(); await page.locator('#saveImport').click();
  expect(await page.evaluate(()=>localStorage.getItem('ytu-timetable-v1'))).toBe(before);
});
