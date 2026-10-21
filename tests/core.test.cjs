const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const T=require('../app/src/main/assets/core.js');
const XLSX=require('../app/src/main/assets/vendor/xlsx.full.min.js');
const makeCourse=overrides=>T.validateCourse({name:'测试课程',teacher:'',room:'',day:2,start:1,end:2,weeks:[1,2,3],...overrides});

test('周次覆盖连续、单双、指定、离散、中英文标点',()=>{
  assert.deepEqual(T.parseWeeks('1-18周单周'),[1,3,5,7,9,11,13,15,17]);
  assert.deepEqual(T.parseWeeks('第 2–10 周（双周）'),[2,4,6,8,10]);
  assert.deepEqual(T.parseWeeks('第3周'),[3]);
  assert.deepEqual(T.parseWeeks('1，3、8至10周'),[1,3,8,9,10]);
  assert.deepEqual(T.parseWeeks('1-5(单)周'),[1,3,5]);
  assert.equal(T.formatWeeks([1,3,8,9,10]),'1,3,8-10');
});
test('错误周次不能被默默变成整学期',()=>{
  for(const s of ['','0-18','18-1','1-61','单周','1-18周单双周','第3周和第5周','abc'])assert.throws(()=>T.parseWeeks(s),s);
});
test('节次与星期解析',()=>{
  assert.deepEqual(T.parseSections('第1小节(08:00-08:45)'),{start:1,end:1});
  assert.deepEqual(T.parseSections('9-10节'),{start:9,end:10});
  assert.equal(T.parseSections('17-18节'),null);
  assert.equal(T.parseDay('星期日'),7);assert.equal(T.parseDay('周三'),3);assert.equal(T.parseDay('Wednesday'),3);
});
test('URP 单元格保留实际周次、教师和地点',()=>{
  const warnings=[];
  const courses=T.parseCell('计算机网络_03\n崔老师*\n1-18周单周\n1-2节\n本校区六教306',4,null,'单元格',warnings);
  assert.equal(courses.length,1);assert.equal(courses[0].name,'计算机网络_03');assert.equal(courses[0].teacher,'崔老师');assert.equal(courses[0].room,'本校区六教306');assert.equal(courses[0].day,4);assert.equal(courses[0].weeks.length,9);assert.deepEqual(warnings,[]);
});
test('URP 一个单元格包含多门不同时周课程，不能丢第二门',()=>{
  const warnings=[];
  const cell='课程甲\n教师甲*\n1-8周\n1-2节\n教室甲\n\n课程乙\n教师乙*\n9-16周\n1-2节\n教室乙';
  const courses=T.parseCell(cell,1,null,'A1',warnings);
  assert.equal(courses.length,2);assert.equal(courses[1].name,'课程乙');assert.equal(courses[1].teacher,'教师乙');assert.equal(courses[1].room,'教室乙');assert.deepEqual(courses[1].weeks,[9,10,11,12,13,14,15,16]);
});
test('课程清单按表头解析，异常行明确报告，重复去重',()=>{
  const rows=[['个人课程'],['课程名称','星期','节次','周次','教师','教室'],['数据结构','星期二','3-4','1-16','张老师','A301'],['数据结构','星期二','3-4','1-16','张老师','A301'],['未知','星期三','5-6','','','']];
  const result=T.parseMatrix(rows);assert.equal(result.courses.length,1);assert.equal(result.warnings.length,2);assert.match(result.warnings[0],/未导入/);assert.match(result.warnings[1],/重复/);
});
test('课程清单支持开始/结束节、开始/结束周、单双周列',()=>{
  const result=T.parseMatrix([['课程名称','星期','开始节次','结束节次','开始周','结束周','单双周'],['测试','2',1,2,1,18,'双周']]);
  assert.equal(result.courses.length,1);assert.deepEqual(result.courses[0].weeks,[2,4,6,8,10,12,14,16,18]);
});
test('网格合并单元格只读取一次，并用行高确定节次',()=>{
  const rows=[['节次','星期一','星期二','星期三'],['第1节','课程甲\n教师甲*\n1-16周\n教室甲','',''],['第2节','','','']];
  const result=T.parseMatrix(rows,[{s:{r:1,c:1},e:{r:2,c:1}}]);
  assert.equal(result.courses.length,1);assert.equal(result.courses[0].end,2);assert.equal(result.courses[0].room,'教室甲');
});
test('XLSX、二进制 XLS、HTML、CSV 实际文件读取与解析',()=>{
  for(const filename of ['模拟URP网格.xlsx','模拟URP网格.xls','模拟URP网格.html','课程清单模板.xlsx','课程清单模板.csv']) {
    const bytes=fs.readFileSync(path.join(__dirname,'../examples',filename));
    const result=T.readImport(bytes,filename,XLSX);
    assert.equal(result.courses.length,5,filename);assert.equal(result.warnings.length,0,filename+': '+result.warnings.join(';'));
    const odd=result.courses.find(c=>c.name.includes('单周'));assert.ok(odd);assert.equal(odd.weeks.length,9);
    const only=result.courses.find(c=>c.name.includes('讲座'));assert.deepEqual(only.weeks,[3]);
  }
});
test('周次切换按每门课程的实际周次过滤',()=>{
  const courses=[makeCourse({name:'单周',weeks:[1,3,5]}),makeCourse({name:'双周',weeks:[2,4,6]}),makeCourse({name:'短期',weeks:[8,9,10]})];
  assert.deepEqual(T.coursesInWeek(courses,2).map(c=>c.name),['双周']);assert.deepEqual(T.coursesInWeek(courses,9).map(c=>c.name),['短期']);
});

