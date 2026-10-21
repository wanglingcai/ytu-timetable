const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const extract=fs.readFileSync(path.join(root,'app/src/main/assets/portal-extract.js'),'utf8');
test('官网读取仅采集课程表，多课程、合并行、教师与隐藏课程提示可预览保存',async({page})=>{
  await page.setContent(fs.readFileSync(path.join(root,'examples/模拟URP官网.html'),'utf8'));
  const payload=JSON.parse(await page.evaluate(extract=>eval(extract),extract));
  expect(JSON.stringify(payload)).not.toContain('fake-password');
  expect(JSON.stringify(payload)).not.toContain('个人资料');
  expect(JSON.stringify(payload)).not.toContain('个人编号');
  expect(payload.cardCount).toBe(2);
  await page.goto('/');
  await page.evaluate(payload=>window.receivePortalImport(payload),payload);
  await expect(page.locator('#previewList .list-card')).toHaveCount(2);
  await expect(page.locator('#previewList')).toContainText('教师甲 教师乙');
  await expect(page.locator('#importWarnings')).toContainText('1 门课程未在网格显示');
  expect(await page.evaluate(()=>localStorage.getItem('ytu-timetable-v1'))).toBeNull();
  await page.locator('#importStart').fill('2026-08-31');await page.locator('#reviewCheck').check();await page.locator('#saveImport').click();
  const before=await page.evaluate(()=>localStorage.getItem('ytu-timetable-v1'));
  await page.evaluate(()=>window.receivePortalImport({source:'ytu-urp',rows:[],merges:[]}));
  expect(await page.evaluate(()=>localStorage.getItem('ytu-timetable-v1'))).toBe(before);
  await page.reload();await expect(page.locator('.course-card')).toHaveCount(2);
  await page.screenshot({path:'test-results/portal-import-phone.png',fullPage:true});
});
test('官网尚未加载或空课表时返回明确错误，桌面预览引导安卓使用',async({page})=>{
  await page.goto('/');
  const missing=JSON.parse(await page.evaluate(extract=>eval(extract),extract));
  expect(missing.error).toContain('尚未找到课表');
  await page.evaluate(()=>{const t=document.createElement('table');t.id='courseTable';document.body.append(t);});
  const empty=JSON.parse(await page.evaluate(extract=>eval(extract),extract));expect(empty.code).toBe('EMPTY_TABLE');expect(empty.retryable).toBe(true);
  await page.locator('#portalImport').click();await expect(page.locator('#toast')).toContainText('安卓应用');
});

test('同源嵌入课表及无固定类名的段落可读取，缺少 Array.at 时仍能预览',async({page})=>{
  const html=fs.readFileSync(path.join(root,'examples/模拟URP官网.html'),'utf8').replace('id="courseTable"','id="mobileTable"').replace(/class="class_div"/g,'class="mobile-course"');
  await page.setContent('<iframe id="courseFrame"></iframe>');
  await page.evaluate(html=>{const doc=document.getElementById('courseFrame').contentDocument;doc.open();doc.write(html);doc.close();},html);
  const payload=JSON.parse(await page.evaluate(extract=>eval(extract),extract));
  expect(payload.source).toBe('ytu-urp');
  await page.goto('/');
  await page.evaluate(()=>{Array.prototype.at=undefined;});
  await page.evaluate(payload=>receivePortalImport(payload),payload);
  await expect(page.locator('#previewList .list-card')).toHaveCount(2);
  await expect(page.locator('#previewList')).toContainText('教师甲 教师乙');
});
