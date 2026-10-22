'use strict';
(() => {
  const T=window.Timetable, $=id=>document.getElementById(id);
  const DAY=['','星期一','星期二','星期三','星期四','星期五','星期六','星期日'];
  const KEY='ytu-timetable-v1', MAX_BYTES=12*1024*1024;
  let state=T.defaultState(), week=1, listMode=false, preview=null, editId=null, editKind='course', repeatMode='single', toastTimer, toastTask, storageProblem=false, dialogStack=[], renderedDate='';
  const el=(tag,className,value)=> {const n=document.createElement(tag);if(className)n.className=className;if(value!==undefined)n.textContent=value;return n;};
  const append=(parent,...children)=>{children.forEach(c=>parent.append(c));return parent;};
  const courseTitle=course=>course.kind==='personal'?course.name:(course.name.replace(/_\d+$/,'')||course.name);
  const motionPreference=window.matchMedia('(prefers-reduced-motion: reduce)');
  let entranceAnimations=[];
  function animateEntrance() {
    entranceAnimations.forEach(animation=>animation.cancel());entranceAnimations=[];
    if(motionPreference.matches)return;
    const enter=(node,delay)=>{
      if(!node||node.hidden||!node.animate||!node.getClientRects().length)return;
      entranceAnimations.push(node.animate([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],
        {duration:250,delay,easing:'cubic-bezier(0.22, 1, 0.36, 1)',fill:'backwards'}));
    };
    enter($('nextCard'),0);enter(document.querySelector('.week-card'),30);
    const view=listMode?$('listView'):$('gridView');enter(view,60);
    view.querySelectorAll(listMode?'.list-card':'.course-card').forEach(card=>enter(card,90+(Number(card.dataset.day)-1)*30));
  }
  const stopMotion=()=>{if(motionPreference.matches){entranceAnimations.forEach(animation=>animation.cancel());entranceAnimations=[];}};
  if(motionPreference.addEventListener)motionPreference.addEventListener('change',stopMotion);else motionPreference.addListener(stopMotion);
  function toast(message) {
    const t=$('toast');t.textContent=message;clearTimeout(toastTask);clearTimeout(toastTimer);
    toastTask=setTimeout(()=>{const open=dialogStack.filter(d=>d.open),host=open[open.length-1];t.classList.toggle('in-dialog',!!host);if(host)host.querySelector('.dialog-head').after(t);else document.body.append(t);t.hidden=false;toastTimer=setTimeout(()=>t.hidden=true,3500);},0);
  }
  window.receiveNativeError=payload=>toast(payload.message||'操作失败，请重试');
  function showDialog(id) {const d=$(id);if(!d.open){dialogStack=dialogStack.filter(x=>x.open);d.showModal();dialogStack.push(d);d.scrollTop=0;$('toast').hidden=true;}}
  function closeDialog(id) {$(id).close();}
  function closeAll() {document.querySelectorAll('dialog[open]').forEach(d=>d.close());}
  window.handleAndroidBack=()=> {const dialogs=dialogStack.filter(d=>d.open);if(!dialogs.length)return false;dialogs[dialogs.length-1].close();return true;};
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
      state=next;storageProblem=false;week=Math.min(week,state.totalWeeks);render();refreshReminderStatus();if(message)toast(message);return true;
    } catch(error) {toast(error.message||'保存失败');return false;}
  }
  function activeCourses(){return T.coursesInWeek(state.courses,week);}
  function render() {
    renderedDate=T.dateString(new Date());
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
    const hasCourses=state.courses.length>0;$('emptyState').hidden=hasCourses;$('scheduleSection').hidden=!hasCourses;$('backupButton').disabled=!hasCourses;$('allButton').disabled=!hasCourses;
    if(!hasCourses){updateTimeCues();return;}
    const active=activeCourses(), conflicts=T.findConflicts(active), displayed=T.coursesForWeekView(state.courses,week);
    $('scheduleHeading').textContent=(week===current?'本周安排':'第 '+week+' 周安排')+' · '+active.length+' 项';
    $('inactiveCount').textContent='非本周 '+(displayed.length-active.length)+' 项';
    $('conflictNotice').hidden=!conflicts.length;
    $('conflictNotice').textContent='有 '+conflicts.length+' 组课程或安排时间重叠，均已保留。请点击“切换列表”逐一核对。';
    $('noWeekCourses').hidden=active.length>0;
    $('noWeekLabel').textContent=displayed.length?'这一周没有安排，灰色卡片可查看其他周课程。':'这一周还没有安排，点空白格试试。';
    $('gridView').hidden=listMode;$('listView').hidden=!listMode;
    $('viewToggle').textContent=listMode?'切换周视图':'切换列表';
    renderGrid(displayed,dates,conflicts);renderList(displayed,dates);
    updateTimeCues();
  }
  function updateTimeCues() {
    const now=new Date(),next=T.nextOccurrence(state,now),card=$('nextCard');
    card.hidden=!state.courses.length;card.disabled=!next;card.onclick=null;
    $('nextLabel').textContent=next&&next.ongoing?'此刻':'接下来';
    $('nextName').textContent=next?courseTitle(next.course):'暂时没有新安排';
    $('nextMeta').textContent='点课表空白格，留一点时间给自己';$('nextCountdown').textContent='';
    if(next) {
      const today=T.dateString(now),tomorrow=new Date(now);tomorrow.setDate(tomorrow.getDate()+1);
      const day=next.date===today?'今天':next.date===T.dateString(tomorrow)?'明天':(next.start.getFullYear()===now.getFullYear()?next.date.slice(5):next.date).replace(/-/g,'/')+' '+DAY[next.course.day];
      const minutes=Math.max(1,Math.ceil((next.start-now)/60000));
      const calendarDays=Math.round((T.parseDate(next.date)-T.parseDate(today))/86400000);
      $('nextCountdown').textContent=next.ongoing?(next.course.kind==='personal'?'正在进行':'正在上课'):minutes<60?'还有 '+minutes+' 分钟':minutes<1440?'还有 '+Math.floor(minutes/60)+' 小时'+(minutes%60?' '+minutes%60+' 分':''):calendarDays+' 天后';
      $('nextMeta').textContent=day+' '+state.times[next.course.start-1][0]+'–'+state.times[next.course.end-1][1]+' · '+(next.course.room||'地点待定');
      card.onclick=()=>window.openReminder({id:next.course.id,date:next.date});
      card.setAttribute('aria-label',$('nextLabel').textContent+'，'+next.course.name+'，'+$('nextCountdown').textContent+'，'+$('nextMeta').textContent+'，查看详情');
    } else card.removeAttribute('aria-label');
    const grid=$('scheduleGrid');grid.querySelectorAll('.current-time').forEach(n=>n.remove());
    if(!$('scheduleSection').hidden&&!listMode) {
      const day=T.weekDates(state.startDate,week).indexOf(T.dateString(now)),position=T.timePosition(state.times,now);
      if(day>=0&&position) {
        const line=el('div','current-time');line.style.gridColumn=day+2;line.style.gridRow=position.section+2;line.style.marginTop='calc(var(--row-size) * '+position.fraction+')';
        line.setAttribute('role','img');line.setAttribute('aria-label','当前时间 '+String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0'));grid.append(line);
      }
    }
  }
  function renderGrid(active,dates,conflicts) {
    const grid=$('scheduleGrid');grid.replaceChildren();grid.style.setProperty('--sections',state.times.length);
    const today=T.dateString(new Date());
    for(let d=0;d<=7;d++) {const head=el('div','day-head'+(d&&dates[d-1]===today?' today':''));head.style.gridColumn=d+1;head.style.gridRow=1;head.append(el('span','',d?['一','二','三','四','五','六','日'][d-1]:'节次'));if(d)head.append(el('span','date',dates[d-1].slice(5).replace('-','/')));grid.append(head);}
    const todayIndex=dates.indexOf(today);
    if(todayIndex>=0){const highlight=el('div','today-column-highlight');highlight.style.gridColumn=todayIndex+2;highlight.setAttribute('aria-hidden','true');grid.append(highlight);}
    for(let i=1;i<=state.times.length;i++) {
      const label=el('div','time-label');label.style.gridColumn=1;label.style.gridRow=i+1;append(label,el('b','',i),el('span','',state.times[i-1][0]),el('span','',state.times[i-1][1]));grid.append(label);
      for(let d=1;d<=7;d++) {
        const occupied=active.some(c=>c.day===d&&c.start<=i&&c.end>=i);
        const slot=el(occupied?'div':'button','grid-slot'+(occupied?'':' empty-slot')+(dates[d-1]===today?' today-column':''));
        slot.style.gridColumn=d+1;slot.style.gridRow=i+1;
        if(!occupied){slot.type='button';slot.dataset.day=d;slot.dataset.section=i;slot.setAttribute('aria-label','添加个人安排，'+DAY[d]+'第'+i+'节，第'+week+'周');slot.onclick=()=>openEdit(null,{day:d,start:i,end:i});}
        grid.append(slot);
      }
    }
    // Assign overlapping courses to separate lanes; all remain clickable.
    const positions=T.layoutCourses(active),stacks=new Map();
    for(const c of active) {
      const position=positions.get(c.id),{lane:index,count}=position;
      const inactive=!c.isActive;
      const card=el('button','course-card palette-'+T.coursePalette(c)+(inactive?' inactive':'')+(conflicts.some(x=>x.a===c.id||x.b===c.id)?' conflict':''));
      if(c.start===c.end)card.classList.add('single-section');
      card.type='button';card.setAttribute('aria-label',(inactive?'非本周，':'本周上课，')+c.name+'，'+DAY[c.day]+'第'+c.start+'-'+c.end+'节，'+c.room);
      card.dataset.day=c.day;
      card.title=c.name+' · '+(c.room||'地点待定');
      if(c.kind==='personal'){card.classList.add('personal-entry');card.setAttribute('aria-label','个人安排，'+c.name+'，'+DAY[c.day]+'第'+c.start+'-'+c.end+'节');}
      card.style.gridColumn=c.day+1;card.style.gridRow=(c.start+1)+' / '+(c.end+2);
      if(count>1){card.style.width='calc('+(100/count)+'% - 2px)';card.style.marginLeft='calc('+(100*index/count)+'% + 1px)';}
      if(inactive)card.append(el('span','course-status','非本周'));
      else if(c.kind==='personal')card.append(el('span','course-status','个人'));
      append(card,el('strong','',courseTitle(c)),el('small','',c.room||'地点待定'));
      card.addEventListener('click',()=>detail(c.id));
      if(position.stackKey) {
        let host=stacks.get(position.stackKey);
        if(!host){host=el('div','course-stack');host.style.gridColumn=c.day+1;host.style.gridRow=(c.start+1)+' / '+(c.end+2);stacks.set(position.stackKey,host);grid.append(host);}
        card.classList.add('stacked');card.style.top=(position.stackOffset*100)+'%';card.style.height='calc('+(position.stackSize*100)+'% - 3px)';host.append(card);
      } else grid.append(card);
    }
    fitCourseCards();
  }
  function fitCourseCards() {
    const measurements=Array.from($('scheduleGrid').querySelectorAll('.course-card'),card=>{
      if(!card.clientHeight)return null;
      const title=card.querySelector('strong'),room=card.querySelector('small'),status=card.querySelector('.course-status');
      const css=getComputedStyle(card),line=parseFloat(getComputedStyle(title).lineHeight),roomHeight=parseFloat(getComputedStyle(room).lineHeight),statusHeight=status?parseFloat(getComputedStyle(status).lineHeight):0,gap=parseFloat(css.gap)||4;
      const available=card.clientHeight-parseFloat(css.paddingTop)-parseFloat(css.paddingBottom);
      let showStatus=!!status,showRoom=true;
      if(available<line+roomHeight+gap+(status?statusHeight+gap:0))showStatus=false;
      if(available<line+roomHeight+gap)showRoom=false;
      const reserved=(showStatus?statusHeight+gap:0)+(showRoom?roomHeight+gap:0);
      return {card,title,room,status,showRoom,showStatus,lines:Math.min(3,Math.max(1,Math.floor((available-reserved+.1)/line))),hideTitle:available<line};
    });
    measurements.filter(Boolean).forEach(item=>{item.card.style.setProperty('--title-lines',item.lines);item.room.hidden=!item.showRoom;if(item.status)item.status.hidden=!item.showStatus;item.title.style.visibility=item.hideTitle?'hidden':'';});
  }
  function courseRow(c,withWeeks=false) {
    const inactive=!c.weeks.includes(week);
    const button=el('button','list-card'+(inactive?' inactive':''));button.type='button';
    button.dataset.day=c.day;
    const chip=el('span','time-chip palette-'+T.coursePalette(c)+(inactive?' inactive':''),c.start+'–'+c.end+' 节');
    const info=el('span','course-info');append(info,el('strong','',c.name),el('p','',[DAY[c.day],c.room||'地点待定',c.teacher].filter(Boolean).join(' · ')));
    if(c.kind==='personal')info.append(el('p','course-status','个人安排 · '+T.formatWeeks(c.weeks)+' 周'));
    if(inactive)info.append(el('p','course-status','非本周 · '+T.formatWeeks(c.weeks)+(c.kind==='personal'?' 周安排':' 周上课')));
    else if(withWeeks&&c.kind!=='personal')info.append(el('p','',T.formatWeeks(c.weeks)+' 周'));
    append(button,chip,info,el('span','arrow','›'));button.addEventListener('click',()=>detail(c.id));return button;
  }
  function renderList(active,dates) {
    const list=$('listView');list.replaceChildren();
    for(let day=1;day<=7;day++){const courses=active.filter(c=>c.day===day);if(!courses.length)continue;const group=el('div','day-list');group.append(el('h3','',DAY[day]+' · '+dates[day-1]));courses.forEach(c=>group.append(courseRow(c)));list.append(group);}
  }
  function detail(id) {
    const c=state.courses.find(x=>x.id===id);if(!c)return;
    const personal=c.kind==='personal';$('courseDialogTitle').textContent=personal?'安排详情':'课程详情';
    const host=$('courseDetail');host.replaceChildren();host.append(el('h3','detail-name',c.name));
    const rows=[['所选周','第 '+week+' 周'+(c.weeks.includes(week)?'上课':'不上课（非本周）')],['星期',DAY[c.day]],['节次','第 '+c.start+'–'+c.end+' 节'],['时间',state.times[c.start-1][0]+'–'+state.times[c.end-1][1]],['周次',T.formatWeeks(c.weeks)+' 周'],['地点',c.room||'尚未填写'],['教师',c.teacher||'尚未填写']];
    if(personal){rows[0]=['所选周','第 '+week+' 周'+(c.weeks.includes(week)?'有安排':'无安排')];rows.pop();if(c.weeks.length===1)rows.unshift(['日期',T.weekDates(state.startDate,c.weeks[0])[c.day-1]]);rows.push(['备注',c.notes||'尚未填写']);}
    rows.push(['提醒',reminderLabel(personal?(c.reminderMinutes===undefined?-1:c.reminderMinutes):state.reminders.courseMinutes)]);
    for(const [key,value] of rows)host.append(append(el('div','detail-row'),el('span','',key),el('span','',value)));
    const actions=el('div','detail-actions'), edit=el('button','button primary',personal?'修改安排':'修改课程'), del=el('button','button danger',personal?'删除安排':'删除课程');
    edit.onclick=()=>{closeDialog('courseDialog');openEdit(c);};
    del.onclick=()=>{if(!confirm(personal?'确定删除「'+c.name+'」及其设定的全部周次安排？':'确定删除「'+c.name+'」的这一条上课安排？'))return;if(persist({...state,courses:state.courses.filter(x=>x.id!==id)},personal?'安排已删除':'课程已删除')){closeDialog('courseDialog');renderAll();}};
    append(actions,edit,del);host.append(actions);showDialog('courseDialog');
  }
  function openEdit(c,slot) {
    editId=c?c.id:null;editKind=((c&&c.kind==='personal')||slot)?'personal':'course';
    const personal=editKind==='personal';
    $('editTitle').textContent=personal?(c?'修改安排':'添加个人安排'):(c?'修改课程':'添加课程');
    $('entryNameLabel').textContent=personal?'安排名称':'课程名称';$('entryRoomLabel').textContent=personal?'地点':'教室';
    $('courseTeacherField').hidden=personal;$('notesField').hidden=!personal;
    $('personalReminderField').hidden=!personal;$('personalReminder').value=c&&c.reminderMinutes!==undefined?String(c.reminderMinutes):'-1';
    $('entryWeeksLabel').textContent=personal?'安排周次':'上课周次';$('saveCourse').textContent=personal?'保存安排':'保存课程';
    $('editHint').textContent=personal?'默认只安排在所选的第 '+week+' 周。可以修改节次，或填写连续周、单双周，让安排重复出现。':'支持连续周、单双周和离散周次。超出学期或节次设置时会提示。';
    $('courseName').value=c?c.name:'';$('courseTeacher').value=c?c.teacher:'';$('courseRoom').value=c?c.room:'';
    $('entryNotes').value=c?c.notes||'':'';
    $('notesDetails').open=personal&&!!$('entryNotes').value;
    $('courseDay').value=c?c.day:slot?slot.day:1;$('courseSections').value=c?c.start+'-'+c.end:slot?slot.start+(slot.end!==slot.start?'-'+slot.end:''):'';$('courseWeeks').value=c?T.formatWeeks(c.weeks):personal?String(week):'1-'+state.totalWeeks;
    const weeks=c?c.weeks:personal?[week]:Array.from({length:state.totalWeeks},(_,i)=>i+1);
    selectRepeat(weeks.length===1&&weeks[0]===week?'single':weeks.length===state.totalWeeks?'weekly':'custom',false);
    showDialog('editDialog');
  }
  function selectRepeat(mode,apply=true) {
    repeatMode=mode;
    if(apply&&mode!=='custom')$('courseWeeks').value=mode==='single'?String(week):'1-'+state.totalWeeks;
    $('customWeeksField').hidden=mode!=='custom';
    [['repeatOnce','single'],['repeatWeekly','weekly'],['repeatCustom','custom']].forEach(([id,value])=>$(id).setAttribute('aria-pressed',String(mode===value)));
    updateEditContext();
  }
  function updateEditContext() {
    try {
      const day=Number($('courseDay').value),sections=T.parseSections($('courseSections').value),weeks=T.parseWeeks($('courseWeeks').value);
      const date=weeks.length===1?T.weekDates(state.startDate,weeks[0])[day-1]:null;
      $('editContext').textContent=(date?date.slice(5).replace('-','月')+'日 '+DAY[day]:repeatMode==='weekly'?'每周'+DAY[day]:DAY[day]+' · 第 '+T.formatWeeks(weeks)+' 周')+(sections?' · 第 '+sections.start+(sections.end===sections.start?'':'–'+sections.end)+' 节':'');
      $('editHint').textContent=editKind==='personal'?'个人安排仅在设定周次显示，提醒可独立设置。':'课程按设定周次显示；提醒时间使用设置中的课程提醒。';
    }catch(error){$('editContext').textContent='选择星期、节次与周次，安排你的时间';}
  }
  function renderAll() {const host=$('allList');host.replaceChildren();[...state.courses].sort((a,b)=>a.day-b.day||a.start-b.start).forEach(c=>host.append(courseRow(c,true)));if(!state.courses.length)host.append(el('p','small','还没有课程。'));}
  function openAll(){renderAll();showDialog('allDialog');}
  function openSettings() {
    $('semesterInput').value=state.semester;$('startInput').value=state.startDate;$('weeksInput').value=state.totalWeeks;$('courseReminder').value=String(state.reminders.courseMinutes);refreshReminderStatus();renderTimes(state.times);showDialog('settingsDialog');
  }
  function reminderLabel(minutes){return minutes<0?'关闭':minutes===0?'准点提醒':'提前 '+minutes+' 分钟';}
  function refreshReminderStatus() {
    let message='提醒在安卓应用中生效；浏览器仅保存设置。',needsPermission=false;
    const native=window.AndroidLocal&&typeof AndroidLocal.reminderStatus==='function';
    if(native) {
      try {
        const status=JSON.parse(AndroidLocal.reminderStatus());
        needsPermission=!status.notifications||!status.exact;
        message=!status.notifications?'通知未开启，当前无法发送提醒。':!status.exact?'通知已开启；准时提醒权限未开启，系统可能延迟发送。':'通知和准时提醒权限已开启。';
        if(status.nextAt)message+=' 下一次提醒：'+new Date(status.nextAt).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})+'。';
        else if(status.notifications)message+=' 暂无未来提醒；已过提醒时间的安排不补发。';
        if(status.problem)message+=' '+status.problem;
        $('exactReminderPermission').hidden=status.exact;
        $('notificationPermission').textContent=status.notifications?'通知声音与振动设置':'开启通知';
      }catch(error){message='无法读取提醒状态，请重新打开应用检查。';needsPermission=true;}
    }
    $('reminderStatus').textContent=message;$('notificationPermission').hidden=!native;
    if(!native)$('exactReminderPermission').hidden=true;
    $('reminderPermissionHint').hidden=!(needsPermission&&state.courses.some(c=>c.kind==='personal'?(c.reminderMinutes!==undefined&&c.reminderMinutes>=0):state.reminders.courseMinutes>=0));
  }
  window.refreshReminderStatus=refreshReminderStatus;
  window.openReminder=payload=>{
    const c=state.courses.find(c=>c.id===payload.id);
    if(!c){toast('这条课程或安排已被删除或替换。');return;}
    let occurrenceWeek;
    try {
      const date=T.parseDate(payload.date);occurrenceWeek=T.currentWeek(state.startDate,date);
      if(!c.weeks.includes(occurrenceWeek)||T.weekDates(state.startDate,occurrenceWeek)[c.day-1]!==payload.date)throw new Error();
    }catch(error){toast('这条安排的日期已改变，请查看最新课表。');return;}
    closeAll();week=occurrenceWeek;render();detail(c.id);
  };
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
    closeDialog('importChoice');
    if(window.AndroidLocal && typeof AndroidLocal.importPortal==='function')AndroidLocal.importPortal();
    else toast('官网登录导入需要在安卓应用中使用；浏览器预览可导入已保存的 HTML 课表。');
  };
  window.receivePortalImport=payload=>{
    try {
      if(!payload || payload.source!=='ytu-urp' || !Array.isArray(payload.rows) || payload.rows.length>100 || payload.rows.some(row=>!Array.isArray(row)||row.length>32))throw new Error('教务课表数据结构无效');
      preview=T.parseMatrix(payload.rows,payload.merges||[],'烟台大学教务系统');
      if(!preview.courses.length)throw new Error('已读取到 '+(Number(payload.cardCount)||0)+' 个课程卡片，但未能解析上课安排（COURSE_PARSE）。原课表未修改。'+preview.warnings.slice(0,2).join(' '));
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
    $('importHint').textContent=preview.restore?'保存将用备份替换全部课程、个人安排和学期设置，请先备份当前数据。':'保存会替换学校课程；第一周日期相同则保留个人安排。换学期时会确认移除原学期安排。请核对日期和节次时间。';
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
    const personal=preview.restore?[]:state.courses.filter(c=>c.kind==='personal');
    const sameSemester=$('importStart').value===state.startDate;
    if(personal.length&&!sameSemester&&!confirm('学期第一周日期已改变。继续将替换课表，并移除 '+personal.length+' 条原学期的个人安排。建议先取消并导出备份。确定继续？'))return;
    const next={...base,semester:$('importSemester').value,startDate:$('importStart').value,totalWeeks:Number($('importWeeks').value),courses:[...preview.courses,...(sameSemester?personal:[])],times,sourceName:preview.name};
    if(persist(next,'课表已保存，之后可直接离线查看')){week=Math.max(1,Math.min(state.totalWeeks,T.currentWeek(state.startDate)));render();closeDialog('importDialog');preview=null;}
  }
  function sample() {
    const rows=[['课程名称','星期','节次','周次','教师','教室'],['示例 · 计算机网络','星期二','1-2','1-17','示例教师','六教 306'],['示例 · 软件设计','星期二','3-4','1-17','示例教师','四教 301'],['示例 · Web 技术','星期五','5-6','1-17','示例教师','实验室 2'],['示例 · 项目管理','星期四','3-4','1-18单周','示例教师','三教 316'],['示例 · 上机实践','星期一','5-6','8-15','示例教师','网络实验室'],['示例 · 指定周讲座','星期六','1-2','第3周','示例教师','五教 305']];
    preview={...T.parseMatrix(rows),name:'体验示例（非本人真实课表）'};showPreview();$('importSemester').value='体验示例 · 请导入真实课表';
  }
  $('fileInput').addEventListener('change',async event=>{const file=event.target.files[0];event.target.value='';if(!file)return;if(file.size>MAX_BYTES){toast('文件不能超过 12 MB');return;}receiveBytes(file.name,new Uint8Array(await file.arrayBuffer()));});
  ['importButton','emptyImport'].forEach(id=>$(id).onclick=()=>showDialog('importChoice'));
  $('fileImport').onclick=()=>{closeDialog('importChoice');chooseFile();};
  $('settingsButton').onclick=openSettings;$('sampleButton').onclick=sample;
  $('reminderSettingsButton').onclick=openSettings;
  $('notificationPermission').onclick=()=>AndroidLocal.reminderPermission('notifications');
  $('exactReminderPermission').onclick=()=>AndroidLocal.reminderPermission('exact');
  function goWeek(value){week=Math.max(1,Math.min(state.totalWeeks,value));render();animateEntrance();}
  $('prevWeek').onclick=()=>{if(week>1)goWeek(week-1);};$('nextWeek').onclick=()=>{if(week<state.totalWeeks)goWeek(week+1);};
  $('weekSelect').onchange=event=>goWeek(Number(event.target.value));
  $('todayButton').onclick=()=>goWeek(T.currentWeek(state.startDate));
  $('viewToggle').onclick=()=>{listMode=!listMode;render();};
  $('allButton').onclick=openAll;$('allCoursesButton').onclick=openAll;$('addCourseButton').onclick=()=>{closeDialog('addChoice');openEdit();};$('backupButton').onclick=backup;
  $('addButton').onclick=()=>showDialog('addChoice');
  $('addPersonalButton').onclick=()=>{closeDialog('addChoice');openEdit(null,{day:1,start:1,end:1});};
  $('repeatOnce').onclick=()=>selectRepeat('single');$('repeatWeekly').onclick=()=>selectRepeat('weekly');$('repeatCustom').onclick=()=>selectRepeat('custom');
  ['courseDay','courseSections','courseWeeks'].forEach(id=>$(id).addEventListener('input',updateEditContext));
  document.querySelectorAll('.close-dialog').forEach(button=>button.onclick=()=>button.closest('dialog').close());
  $('cancelImport').onclick=()=>closeDialog('importDialog');$('cancelEdit').onclick=()=>closeDialog('editDialog');$('saveImport').onclick=importSave;
  $('settingsForm').onsubmit=event=>{event.preventDefault();if(persist({...state,semester:$('semesterInput').value,startDate:$('startInput').value,totalWeeks:Number($('weeksInput').value),times:readTimes(),reminders:{courseMinutes:Number($('courseReminder').value)}},'设置已保存'))closeDialog('settingsDialog');};
  $('addTimeButton').onclick=()=>{const times=readTimes();if(times.length>=16){toast('最多支持 16 节');return;}const last=times[times.length-1],start=(Number(last[1].slice(0,2))*60+Number(last[1].slice(3))+10),end=start+45;if(end>=1440){toast('末节时间已接近午夜，请先调整时间');return;}const hm=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');renderTimes([...times,[hm(start),hm(end)]]);};
  $('removeTimeButton').onclick=()=>{const times=readTimes();if(times.length<=1){toast('至少保留一节');return;}if(state.courses.some(c=>c.end>=times.length)){toast('末节仍有课程，不能删除');return;}renderTimes(times.slice(0,-1));};
  $('clearButton').onclick=()=>{if(!confirm('确定清空本机课表？建议先取消并导出备份。此操作无法撤销。'))return;if(persist({...state,courses:[],sourceName:''},'课表已清空'))closeAll();};
  $('courseForm').onsubmit=event=>{event.preventDefault();try{const sections=T.parseSections($('courseSections').value);if(!sections)throw new Error('节次格式应为 1-2 或 3');const previous=state.courses.find(c=>c.id===editId);const c=T.validateCourse({id:editId||T.uid(),name:$('courseName').value,teacher:$('courseTeacher').value,room:$('courseRoom').value,day:Number($('courseDay').value),...sections,weeks:T.parseWeeks($('courseWeeks').value),color:previous?previous.color:state.courses.length%8,...(editKind==='personal'?{kind:'personal',notes:$('entryNotes').value,reminderMinutes:Number($('personalReminder').value)}:{})});const courses=editId?state.courses.map(x=>x.id===editId?c:x):[...state.courses,c];if(persist({...state,courses},editKind==='personal'?'个人安排已保存':'课程已保存')){closeDialog('editDialog');renderAll();}}catch(error){toast(error.message);}};
  // Keep date/week labels current when returning from background or crossing midnight.
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){render();refreshReminderStatus();}});
  function sizeViewport(){document.documentElement.style.setProperty('--visual-height',Math.floor(window.visualViewport?window.visualViewport.height:window.innerHeight)+'px');}
  window.addEventListener('resize',sizeViewport);if(window.visualViewport)window.visualViewport.addEventListener('resize',sizeViewport);sizeViewport();
  if(window.ResizeObserver)new ResizeObserver(fitCourseCards).observe($('scheduleGrid'));else window.addEventListener('resize',fitCourseCards);
  load();render();animateEntrance();refreshReminderStatus();
  setInterval(()=>{if(!document.hidden){if(renderedDate!==T.dateString(new Date()))render();else updateTimeCues();}},30000);
})();
