'use strict';
(() => {
  const T=window.Timetable, $=id=>document.getElementById(id);
  const DAY=['','星期一','星期二','星期三','星期四','星期五','星期六','星期日'];
  const KEY='ytu-timetable-v1', MAX_BYTES=12*1024*1024;
  let state=T.defaultState(), week=1, listMode=false, preview=null, editId=null, toastTimer, storageProblem=false;
  const el=(tag,className,value)=> {const n=document.createElement(tag);if(className)n.className=className;if(value!==undefined)n.textContent=value;return n;};
  const append=(parent,...children)=>{children.forEach(c=>parent.append(c));return parent;};
  function toast(message) {const t=$('toast');t.textContent=message;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.hidden=true,6000);}
  window.receiveNativeError=payload=>toast(payload.message||'操作失败，请重试');
  function showDialog(id) {const d=$(id);if(!d.open)d.showModal();}
  function closeDialog(id) {$(id).close();}
  function closeAll() {document.querySelectorAll('dialog[open]').forEach(d=>d.close());}
  window.handleAndroidBack=()=> {const dialogs=Array.from(document.querySelectorAll('dialog[open]'));if(!dialogs.length)return false;dialogs.at(-1).close();return true;};
  function load() {
    try {
      const json=window.AndroidLocal ? AndroidLocal.readState() : localStorage.getItem(KEY);
      if(json)state=T.validateState(JSON.parse(json));
    } catch(error) {storageProblem=true;setTimeout(()=>toast('本机数据读取失败，尚未覆盖。可重新导入备份恢复。'),50);}
    week=Math.max(1,Math.min(state.totalWeeks,T.currentWeek(state.startDate)));
  }
  function persist(raw,message) {
    try {
      const next=T.validateState({...raw,savedAt:new Date().toISOString()});
      const json=JSON.stringify(next);
      if(window.AndroidLocal) {if(!AndroidLocal.saveState(json))throw new Error('手机存储写入失败，请先导出备份并检查剩余空间');}
      else {localStorage.setItem(KEY,json);if(localStorage.getItem(KEY)!==json)throw new Error('浏览器无法保存数据');}
      state=next;storageProblem=false;week=Math.min(week,state.totalWeeks);render();if(message)toast(message);return true;
    } catch(error) {toast(error.message||'保存失败');return false;}
  }
  function activeCourses(){return T.coursesInWeek(state.courses,week);}
  function render() {
    $('semesterLabel').textContent=state.semester;
    $('saveLabel').textContent=storageProblem?'本机数据读取失败，请从备份恢复':state.savedAt ? '已保存 · '+new Date(state.savedAt).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}) : '不加载广告 · 不需要登录';
    $('weekSelect').replaceChildren();
    const current=T.currentWeek(state.startDate);
    for(let w=1;w<=state.totalWeeks;w++){const opt=el('option','', '第 '+w+' 周');opt.value=w;opt.selected=w===week;$('weekSelect').append(opt);}
    const dates=T.weekDates(state.startDate,week);
    $('weekRange').textContent=(week===current?'本周 · ':'')+dates[0].slice(5).replace('-','.')+' — '+dates[6].slice(5).replace('-','.');
    $('prevWeek').disabled=week<=1;$('nextWeek').disabled=week>=state.totalWeeks;
    const notice=$('semesterNotice');notice.hidden=current>=1&&current<=state.totalWeeks;
    notice.textContent=current<1?'学期还未开始。当前展示第 '+week+' 周，可在设置里核对第一周日期。':'已超出学期范围。当前展示第 '+week+' 周，可切换周次或在设置中调整学期。';
    const hasCourses=state.courses.length>0;$('emptyState').hidden=hasCourses;$('scheduleSection').hidden=!hasCourses;
    if(!hasCourses)return;
    const active=activeCourses(), conflicts=T.findConflicts(active), displayed=T.coursesForWeekView(state.courses,week);
    $('scheduleHeading').textContent='本周安排 · '+active.length+' 项';
    $('inactiveCount').textContent='非本周 '+(displayed.length-active.length)+' 项';
    $('conflictNotice').hidden=!conflicts.length;
    $('conflictNotice').textContent='有 '+conflicts.length+' 组课程时间重叠，均已保留。请点击“切换列表”逐一核对。';
    $('noWeekCourses').hidden=active.length>0;
    $('gridView').hidden=listMode;$('listView').hidden=!listMode;
    $('viewToggle').textContent=listMode?'切换周视图':'切换列表';
    renderGrid(displayed,dates,conflicts);renderList(displayed,dates);
  }
  function renderGrid(active,dates,conflicts) {
    const grid=$('scheduleGrid');grid.replaceChildren();grid.style.setProperty('--sections',state.times.length);
    const today=T.dateString(new Date());
    for(let d=0;d<=7;d++) {const head=el('div','day-head'+(d&&dates[d-1]===today?' today':''));head.style.gridColumn=d+1;head.style.gridRow=1;head.append(el('span','',d?['一','二','三','四','五','六','日'][d-1]:'节次'));if(d)head.append(el('span','date',dates[d-1].slice(5).replace('-','/')));grid.append(head);}
    for(let i=1;i<=state.times.length;i++) {
      const label=el('div','time-label');label.style.gridColumn=1;label.style.gridRow=i+1;append(label,el('b','',i),el('span','',state.times[i-1][0]),el('span','',state.times[i-1][1]));grid.append(label);
      for(let d=1;d<=7;d++){const slot=el('div','grid-slot');slot.style.gridColumn=d+1;slot.style.gridRow=i+1;grid.append(slot);}
    }
    // Assign overlapping courses to separate lanes; all remain clickable.
    const positions=T.layoutCourses(active),stacks=new Map();
    for(const c of active) {
      const position=positions.get(c.id),{lane:index,count}=position;
      const inactive=!c.isActive;
      const card=el('button','course-card palette-'+c.color+(inactive?' inactive':'')+(conflicts.some(x=>x.a===c.id||x.b===c.id)?' conflict':''));
      card.type='button';card.setAttribute('aria-label',(inactive?'非本周，':'本周上课，')+c.name+'，'+DAY[c.day]+'第'+c.start+'-'+c.end+'节，'+c.room);
      card.style.gridColumn=c.day+1;card.style.gridRow=(c.start+1)+' / '+(c.end+2);
      if(count>1){card.style.width='calc('+(100/count)+'% - 2px)';card.style.marginLeft='calc('+(100*index/count)+'% + 1px)';}
      if(inactive)card.append(el('span','course-status','非本周'));
      append(card,el('strong','',c.name),el('small','',c.room||'地点待定'));
      card.addEventListener('click',()=>detail(c.id));
      if(position.stackKey) {
        let host=stacks.get(position.stackKey);
        if(!host){host=el('div','course-stack');host.style.gridColumn=c.day+1;host.style.gridRow=(c.start+1)+' / '+(c.end+2);stacks.set(position.stackKey,host);grid.append(host);}
        card.classList.add('stacked');card.style.top=(position.stackOffset*100)+'%';card.style.height='calc('+(position.stackSize*100)+'% - 3px)';host.append(card);
      } else grid.append(card);
    }
  }
  function courseRow(c,withWeeks=false) {
    const inactive=!c.weeks.includes(week);
    const button=el('button','list-card'+(inactive?' inactive':''));button.type='button';
    const chip=el('span','time-chip palette-'+c.color+(inactive?' inactive':''),c.start+'–'+c.end+' 节');
    const info=el('span','course-info');append(info,el('strong','',c.name),el('p','',[DAY[c.day],c.room||'地点待定',c.teacher].filter(Boolean).join(' · ')));
    if(inactive)info.append(el('p','course-status','非本周 · '+T.formatWeeks(c.weeks)+' 周上课'));
    else if(withWeeks)info.append(el('p','',T.formatWeeks(c.weeks)+' 周'));
    append(button,chip,info,el('span','arrow','›'));button.addEventListener('click',()=>detail(c.id));return button;
  }
  function renderList(active,dates) {
    const list=$('listView');list.replaceChildren();
    for(let day=1;day<=7;day++){const courses=active.filter(c=>c.day===day);if(!courses.length)continue;const group=el('div','day-list');group.append(el('h3','',DAY[day]+' · '+dates[day-1]));courses.forEach(c=>group.append(courseRow(c)));list.append(group);}
  }
  function detail(id) {
    const c=state.courses.find(x=>x.id===id);if(!c)return;
    const host=$('courseDetail');host.replaceChildren();host.append(el('h3','detail-name',c.name));
    const rows=[['所选周','第 '+week+' 周'+(c.weeks.includes(week)?'上课':'不上课（非本周）')],['星期',DAY[c.day]],['节次','第 '+c.start+'–'+c.end+' 节'],['时间',state.times[c.start-1][0]+'–'+state.times[c.end-1][1]],['周次',T.formatWeeks(c.weeks)+' 周'],['地点',c.room||'尚未填写'],['教师',c.teacher||'尚未填写']];
    for(const [key,value] of rows)host.append(append(el('div','detail-row'),el('span','',key),el('span','',value)));
    const actions=el('div','detail-actions'), edit=el('button','button primary','修改课程'), del=el('button','button danger','删除课程');
    edit.onclick=()=>{closeDialog('courseDialog');openEdit(c);};
    del.onclick=()=>{if(!confirm('确定删除「'+c.name+'」的这一条上课安排？'))return;if(persist({...state,courses:state.courses.filter(x=>x.id!==id)},'课程已删除')){closeDialog('courseDialog');renderAll();}};
    append(actions,edit,del);host.append(actions);showDialog('courseDialog');
  }
  function openEdit(c) {
    editId=c?c.id:null;$('editTitle').textContent=c?'修改课程':'添加课程';
    $('courseName').value=c?c.name:'';$('courseTeacher').value=c?c.teacher:'';$('courseRoom').value=c?c.room:'';
    $('courseDay').value=c?c.day:1;$('courseSections').value=c?c.start+'-'+c.end:'';$('courseWeeks').value=c?T.formatWeeks(c.weeks):'1-'+state.totalWeeks;
    showDialog('editDialog');
  }
  function renderAll() {const host=$('allList');host.replaceChildren();[...state.courses].sort((a,b)=>a.day-b.day||a.start-b.start).forEach(c=>host.append(courseRow(c,true)));if(!state.courses.length)host.append(el('p','small','还没有课程。'));}
  function openAll(){renderAll();showDialog('allDialog');}
  function openSettings() {
    $('semesterInput').value=state.semester;$('startInput').value=state.startDate;$('weeksInput').value=state.totalWeeks;renderTimes(state.times);showDialog('settingsDialog');
  }
  function renderTimes(times) {
    $('timeInputs').replaceChildren();
    times.forEach((pair,i)=>{const row=el('div','time-row');row.append(el('span','','第 '+(i+1)+' 节'));pair.forEach((time,j)=>{if(j)row.append(el('span','','—'));const input=el('input');input.type='time';input.required=true;input.value=time;input.setAttribute('aria-label','第'+(i+1)+'节'+(j?'结束':'开始')+'时间');row.append(input);});$('timeInputs').append(row);});
  }
  function readTimes(){return Array.from($('timeInputs').children,row=>Array.from(row.querySelectorAll('input'),i=>i.value));}
  function backup() {
    const json=JSON.stringify(state,null,2);
    if(window.AndroidLocal)AndroidLocal.exportBackup(json);
    else {const a=el('a');const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));a.href=url;a.download='下节啥课-备份.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  }
  function chooseFile(){if(window.AndroidLocal)AndroidLocal.importFile();else $('fileInput').click();}
  $('portalImport').onclick=()=>{
    if(window.AndroidLocal && typeof AndroidLocal.importPortal==='function')AndroidLocal.importPortal();
    else toast('官网登录导入需要在安卓应用中使用；浏览器预览可导入已保存的 HTML 课表。');
  };
  window.receivePortalImport=payload=>{
    try {
      if(!payload || payload.source!=='ytu-urp' || !Array.isArray(payload.rows) || payload.rows.length>100 || payload.rows.some(row=>!Array.isArray(row)||row.length>32))throw new Error('教务课表数据结构无效');
      preview=T.parseMatrix(payload.rows,payload.merges||[],'烟台大学教务系统');
      if(!preview.courses.length)throw new Error('没有读取到有效课程，原课表未修改。请确认已进入选课结果并等待课程加载。');
      if(Array.isArray(payload.warnings))preview.warnings.push(...payload.warnings.filter(x=>typeof x==='string').slice(0,20).map(x=>x.slice(0,2000)));
      preview.name='烟台大学教务系统';preview.format='官网登录读取（测试）';
      showPreview();
    }catch(error){preview=null;toast(error.message||'教务课表读取失败，原课表未修改');}
  };
  async function receiveBytes(name,bytes) {
    if(bytes.length>MAX_BYTES){toast('文件不能超过 12 MB');return;}
    toast('正在本机解析课表…');
    await new Promise(resolve=>setTimeout(resolve,30));
    try {
      preview=T.readImport(bytes,name,XLSX);
      preview.name=name;
      showPreview();
    } catch(error) {preview=null;toast(error.message||'未能解析文件，请检查文件格式');}
  }
  window.receiveImport=payload=>{try{const raw=atob(payload.data),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));receiveBytes(payload.name,bytes);}catch(error){toast('导入文件读取失败');}};
  function showPreview() {
    const conflicts=T.findConflicts(preview.courses);
    if(conflicts.length)preview.warnings.push('存在 '+conflicts.length+' 组时间重叠；所有课程均保留，导入后可切换列表核对。');
    $('importFileName').textContent=preview.name+' · '+preview.format;
    $('importSummary').replaceChildren();
    const maxWeek=Math.max(...preview.courses.flatMap(c=>c.weeks));
    for(const [value,label] of [[preview.courses.length,'上课安排'],[new Set(preview.courses.map(c=>c.name)).size,'课程名称'],[maxWeek,'最大周次']])$('importSummary').append(append(el('div','summary-box'),el('b','',value),el('span','',label)));
    $('importWarnings').hidden=!preview.warnings.length;$('importWarnings').textContent=preview.warnings.slice(0,60).join('\n')+(preview.warnings.length>60?'\n还有 '+(preview.warnings.length-60)+' 条提示，请核对原文件。':'');
    const base=preview.restore||state;
    $('importSemester').value=preview.restore?base.semester:state.courses.length?state.semester:preview.name.replace(/\.[^.]+$/,'');
    $('importStart').value=base.startDate;$('importWeeks').value=Math.max(base.totalWeeks,maxWeek);$('reviewCheck').checked=false;
    const list=$('previewList');list.replaceChildren();
    preview.courses.forEach(c=>{const row=el('div','list-card'),info=el('div','course-info');append(info,el('strong','',c.name),el('p','',DAY[c.day]+' · 第 '+c.start+'–'+c.end+' 节 · '+(c.room||'地点待定')),el('p','',T.formatWeeks(c.weeks)+' 周'+(c.teacher?' · '+c.teacher:'')));row.append(info);list.append(row);});
    $('toast').hidden=true;showDialog('importDialog');
  }
  function importSave() {
    if(!preview)return;
    if(!$('reviewCheck').checked){toast('请先核对课程，并勾选确认后保存');return;}
    const base=preview.restore||state;
    let times=base.times.map(x=>x.slice());
    const maxSection=Math.max(...preview.courses.map(c=>c.end));
    if(maxSection>times.length){toast('导入课程含第 '+maxSection+' 节，请先取消导入，在学期设置中补全节次时间');return;}
    const next={...base,semester:$('importSemester').value,startDate:$('importStart').value,totalWeeks:Number($('importWeeks').value),courses:preview.courses,times,sourceName:preview.name};
    if(persist(next,'课表已保存，之后可直接离线查看')){week=Math.max(1,Math.min(state.totalWeeks,T.currentWeek(state.startDate)));render();closeDialog('importDialog');preview=null;}
  }
  function sample() {
    const rows=[['课程名称','星期','节次','周次','教师','教室'],['示例 · 计算机网络','星期二','1-2','1-17','示例教师','六教 306'],['示例 · 软件设计','星期二','3-4','1-17','示例教师','四教 301'],['示例 · Web 技术','星期五','5-6','1-17','示例教师','实验室 2'],['示例 · 项目管理','星期四','3-4','1-18单周','示例教师','三教 316'],['示例 · 上机实践','星期一','5-6','8-15','示例教师','网络实验室'],['示例 · 指定周讲座','星期六','1-2','第3周','示例教师','五教 305']];
    preview={...T.parseMatrix(rows),name:'体验示例（非本人真实课表）'};showPreview();$('importSemester').value='体验示例 · 请导入真实课表';
  }
  $('fileInput').addEventListener('change',async event=>{const file=event.target.files[0];event.target.value='';if(!file)return;if(file.size>MAX_BYTES){toast('文件不能超过 12 MB');return;}receiveBytes(file.name,new Uint8Array(await file.arrayBuffer()));});
  ['importButton','emptyImport'].forEach(id=>$(id).onclick=chooseFile);
  $('settingsButton').onclick=openSettings;$('sampleButton').onclick=sample;
  $('prevWeek').onclick=()=>{if(week>1){week--;render();}};$('nextWeek').onclick=()=>{if(week<state.totalWeeks){week++;render();}};
  $('weekSelect').onchange=event=>{week=Number(event.target.value);render();};
  $('todayButton').onclick=()=>{week=Math.max(1,Math.min(state.totalWeeks,T.currentWeek(state.startDate)));render();};
  $('viewToggle').onclick=()=>{listMode=!listMode;render();};
  $('allButton').onclick=openAll;$('allCoursesButton').onclick=openAll;$('addCourseButton').onclick=()=>openEdit();$('backupButton').onclick=backup;
  document.querySelectorAll('.close-dialog').forEach(button=>button.onclick=()=>button.closest('dialog').close());
  $('cancelImport').onclick=()=>closeDialog('importDialog');$('cancelEdit').onclick=()=>closeDialog('editDialog');$('saveImport').onclick=importSave;
  $('settingsForm').onsubmit=event=>{event.preventDefault();if(persist({...state,semester:$('semesterInput').value,startDate:$('startInput').value,totalWeeks:Number($('weeksInput').value),times:readTimes()},'设置已保存'))closeDialog('settingsDialog');};
  $('addTimeButton').onclick=()=>{const times=readTimes();if(times.length>=16){toast('最多支持 16 节');return;}const last=times.at(-1),start=(Number(last[1].slice(0,2))*60+Number(last[1].slice(3))+10),end=start+45;if(end>=1440){toast('末节时间已接近午夜，请先调整时间');return;}const hm=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');renderTimes([...times,[hm(start),hm(end)]]);};
  $('removeTimeButton').onclick=()=>{const times=readTimes();if(times.length<=1){toast('至少保留一节');return;}if(state.courses.some(c=>c.end>=times.length)){toast('末节仍有课程，不能删除');return;}renderTimes(times.slice(0,-1));};
  $('clearButton').onclick=()=>{if(!confirm('确定清空本机课表？建议先取消并导出备份。此操作无法撤销。'))return;if(persist({...state,courses:[],sourceName:''},'课表已清空'))closeAll();};
  $('courseForm').onsubmit=event=>{event.preventDefault();try{const sections=T.parseSections($('courseSections').value);if(!sections)throw new Error('节次格式应为 1-2 或 3');const previous=state.courses.find(c=>c.id===editId);const c=T.validateCourse({id:editId||T.uid(),name:$('courseName').value,teacher:$('courseTeacher').value,room:$('courseRoom').value,day:Number($('courseDay').value),...sections,weeks:T.parseWeeks($('courseWeeks').value),color:previous?previous.color:state.courses.length%8});const courses=editId?state.courses.map(x=>x.id===editId?c:x):[...state.courses,c];if(persist({...state,courses},'课程已保存')){closeDialog('editDialog');renderAll();}}catch(error){toast(error.message);}};
  // Keep date/week labels current when returning from background or crossing midnight.
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});
  load();render();
})();
