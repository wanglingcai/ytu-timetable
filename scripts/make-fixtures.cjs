const fs=require('node:fs');
const path=require('node:path');
const XLSX=require('../app/src/main/assets/vendor/xlsx.full.min.js');
XLSX.set_fs(fs);
const out=path.resolve(__dirname,'../examples');fs.mkdirSync(out,{recursive:true});
const rows=[['课程名称','星期','节次','周次','教师','教室'],
  ['示例计算机网络','星期二','1-2','1-17','示例教师','六教306'],
  ['示例单周课程','星期四','1-2','1-18单周','示例教师','六教306'],
  ['示例上机课程','星期一','5-6','8-15','示例教师','网络实验室'],
  ['示例指定周讲座','星期六','1-2','第3周','示例教师','五教305'],
  ['示例离散周课程','星期五','7-8','1,3,8-10','示例教师','实验室2']];
const sheet=XLSX.utils.aoa_to_sheet(rows),book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'课程清单');
XLSX.writeFile(book,path.join(out,'课程清单模板.xlsx'));
fs.writeFileSync(path.join(out,'课程清单模板.csv'),'\uFEFF'+XLSX.utils.sheet_to_csv(sheet),'utf8');
const grid=[['模拟 URP 课表（非学校原始文件）'],['节次/时间','星期一','星期二','星期三','星期四','星期五','星期六','星期日']];
const times=[['08:00','08:45'],['08:55','09:40'],['10:00','10:45'],['10:55','11:40'],['14:00','14:45'],['14:55','15:40'],['16:00','16:45'],['16:55','17:40'],['19:00','19:45'],['19:55','20:40']];
times.forEach((t,i)=>grid.push(['第'+(i+1)+'小节('+t.join('-')+')','','','','','','','']));
grid[2][2]='模拟计算机网络_03\n示例教师*\n1-17周\n1-2节\n本校区六教306';
grid[2][4]='模拟单周课程_03\n示例教师*\n1-18周单周\n1-2节\n本校区六教306';
grid[2][6]='模拟指定周讲座_40\n示例教师*\n第3周\n1-2节\n本校区五教305';
grid[6][1]='模拟上机课程_03\n示例教师*\n8-15周\n5-6节\n本校区网络实验室';
grid[10][4]='模拟项目管理上机_01\n示例教师*\n9-16周\n9-10节\n本校区物联网实验室';
const gs=XLSX.utils.aoa_to_sheet(grid);gs['!merges']=[{s:{r:2,c:2},e:{r:3,c:2}},{s:{r:2,c:4},e:{r:3,c:4}},{s:{r:2,c:6},e:{r:3,c:6}},{s:{r:6,c:1},e:{r:7,c:1}},{s:{r:10,c:4},e:{r:11,c:4}}];
const gb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(gb,gs,'模拟URP网格');
XLSX.writeFile(gb,path.join(out,'模拟URP网格.xlsx'));XLSX.writeFile(gb,path.join(out,'模拟URP网格.xls'),{bookType:'biff8'});
fs.writeFileSync(path.join(out,'模拟URP网格.html'),XLSX.utils.sheet_to_html(gs),'utf8');
console.log('已生成 CSV/XLSX 模板与模拟 URP 的 XLSX/XLS/HTML；均非学校真实导出文件。');
