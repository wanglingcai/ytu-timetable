const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const core=fs.readFileSync(path.join(root,'app/src/main/assets/core.js'),'utf8');
const extractor=fs.readFileSync(path.join(root,'app/src/main/assets/schools/self-extract.js'),'utf8');
const script='(function(){var module={exports:{}};\n'+core+'\nvar Timetable=module.exports; var result = '+extractor+'\nreturn result;})()';
const card=(name,time,room,teacher)=>`<div class="timetable_con"><span class="title">${name}○</span><p><span title="节/周"></span><font>${time}</font></p><p><span title="上课地点"></span><font>* ${room}</font></p><p><span title="教师 "></span><font>${teacher}</font></p><p><span title="教学班组成"></span><font>不要读取个人信息</font></p></div>`;
const html=`<table id="kbgrid_table_0"><tr><td colspan="9">模拟学期</td></tr><tr><td>时间段</td><td>节次</td><td>星期一</td><td>星期二</td><td>星期三</td><td>星期四</td><td>星期五</td><td>星期六</td><td>星期日</td></tr><tr><td rowspan="2">上午</td><td>1</td><td rowspan="2">${card('模拟数学','(1-2节)1-4周,6-12周','A101','教师甲')}${card('模拟英语','(1-2节)3-5周(单),6-9周','B202','教师乙')}</td><td></td><td></td><td></td><td></td><td></td><td></td></tr><tr><td>2</td><td></td><td></td><td></td><td></td><td></td><td></td></tr></table>`;
test('正方课表在线读取和 HTML 文件导入保留同格多课程、离散单双周且不带教学班隐私',async({page})=>{
 await page.setContent(html);
 const result=JSON.parse(await page.evaluate(code=>eval(code),script));
 expect(result.courses).toHaveLength(2); expect(result.courses[0]).toMatchObject({name:'模拟数学',day:1,start:1,end:2,room:'A101',teacher:'教师甲',weeks:[1,2,3,4,6,7,8,9,10,11,12]});
 expect(result.courses[1].weeks).toEqual([3,5,6,7,8,9]); expect(JSON.stringify(result)).not.toContain('不要读取个人信息');
 await page.goto('/'); await page.locator('#fileInput').setInputFiles({name:'模拟课表.html',mimeType:'text/html',buffer:Buffer.from(html)});
 await expect(page.locator('#previewList .list-card')).toHaveCount(2); await expect(page.locator('#previewList')).toContainText('模拟英语');
});

test('无关大表格不能阻断同源嵌入的正方课表',async({page})=>{
  const oversized='<table><tr>'+Array.from({length:33},()=>'<td>无关</td>').join('')+'</tr></table>';
  await page.setContent(oversized+'<iframe id="inner"></iframe>');
  await page.evaluate(content=>{const d=document.querySelector('#inner').contentDocument;d.open();d.write(content);d.close();},html);
  const result=JSON.parse(await page.evaluate(code=>eval(code),script));
  expect(result.courses).toHaveLength(2);expect(result.courses[0].name).toBe('模拟数学');
});
test('跨域嵌入页面无法读取时提供明确提示',async({page})=>{
  await page.route('https://other.example/**',route=>route.fulfill({contentType:'text/html',body:'<html><body>课表</body></html>'}));
  await page.goto('/');await page.evaluate(()=>{const frame=document.createElement('iframe');frame.src='https://other.example/';document.body.append(frame)});
  await page.waitForTimeout(300);
  const result=JSON.parse(await page.evaluate(code=>eval(code),script));
  expect(result.error).toContain('嵌入页面');expect(result.error).toContain('HTML');expect(result.retryable).toBe(true);
});

test('旧版 WebView 缺少 matchAll 和 flatMap 也能读取正方课表并预览',async({page})=>{
 await page.setContent(html);
 const result=JSON.parse(await page.evaluate(code=>{String.prototype.matchAll=undefined;Array.prototype.flatMap=undefined;return eval(code)},script));
 expect(result.courses).toHaveLength(2);
 await page.goto('/'); await page.evaluate(()=>{String.prototype.matchAll=undefined;Array.prototype.flatMap=undefined;});
 await page.evaluate(payload=>receivePortalImport(payload),result);
 await expect(page.locator('#previewList .list-card')).toHaveCount(2);
});

test('正方只保留列表视图时也能识别合并行的星期、节次和多条课程',async({page})=>{
 const record=(name,weeks,room,teacher)=>`<div class="timetable_con"><span class="title">${name}○</span><p><font>周数：${weeks}</font><font>校区:模拟校区 场地：${room}</font><font>教师 ：${teacher}</font><font>教学班：不应采集</font></p></div>`;
 const list=`<table id="kblist_table"><tr><td colspan="3">模拟学期</td></tr><tr><td>星期</td><td>节次</td><td>课程信息</td></tr><tr><td rowspan="3" id="xq_rowspan_1">星期一</td></tr><tr><td rowspan="2" id="jc_1-1-2">1-2</td><td>${record('列表课程甲','1-4周,6-12周','A101','教师甲')}</td></tr><tr><td>${record('列表课程乙','3-5周(单),6-9周','B202','教师乙')}</td></tr><tr><td rowspan="2" id="xq_rowspan_2">星期二</td></tr><tr><td id="jc_2-3-4">3-4</td><td>${record('列表课程丙','第13周','C303','教师丙')}</td></tr></table>`;
 await page.setContent(list);
 const result=JSON.parse(await page.evaluate(code=>eval(code),script));
 expect(result.courses).toHaveLength(3);
 expect(result.courses[0]).toMatchObject({name:'列表课程甲',day:1,start:1,end:2,room:'A101',teacher:'教师甲',weeks:[1,2,3,4,6,7,8,9,10,11,12]});
 expect(result.courses[1].weeks).toEqual([3,5,6,7,8,9]);
 expect(result.courses[2]).toMatchObject({day:2,start:3,end:4,weeks:[13]});
 expect(JSON.stringify(result)).not.toContain('不应采集');
 await page.goto('/');await page.locator('#fileInput').setInputFiles({name:'模拟列表课表.html',mimeType:'text/html',buffer:Buffer.from(list)});
 await expect(page.locator('#previewList .list-card')).toHaveCount(3);
});
