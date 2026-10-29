const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const core=fs.readFileSync(path.join(root,'app/src/main/assets/core.js'),'utf8');
const extractor=fs.readFileSync(path.join(root,'app/src/main/assets/schools/ytu/portal-extract.js'),'utf8');
const extract='(function(){var module={exports:{}};\n'+core+'\nvar Timetable=module.exports; var result = '+extractor+'\nreturn result;})()';
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
  await page.locator('#importButton').click();await page.locator('#portalImport').click();await expect(page.locator('#toast')).toContainText('安卓应用');
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

test('手机版仅显示课程名或卡片位于表格外时，不误报未排课',async({page})=>{
  await page.setContent('<table id="courseTable"><tr><th>节次</th><th>星期一</th><th>星期二</th><th>星期三</th></tr><tr><th>第1小节</th><td></td><td></td><td></td></tr></table><div class="div-kcb-1">模拟课程_01</div>');
  const result=JSON.parse(await page.evaluate(extract=>eval(extract),extract));
  expect(result.code).toBe('MOBILE_DETAILS');
  expect(result.error).toContain('页面已显示课程');expect(result.error).not.toContain('未排课');
});

test('标准课程对象进入预览并保留单双周',async({page})=>{
  const courses=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/schools/ytu/expected-courses.json'),'utf8'));
  await page.goto('/');
  await page.evaluate(courses=>window.receivePortalImport({source:'ytu-urp',schoolName:'烟台大学',courses,warnings:[]}),courses);
  await expect(page.locator('#previewList .list-card')).toHaveCount(3);
  await expect(page.locator('#previewList')).toContainText('教师甲 教师乙');
  await expect(page.locator('#previewList')).toContainText('模拟校区B楼202');
  await expect(page.locator('#previewList')).toContainText('2,4,6,8 周');
});

test('脱敏网页标准课程与接口预期逐字段一致',async({page})=>{
  const expected=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/schools/ytu/expected-courses.json'),'utf8'));
  const html=fs.readFileSync(path.join(root,'tests/fixtures/schools/ytu/course-result.html'),'utf8');
  await page.setContent(html);
  const payload=JSON.parse(await page.evaluate(code=>eval(code),extract));
  expect(payload.courses).toEqual(expected);
  expect(payload).not.toHaveProperty('rows');
});

test('课程结构改变时返回明确错误',async({page})=>{
  await page.setContent('<table id="courseTable"><tr><th>节次</th><th>星期一</th><th>星期二</th><th>星期三</th></tr><tr><th>第1节</th><td><div class="class_div"><p>课程新版</p><p>未知时间</p></div></td><td></td><td></td></tr></table>');
  const payload=JSON.parse(await page.evaluate(code=>eval(code),extract));
  expect(payload.code).toBe('UNSUPPORTED_LAYOUT');
  expect(payload.error).toContain('HTML 或 Excel');
  expect(payload).not.toHaveProperty('courses');
});
