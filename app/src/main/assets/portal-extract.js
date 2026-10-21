/* Read only the rendered URP timetable. No cookies, inputs or page scripts are read. */
(() => {
  'use strict';
  const table=document.getElementById('courseTable');
  if(!table)return JSON.stringify({error:'尚未找到课表。请先登录并进入「选课结果」，等待课程加载后再读取。'});
  if(table.rows.length>100)return JSON.stringify({error:'课表行数异常，请使用文件导入。'});
  const rows=[],merges=[];
  let cards=0;
  for(let r=0;r<table.rows.length;r++) {
    rows[r] ||= [];
    let c=0;
    for(const cell of table.rows[r].cells) {
      while(rows[r][c]!==undefined)c++;
      const rs=cell.rowSpan||1,cs=cell.colSpan||1;
      if(r+rs>100||c+cs>32)return JSON.stringify({error:'课表合并单元格异常，请使用文件导入。'});
      const blocks=Array.from(cell.querySelectorAll('.class_div'));
      cards+=blocks.length;
      const value=blocks.length ? blocks.map(block=>Array.from(block.querySelectorAll('p')).map(p=>p.textContent.trim()).filter(Boolean).join('\n')).join('\n\n') : cell.innerText.trim();
      if(value.length>16000)return JSON.stringify({error:'课表单元格过长，请使用文件导入。'});
      rows[r][c]=value;
      if(rs>1||cs>1) {
        merges.push({s:{r,c},e:{r:r+rs-1,c:c+cs-1}});
        for(let y=r;y<r+rs;y++)for(let x=c;x<c+cs;x++){rows[y] ||= [];if(y!==r||x!==c)rows[y][x]='';}
      }
      c+=cs;
    }
  }
  if(!cards)return JSON.stringify({error:'页面尚无课程卡片，可能仍在加载或该学期未排课。原课表保持不变。'});
  const heading=document.getElementById('h4_id1')?.textContent||'';
  const missing=heading.match(/(\d+)门课程未显示/);
  const warnings=missing&&Number(missing[1])>0 ? ['官网提示有 '+missing[1]+' 门课程未在网格显示，本次只读取网格内有明确时间的安排，请另行核对。'] : [];
  return JSON.stringify({source:'ytu-urp',rows,merges,warnings,cardCount:cards});
})()
