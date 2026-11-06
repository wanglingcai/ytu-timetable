const {test,expect}=require('./fixtures.cjs');
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
 await expect(page.locator('.course-card.inactive')).toHaveCount(1);
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
 await page.locator('#settingsButton').click();const pending=page.waitForEvent('download');await page.locator('#backupButton').click();const download=await pending;
 const backup=JSON.parse(fs.readFileSync(await download.path(),'utf8'));expect(backup.showInactiveCourses).toBe(false);
 await page.evaluate(()=>localStorage.clear());await page.reload();
 await page.locator('#settingsButton').click();
 const chooserPromise=page.waitForEvent('filechooser');await page.locator('#restoreBackupButton').click();
 const chooser=await chooserPromise;
 await expect(page.locator('#settingsDialog')).toBeHidden();
 await chooser.setFiles({name:'显示偏好备份.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
 await expect(page.locator('#importDialog')).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('ytu-timetable-v1'))).toBeNull();
 await page.locator('#reviewCheck').check();await page.locator('#saveImport').click();await expect(page.locator('.course-card.inactive')).toHaveCount(0);
 await page.locator('#toggleInactive').click();await expect(page.locator('.course-card.inactive')).toHaveCount(1);
});
test('冲突提示显示交叠日期节次时间和双方名称，可从详情查看另一门课',async({page})=>{
 await fixture(page);
 await expect(page.locator('#conflictNotice')).toContainText('第 1 周有 1 组时间冲突');
 await expect(page.locator('#conflictNotice')).not.toHaveAttribute('open');
 await page.locator('#conflictNotice summary').click();
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

test('不同周重叠收起并可查看，真正冲突、跨节范围和课程数据保留',async({page})=>{
 await page.setViewportSize({width:320,height:700});
 await page.clock.setFixedTime(new Date('2026-11-02T08:42:00+08:00'));
 await page.goto('/');
 await page.evaluate(()=>{
  const make=(id,start,end,weeks,day=1)=>Timetable.validateCourse({id,name:id,day,start,end,weeks,room:id+'教室'});
  const courses=[make('本周甲',1,2,[1]),make('本周乙',2,3,[1]),make('其他周跨节',1,4,[2]),make('其他周同一',1,2,[3]),make('灰色代表',5,6,[2]),make('灰色收起',5,6,[3]),make('孤立课程',7,8,[4])];
  localStorage.setItem('ytu-timetable-v1',JSON.stringify(Timetable.validateState({...Timetable.defaultState(),startDate:'2026-11-02',totalWeeks:4,courses})));
 });
 await page.reload();
 const before=await page.evaluate(()=>localStorage.getItem('ytu-timetable-v1'));
 await expect(page.locator('.course-card.conflict')).toHaveCount(2);
 await expect(page.locator('#conflictNotice summary')).toContainText('1 组时间冲突');
 await expect(page.locator('#conflictNotice .conflict-link')).toBeHidden();
 await page.locator('#conflictNotice summary').click();
 await expect(page.locator('#conflictNotice .conflict-link')).toContainText('本周甲 与 本周乙');
 await page.locator('#conflictNotice summary').click();
 const active=page.locator('.course-card').filter({hasText:'本周甲'});
 await expect(active.locator('.overlap-badge')).toHaveText('+2');
 await page.screenshot({path:'test-results/overlap-grid-320.png'});
 await active.click();
 await page.screenshot({path:'test-results/overlap-list-320.png'});
 await expect(page.locator('#overlapList .list-card')).toHaveCount(4);
 await expect(page.locator('#overlapList')).toContainText('其他周跨节教室');
 await expect(page.locator('#overlapList')).toContainText('2 周上课');
 await page.locator('#overlapList .list-card').filter({hasText:'其他周同一'}).click();
 await expect(page.locator('#courseDetail')).toContainText('第 1 周不上课');
 await page.locator('#courseDialog .close-dialog').click();
 await page.locator('#overlapDialog .close-dialog').click();
 const partial=page.locator('.other-week-marker').filter({hasText:'其他周 1 门'});
 await expect(partial).toHaveCount(1);
 await partial.click();
 await expect(page.locator('#overlapList')).toContainText('其他周跨节');
 await page.locator('#overlapDialog .close-dialog').click();
 const grey=page.locator('.course-card.inactive.has-overlaps');
 await expect(grey).toHaveCount(1);
 await grey.click();
 await expect(page.locator('#overlapList .list-card')).toHaveCount(2);
 await page.locator('#overlapDialog .close-dialog').click();
 await expect(page.locator('.course-card.inactive').filter({hasText:'孤立课程'})).toHaveCount(1);
 expect(await page.evaluate(()=>localStorage.getItem('ytu-timetable-v1'))).toBe(before);
 await page.locator('#toggleInactive').click();
 await expect(page.locator('.overlap-badge, .other-week-marker')).toHaveCount(0);
 await expect(page.locator('.course-card.conflict')).toHaveCount(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('同一时段的两门本周冲突课程保持可读、可分别查看',async({page})=>{
 await page.setViewportSize({width:320,height:700});
 await page.clock.setFixedTime(new Date('2026-11-02T08:42:00+08:00'));
 await page.goto('/');
 await page.evaluate(()=>{
  const courses=['甲冲突课程','乙冲突课程'].map((name,index)=>Timetable.validateCourse({id:String(index),name,day:1,start:1,end:2,weeks:[1],room:'A101'}));
  localStorage.setItem('ytu-timetable-v1',JSON.stringify(Timetable.validateState({...Timetable.defaultState(),startDate:'2026-11-02',courses})));
 });
 await page.reload();
 const cards=page.locator('.course-card.conflict');await expect(cards).toHaveCount(2);
 const first=await cards.nth(0).boundingBox(),second=await cards.nth(1).boundingBox();
 expect(first.width).toBeGreaterThan(30);expect(second.width).toBe(first.width);
 expect(first.y+first.height).toBeLessThanOrEqual(second.y+1);
 await cards.nth(1).click();await expect(page.locator('#courseDetail .course-conflicts')).toContainText('甲冲突课程');
});

test('课程和重叠列表打开时不使用触摸高亮或透明入场，键盘焦点仍可见',async({page})=>{
 await fixture(page);await page.emulateMedia({reducedMotion:'no-preference'});
 const normal=page.locator('.course-card.inactive').first();
 expect(await normal.evaluate(n=>getComputedStyle(n).webkitTapHighlightColor)).toBe('rgba(0, 0, 0, 0)');
 await page.keyboard.press('Tab');await normal.focus();
 expect(await normal.evaluate(n=>getComputedStyle(n).outlineStyle)).toBe('solid');
 await page.keyboard.press('Enter');await expect(page.locator('#courseDialog')).toBeVisible();
 expect(await page.locator('#courseDialog').evaluate(n=>getComputedStyle(n).animationName)).toBe('editor-slide-in');
 await page.locator('#courseDialog .close-dialog').click();
 const overlap=page.locator('.course-card.has-overlaps').first();
 await overlap.click();await expect(page.locator('#overlapDialog')).toBeVisible();
 expect(await page.locator('#overlapDialog').evaluate(n=>getComputedStyle(n).animationName)).toBe('editor-slide-in');
 const row=page.locator('#overlapList .list-card').first();
 expect(await row.evaluate(n=>getComputedStyle(n).webkitTapHighlightColor)).toBe('rgba(0, 0, 0, 0)');
 await row.click();await expect(page.locator('#courseDialog')).toBeVisible();
 await page.evaluate(()=>document.body.classList.add('has-wallpaper'));
 expect(await page.locator('#courseDialog').evaluate(n=>getComputedStyle(n).backgroundColor)).toBe('rgb(255, 255, 255)');
});

test('首页周次位置对比图使用相同模拟课表',async({page})=>{
 await page.setViewportSize({width:393,height:852});await fixture(page);
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.screenshot({path:'test-results/week-position-current.png'});
 await page.evaluate(()=>{
  const shell=document.querySelector('.shell'), week=document.querySelector('.week-card');
  shell.insertBefore(week,document.querySelector('.masthead'));
  week.style.marginBottom='8px';
 });
 await page.screenshot({path:'test-results/week-position-top.png'});
});

test('密集课表切换周次后每门课程都能从网格或重叠列表找到',async({page})=>{
 await page.goto('/');
 await page.evaluate(()=>{
  const courses=Array.from({length:42},(_,index)=>{
   const start=1+(index*3%9),id=String(index+1).padStart(2,'0');
   const weeks=Array.from({length:8},(_,week)=>week+1).filter(week=>(week+index)%3!==0);
   return Timetable.validateCourse({id:'course-'+id,name:'模拟课'+id,day:1+(index%5),start,end:Math.min(start+1+(index%3===0?1:0),12),weeks,room:'模拟教室'+id});
  });
  localStorage.setItem('ytu-timetable-v1',JSON.stringify(Timetable.validateState({...Timetable.defaultState(),startDate:'2026-11-02',totalWeeks:8,courses})));
 });
 await page.reload();
 const original=await page.evaluate(()=>localStorage.getItem('ytu-timetable-v1'));
 for(const week of [1,2,3,8]){
  await page.locator('#weekSelect').selectOption(String(week));
  const result=await page.evaluate(()=>{
   const stored=JSON.parse(localStorage.getItem('ytu-timetable-v1'));
   const target=Array.from(document.querySelectorAll('#scheduleGrid .course-card'));
   const found=new Set(),current=[];
   for(const card of target){
    const name=card.querySelector('strong').textContent;found.add(name);
    if(!card.classList.contains('inactive'))current.push(name);
    if(card.classList.contains('has-overlaps')){
     card.click();
     document.querySelectorAll('#overlapList .list-card strong').forEach(node=>found.add(node.textContent));
     document.querySelector('#overlapDialog').close();
    }
   }
   for(const marker of document.querySelectorAll('#scheduleGrid .other-week-marker')){
    marker.click();
    document.querySelectorAll('#overlapList .list-card strong').forEach(node=>found.add(node.textContent));
    document.querySelector('#overlapDialog').close();
   }
   const week=Number(document.querySelector('#weekSelect').value);
   return {all:stored.courses.map(course=>course.name).sort(),found:[...found].sort(),active:stored.courses.filter(course=>course.weeks.includes(week)).map(course=>course.name).sort(),current:current.sort()};
  });
  expect(result.found).toEqual(result.all);
  expect(result.current).toEqual(result.active);
 }
 expect(await page.evaluate(()=>localStorage.getItem('ytu-timetable-v1'))).toBe(original);
});
