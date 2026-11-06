const {test,expect}=require('./fixtures.cjs');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const core=fs.readFileSync(path.join(root,'app/src/main/assets/core.js'),'utf8');
const extractor=fs.readFileSync(path.join(root,'app/src/main/assets/schools/self-extract.js'),'utf8');
const extract='(function(){var module={exports:{}};\n'+core+'\nvar Timetable=module.exports; var result = '+extractor+'\nreturn result;})()';

test('自助入口和标准表格识别进入预览，确认前不保存',async({page})=>{
  await page.setContent('<input type="password" value="secret"><table><tr><th>课程名称</th><th>星期</th><th>节次</th><th>周次</th><th>教师</th><th>教室</th></tr><tr><td>高等数学</td><td>星期一</td><td>1-2</td><td>1-16</td><td>张老师</td><td>教室101</td></tr></table>');
  const payload=JSON.parse(await page.evaluate(code=>eval(code),extract));
  expect(payload.courses).toHaveLength(1); expect(JSON.stringify(payload)).not.toContain('secret');
  await page.goto('/'); await page.locator('#importButton').click(); await expect(page.locator('#selfPortalImport')).toBeVisible();
  await page.evaluate(payload=>window.receivePortalImport(payload),payload);
  await expect(page.locator('#previewList')).toContainText('高等数学'); await expect(page.locator('#importWarnings')).toContainText('逐项核对');
  expect(await page.evaluate(()=>localStorage.getItem('ytu-timetable-v1'))).toBeNull();
  await page.locator('#importStart').fill('2026-08-31'); await page.locator('#reviewCheck').check(); await page.locator('#saveImport').click();
  expect(await page.evaluate(()=>localStorage.getItem('ytu-timetable-v1'))).toContain('高等数学');
});
test('周课表网格和明确标注的课程卡片可识别',async({page})=>{
  await page.setContent('<table><tr><th>节次</th><th>星期一</th><th>星期二</th><th>星期三</th></tr><tr><th>第1-2节</th><td>数学<br>张老师<br>1-16周<br>第1-2节<br>教室101</td><td></td><td></td></tr></table>');
  let payload=JSON.parse(await page.evaluate(code=>eval(code),extract)); expect(payload.courses[0].name).toBe('数学');
  await page.setContent('<div class="course-card"><p>课程名称：英语</p><p>星期：星期二</p><p>节次：3-4</p><p>周次：1-16</p><p>教师：李老师</p><p>教室：B202</p></div><div class="course-card">课程缺少标签</div>');
  payload=JSON.parse(await page.evaluate(code=>eval(code),extract)); expect(payload.courses[0].name).toBe('英语'); expect(payload.warnings.join()).toContain('未导入');
});
test('自助网页中的方括号周次表格复用文件导入规则',async({page})=>{
  await page.setContent('<table><tr><th>节次</th><th>星期一</th><th>星期二</th><th>星期三</th></tr><tr><th>第3节</th><td>模拟课程甲<br>模拟教师<br>1-3,5-7([周])[03-04-05节]<br>模拟楼101<br><br>模拟课程乙<br>教师乙<br>2-8([双周])[03-04-05节]<br>模拟楼202</td><td></td><td></td></tr></table>');
  const payload=JSON.parse(await page.evaluate(code=>eval(code),extract));
  expect(payload.courses).toHaveLength(2);
  expect(payload.courses[0]).toMatchObject({name:'模拟课程甲',teacher:'模拟教师',room:'模拟楼101',day:1,start:3,end:5,weeks:[1,2,3,5,6,7]});
  expect(payload.courses[1]).toMatchObject({name:'模拟课程乙',teacher:'教师乙',room:'模拟楼202',day:1,start:3,end:5,weeks:[2,4,6,8]});
  await page.goto('/');await page.evaluate(p=>receivePortalImport(p),payload);
  await expect(page.locator('#previewList .list-card')).toHaveCount(2);
  expect(await page.evaluate(()=>localStorage.getItem('ytu-timetable-v1'))).toBeNull();
});
test('同源框架中的强智详细课表提取多门课程',async({page})=>{
  await page.setContent('<iframe></iframe>');
  await page.locator('iframe').evaluate(frame=>{frame.contentDocument.body.innerHTML='<table><tr><th>节次</th><th>星期一</th><th>星期二</th><th>星期三</th></tr><tr><th>第1-2节</th><td><div class="kbcontent1">简略课程</div><div class="kbcontent" style="display:none">模拟课程甲<br><font title="老师">模拟教师</font><br><font title="周次(节次)">1-3,5-7(周)[01-02节]</font><br><font title="教室">模拟楼101</font><br>---------------------<br>模拟课程乙<br><font title="老师">教师乙</font><br><font title="周次(节次)">2-8(双周)[01-02节]</font><br><font title="教室">模拟楼202</font></div></td><td></td><td></td></tr></table>';});
  const payload=JSON.parse(await page.evaluate(code=>eval(code),extract));
  expect(payload.courses).toHaveLength(2);
  expect(payload.courses[0]).toMatchObject({name:'模拟课程甲',teacher:'模拟教师',room:'模拟楼101',day:1,start:1,end:2,weeks:[1,2,3,5,6,7]});
  expect(payload.courses[1]).toMatchObject({name:'模拟课程乙',teacher:'教师乙',room:'模拟楼202',day:1,start:1,end:2,weeks:[2,4,6,8]});
});
test('无课表或不完整课程返回文件导入提示',async({page})=>{
  await page.setContent('<div class="course-card"><p>课程名称：英语</p></div>');
  const payload=JSON.parse(await page.evaluate(code=>eval(code),extract)); expect(payload.error).toContain('Excel'); expect(payload.error).toContain('HTML'); expect(payload.error).toContain('原课表未修改'); expect(payload.courses).toBeUndefined();
  await page.goto('/'); await page.locator('#importButton').click(); await page.locator('#selfPortalImport').click(); await expect(page.locator('#toast')).toContainText('安卓应用');
});


test('自助官网读取只携带学期建议，不返回页面上的登录字段',async({page})=>{
  await page.setContent('<p>第一周周一：2026-08-31</p><input value="secret"><table><tr><th>课程名称</th><th>星期</th><th>节次</th><th>周次</th></tr><tr><td>数学</td><td>星期一</td><td>1-2</td><td>1-16</td></tr></table>');
  const payload=JSON.parse(await page.evaluate(code=>eval(code),extract));
  expect(payload.semester.startDate).toBe('2026-08-31'); expect(JSON.stringify(payload)).not.toContain('secret');
  await page.goto('/'); await page.evaluate(p=>receivePortalImport(p),payload);
  await expect(page.locator('#importStart')).toHaveValue('2026-08-31'); await expect(page.locator('#importWeeks')).toHaveValue('16');
});