test('URP 官网保存页只读课表网格，段落区分课程和多位教师并提示未显示课程',()=>{
  const bytes=fs.readFileSync(path.join(__dirname,'../examples/模拟URP官网.html'));
  const result=T.readImport(bytes,'选课结果.html',XLSX);
  assert.equal(result.courses.length,2);
  assert.equal(result.courses[0].name,'模拟课程甲_01');
  assert.equal(result.courses[0].teacher,'教师甲 教师乙');
  assert.deepEqual(result.courses[0].weeks,[1,3,5,7]);
  assert.deepEqual(result.courses[1].weeks,[10,12,14,16]);
  assert.equal(result.courses[1].day,2);assert.equal(result.courses[1].room,'模拟楼202');
  assert.equal(result.warnings.length,1);assert.match(result.warnings[0],/1 门课程未在网格显示/);
  assert.ok(result.courses.every(c=>!JSON.stringify(c).includes('fake-password')));
});
test('学期日期、学期外周次和跨年计算',()=>{
  assert.equal(T.currentWeek('2026-08-31',new Date(2026,9,20)),8);
  assert.equal(T.currentWeek('2026-08-31',new Date(2026,7,30)),0);
  assert.equal(T.currentWeek('2026-12-28',new Date(2027,0,4)),2);
  assert.deepEqual(T.weekDates('2026-12-28',1),['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']);
  assert.throws(()=>T.parseDate('2026-02-30'));
});
test('重叠节次但不重叠周次不算冲突，实际冲突全部报告',()=>{
  const a=makeCourse({weeks:[1,3]}),b=makeCourse({weeks:[2,4]}),c=makeCourse({weeks:[3],start:2,end:3});
  const conflicts=T.findConflicts([a,b,c]);assert.equal(conflicts.length,1);assert.deepEqual(conflicts[0].weeks,[3]);
});
test('备份往返保留周次、作息及学期设置，拒绝错误/超界数据',()=>{
  const original={...T.defaultState(new Date(2026,9,20)),semester:'秋季',startDate:'2026-08-31',courses:[makeCourse()]};
  const restored=T.validateState(JSON.parse(JSON.stringify(original)));assert.deepEqual(restored,original);
  assert.throws(()=>T.validateState({...original,schemaVersion:2}));
  assert.throws(()=>T.validateState({...original,startDate:'2026-09-01'}));
  assert.throws(()=>T.validateState({...original,totalWeeks:2}));
  assert.throws(()=>T.validateState({...original,times:[['08:45','08:00']]}));
  assert.throws(()=>T.validateState({...original,times:[['08:00','08:45'],['08:30','09:00']]}));
});
test('相邻冲突链课程不会互相遮住，三门连续交叠使用稳定的两列',()=>{
  const a=makeCourse({start:1,end:2}),b=makeCourse({start:2,end:3}),c=makeCourse({start:3,end:4}),d=makeCourse({start:5,end:6});
  const positions=T.layoutCourses([a,b,c,d]);
  assert.equal(positions.get(a.id).count,2);assert.equal(positions.get(b.id).count,2);assert.equal(positions.get(c.id).count,2);
  assert.notEqual(positions.get(a.id).lane,positions.get(b.id).lane);assert.notEqual(positions.get(b.id).lane,positions.get(c.id).lane);assert.equal(positions.get(d.id).count,1);
});
test('工作表实际范围从第 4 行开始时仍正确对应合并单元格',()=>{
  const sheet=XLSX.utils.aoa_to_sheet([['节次','星期一','星期二','星期三'],['第1节','偏移课程\n教师*\n1-16周\n地点','',''],['第2节','','','']],{origin:'A4'});
  sheet['!merges']=[{s:{r:4,c:1},e:{r:5,c:1}}];
  const result=T.parseWorkbook({SheetNames:['课表'],Sheets:{课表:sheet}},XLSX);
  assert.equal(result.courses.length,1);assert.equal(result.courses[0].end,2);
});
test('周视图保留所有安排并标注非本周，不修改持久化课程或实际周次',()=>{
  const courses=[makeCourse({name:'单周',weeks:[1,3,5]}),makeCourse({name:'双周',weeks:[2,4,6]}),makeCourse({name:'短期',weeks:[8,9]})];
  const original=JSON.stringify(courses),view=T.coursesForWeekView(courses,2);
  assert.equal(view.length,3);assert.equal(view.filter(c=>c.isActive).length,1);assert.equal(view[0].name,'双周');
  assert.equal(T.coursesInWeek(courses,2).length,1);assert.equal(JSON.stringify(courses),original);
  assert.deepEqual(T.coursesForWeekView(courses,20).map(c=>c.isActive),[false,false,false]);
});
test('同一时段的单双周课程上下显示，本周课程在前且不触发虚假冲突',()=>{
  const inactive=makeCourse({id:'a',weeks:[1,3]}),active=makeCourse({id:'z',weeks:[2,4]});
  const view=T.coursesForWeekView([inactive,active],2),positions=T.layoutCourses(view);
  const a=positions.get(active.id),b=positions.get(inactive.id);
  assert.equal(a.stackKey,b.stackKey);assert.equal(a.stackOffset,0);assert.equal(b.stackOffset,a.stackSize);
  assert.ok(a.stackSize>b.stackSize);assert.equal(a.stackSize+b.stackSize,1);assert.equal(T.findConflicts([inactive,active]).length,0);
});
