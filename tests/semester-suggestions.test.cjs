const { test } = require('node:test');
const assert = require('node:assert/strict');
const T = require('../app/src/main/assets/core.js');
const XLSX = require('../app/src/main/assets/vendor/xlsx.full.min.js');
test('有明确标签的学期日期和当天教学周能计算第一周周一', () => {
  assert.deepEqual(T.inferSemester('学期开始日期：2026年9月1日'), {startDate:'2026-08-31',source:'来源明确的学期开始日期'});
  assert.deepEqual(T.inferSemester('当前日期：2026-10-31 当前教学周：第9周', new Date(2026,9,31,12)), {startDate:'2026-08-31',source:'页面当前日期和当前教学周'});
  assert.deepEqual(T.inferSemester('当前日期：2026-10-30 当前教学周：第9周', new Date(2026,9,31,12)), {});
  assert.deepEqual(T.inferSemester('当前周次：9', new Date(2026,9,31,12)), {});
  assert.deepEqual(T.inferSemester('第一周周一：2026-09-01'), {conflict:true});
  assert.deepEqual(T.inferSemester('第一周周一：2026-08-31 第一周周一：2026-09-07'), {conflict:true});
  assert.deepEqual(T.inferSemester('2026-08-31 第1周 1-18周'), {});
});
test('CSV 与保存的 HTML 能提取明确日期，课程数据仍按常规解析', () => {
  const csv='第一周周一,2026-08-31\n课程名称,星期,节次,周次,教师,教室\n数学,星期一,1-2,1-16,张老师,A101';
  const result=T.readImport(Buffer.from(csv),'course.csv',XLSX);
  assert.equal(result.semester.startDate,'2026-08-31'); assert.equal(result.courses.length,1);
  const html='<h2>学期开始日期：2026-09-01</h2><table><tr><th>课程名称</th><th>星期</th><th>节次</th><th>周次</th></tr><tr><td>数学</td><td>星期一</td><td>1-2</td><td>1-16</td></tr></table>';
  const parsed=T.readImport(Buffer.from(html),'course.html',XLSX);
  assert.equal(parsed.semester.startDate,'2026-08-31'); assert.equal(parsed.courses.length,1);
});
