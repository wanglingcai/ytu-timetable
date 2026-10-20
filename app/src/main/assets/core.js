/* Pure timetable parsing and calendar logic, shared by Android UI and Node tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Timetable = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MAX_WEEKS = 60, MAX_COURSES = 1000, MAX_SECTIONS = 16;
  const DEFAULT_TIMES = [
    ['08:00','08:45'], ['08:55','09:40'], ['10:00','10:45'], ['10:55','11:40'],
    ['14:00','14:45'], ['14:55','15:40'], ['16:00','16:45'], ['16:55','17:40'],
    ['19:00','19:45'], ['19:55','20:40'], ['21:00','21:45'], ['21:55','22:40']
  ];
  const text = x => String(x == null ? '' : x).replace(/\u00a0/g, ' ').replace(/\r/g, '').trim();
  const normalized = x => text(x).replace(/[（]/g,'(').replace(/[）]/g,')').replace(/[，、]/g,',').replace(/[～~—–－至]/g,'-');
  const uid = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2,9);

  function parseWeeks(value) {
    let s = normalized(value).replace(/\s+/g,'');
    const odd = /单/.test(s), even = /双/.test(s);
    if (odd && even) throw new Error('同一课程同时包含单周和双周，请分开填写');
    s = s.replace(/第|周|单|双|\(|\)|星期/g, '');
    if (!/^\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/.test(s)) throw new Error('周次请填写 1-17、1-18单周 或 1,3,8-10');
    const weeks = new Set();
    for (const item of s.split(',')) {
      const [from, to = from] = item.split('-').map(Number);
      if (from < 1 || to > MAX_WEEKS || from > to) throw new Error('周次范围必须为 1–60，且起始周不能大于结束周');
      for (let w = from; w <= to; w++) if ((!odd || w % 2 === 1) && (!even || w % 2 === 0)) weeks.add(w);
    }
    if (!weeks.size) throw new Error('周次筛选后没有上课周');
    return Array.from(weeks).sort((a,b) => a-b);
  }

  function formatWeeks(weeks) {
    if (!weeks || !weeks.length) return '';
    const list = Array.from(new Set(weeks)).sort((a,b) => a-b);
    const ranges = []; let start = list[0], end = start;
    for (let i=1;i<=list.length;i++) {
      if (list[i] === end + 1) end = list[i];
      else { ranges.push(start === end ? ''+start : start+'-'+end); start = end = list[i]; }
    }
    return ranges.join(',');
  }

  function parseDay(value) {
    const s = text(value).replace(/\s/g,'');
    if (/^[1-7]$/.test(s)) return +s;
    const m = s.match(/(?:星期|周|礼拜)([一二三四五六日天1-7])/);
    if (m) return /\d/.test(m[1]) ? +m[1] : ({一:1,二:2,三:3,四:4,五:5,六:6,日:7,天:7})[m[1]];
    const en = ['mon','tue','wed','thu','fri','sat','sun'].findIndex(d => s.toLowerCase().startsWith(d));
    return en >= 0 ? en + 1 : 0;
  }

  function parseSections(value) {
    const s = normalized(value).replace(/\s+/g,'');
    const m = s.match(/(?:第)?(\d{1,2})(?:-(\d{1,2}))?(?:小)?节/)
      || s.match(/^(\d{1,2})(?:-(\d{1,2}))?$/);
    if (!m) return null;
    const start = +m[1], end = +(m[2] || m[1]);
    if (start < 1 || end > MAX_SECTIONS || start > end) return null;
    return { start, end };
  }

  function weekMatches(value) {
    const s = normalized(value).replace(/(\d)\s*\((单|双)(?:周)?\)\s*周/g, '$1周$2');
    return Array.from(s.matchAll(/(?:第\s*)?\d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*\s*周(?:\s*\(?[单双](?:周)?\)?)?/g));
  }

  function validateCourse(raw, index = 0) {
    const name = text(raw.name), teacher = text(raw.teacher), room = text(raw.room);
    const day = Number(raw.day), start = Number(raw.start), end = Number(raw.end);
    let weeks = raw.weeks;
    if (typeof weeks === 'string') weeks = parseWeeks(weeks);
    if (!name || name.length > 160) throw new Error('课程名不能为空且不能超过 160 字');
    if (teacher.length > 160 || room.length > 300) throw new Error('教师或教室字段过长');
    if (!Number.isInteger(day) || day < 1 || day > 7) throw new Error('缺少有效星期');
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > MAX_SECTIONS || end < start) throw new Error('缺少有效节次（1–16 节）');
    if (!Array.isArray(weeks) || !weeks.length || weeks.some(w => !Number.isInteger(w) || w < 1 || w > MAX_WEEKS)) throw new Error('缺少有效周次');
    return { id: text(raw.id).slice(0,100) || uid(), name, teacher, room, day, start, end,
      weeks: Array.from(new Set(weeks)).sort((a,b)=>a-b), color: Number.isInteger(raw.color) ? ((raw.color % 8)+8)%8 : index%8 };
  }

  function parseCell(value, day, fallbackSections, source, warnings) {
    const s = normalized(value);
    const matches = weekMatches(s);
    if (!s || /^(?:无|暂无|上午|下午|晚上|晚间|午休)$/.test(s)) return [];
    if (!matches.length) {
      warnings.push(source + '：未识别到周次，未导入「' + s.slice(0,50) + '」。请核对是否为未排课课程。');
      return [];
    }
    const result=[];
    let consumed = 0;
    matches.forEach((match, i) => {
      const before = s.slice(consumed, match.index).replace(/^[\s;；]+/, '');
      const next = matches[i+1];
      const after = s.slice(match.index + match[0].length, next ? next.index : s.length);
      // A course starts with a name and optional teacher before its week token.
      const lines = before.split(/\n+/).map(text).filter(Boolean);
      let name = lines.length>1 ? lines.slice(0,-1).join(' ') : (lines[0] || ''), teacher = lines.length>1 ? lines.at(-1) : '';
      if (lines.length === 1) {
        const starred = name.match(/^(.+?)\s+([^\s]+\*)\s*$/);
        if (starred) { name=starred[1]; teacher=starred[2]; }
      }
      const sec = parseSections(after) || fallbackSections;
      let room = '';
      let nextConsumed = s.length;
      if (sec) {
        const secMatch = after.match(/(?:第\s*)?\d{1,2}(?:\s*-\s*\d{1,2})?\s*(?:小)?节/);
        const tail = secMatch ? after.slice(secMatch.index + secMatch[0].length) : after;
        const tailLines = tail.split(/\n+/).map(text).filter(Boolean);
        if (next) {
          // Find the next name after this course's room; URP exports separate records with blank lines or semicolons.
          const separator = tail.search(/\n\s*\n|[;；]/);
          if (separator >= 0) {
            room=text(tail.slice(0,separator));
            nextConsumed = match.index + match[0].length + (secMatch ? secMatch.index + secMatch[0].length : 0) + separator;
          } else if (tailLines.length >= 2) {
            room = tailLines[0];
            const roomEnd = tail.indexOf(tailLines[0]) + tailLines[0].length;
            nextConsumed = match.index + match[0].length + (secMatch ? secMatch.index + secMatch[0].length : 0) + roomEnd;
          } else { room = tailLines[0] || ''; nextConsumed = next.index; }
        } else room = tailLines.join(' ');
      }
      try {
        if (!sec) throw new Error('未识别节次');
        const course=validateCourse({name,teacher:teacher.replace(/\*$/,''),room,day,...sec,weeks:parseWeeks(match[0])}, result.length);
        result.push(course);
      } catch (error) { warnings.push(source + '：' + error.message + '，请核对「' + name + '」。'); }
      consumed = nextConsumed;
    });
    return result;
  }

  const columns = {
    name: ['课程名称','课程名','科目','课程','name','coursename','subject'],
    teacher: ['任课教师','授课教师','教师姓名','教师','老师','teacher'],
    room: ['上课地点','上课教室','教学地点','地点','教室','room','location'],
    day: ['星期','星期几','周几','上课星期','day','weekday'],
    sections: ['上课节次','节次','节数','sections','section'],
    start: ['开始节次','起始节次','开始节','start','startsection'],
    end: ['结束节次','终止节次','结束节','end','endsection'],
    weeks: ['上课周次','教学周次','周次','周数','weeks'],
    weekStart: ['开始周','起始周','开始周次','startweek'],
    weekEnd: ['结束周','结束周次','endweek'],
    parity: ['单双周','周类型','单周双周','weektype'],
  };
  const headerKey = s => text(s).toLowerCase().replace(/[\s_()（）]/g,'');
  function findColumns(row) {
    const found={};
    row.forEach((cell,i) => {
      for (const [key, aliases] of Object.entries(columns)) if (aliases.some(a=>headerKey(a)===headerKey(cell))) found[key]=i;
    });
    return found;
  }

  function deduplicate(courses, warnings) {
    const seen = new Set(), result=[];
    for (const c of courses) {
      const key=JSON.stringify([c.name,c.teacher,c.room,c.day,c.start,c.end,c.weeks]);
      if (seen.has(key)) { warnings.push('已跳过重复记录：'+c.name); continue; }
      seen.add(key); result.push({...c,color:result.length%8});
    }
    if (result.length > MAX_COURSES) throw new Error('课程记录超过 1000 条，请只导入一个学期');
    return result;
  }

  function parseMatrix(rows, merges = [], source = '课表') {
    const warnings=[], courses=[];
    if (!Array.isArray(rows) || rows.length > 10000 || rows.some(row=>row.length>256)) throw new Error('表格过大，请只导出一个学期的课表');
    let header=-1, mapping;
    for (let r=0; r<Math.min(rows.length,50);r++) {
      const m=findColumns(rows[r] || []);
      if (m.name !== undefined && m.day !== undefined && (m.sections !== undefined || m.start !== undefined)) {header=r;mapping=m;break;}
    }
    if (header >= 0) {
      for (let r=header+1;r<rows.length;r++) {
        const row=rows[r]||[], get=key => mapping[key]===undefined ? '' : text(row[mapping[key]]);
        if (!get('name')) continue;
        try {
          let sections=parseSections(get('sections'));
          if (!sections && get('start')) sections={start:+get('start'),end:+(get('end')||get('start'))};
          const weekText=get('weeks') || (get('weekStart') ? get('weekStart')+'-'+(get('weekEnd')||get('weekStart')) : '');
          const parity=get('parity');
          const weeks=parseWeeks(weekText+(/单|双/.test(parity)?parity:''));
          courses.push(validateCourse({name:get('name'),teacher:get('teacher'),room:get('room'),day:parseDay(get('day')),...sections,weeks},courses.length));
        } catch(error) {warnings.push(source+' 第 '+(r+1)+' 行「'+get('name')+'」：'+error.message+'，未导入。');}
      }
      return {courses:deduplicate(courses,warnings),warnings,format:'课程清单'};
    }
    // Timetable grid: weekday columns and section/time rows; merged course cells read once at their anchor.
    let days={};
    for (let r=0;r<Math.min(rows.length,50);r++) {
      const candidate={};
      (rows[r]||[]).forEach((v,c)=> {const day=parseDay(v);if(day && /星期|周|礼拜|mon|tue|wed|thu|fri|sat|sun/i.test(text(v))) candidate[c]=day;});
      if (Object.keys(candidate).length>=3) {header=r;days=candidate;break;}
    }
    if (header < 0) throw new Error('未找到课程清单表头或星期网格。请导入原始课表文件，或使用随附的 CSV 模板。');
    const firstDay = Math.min(...Object.keys(days).map(Number));
    let previousSection=0;
    for (let r=header+1;r<rows.length;r++) {
      const row=rows[r]||[];
      let section=null;
      for (let c=0;c<firstDay;c++) { section=parseSections(row[c]); if(section) break; }
      if (!section) {
        // Plain section numbers appear in many URP Excel exports.
        for (let c=0;c<firstDay;c++) if (/^\d{1,2}$/.test(text(row[c])) && +row[c]>=1 && +row[c]<=16) {section={start:+row[c],end:+row[c]};break;}
      }
      if (section) previousSection=section.start;
      for (const [column,day] of Object.entries(days)) {
        const c=+column, value=text(row[c]);
        if (!value) continue;
        const covering=merges.find(m=>r>=m.s.r&&r<=m.e.r&&c>=m.s.c&&c<=m.e.c);
        if (covering && (covering.s.r!==r || covering.s.c!==c)) continue;
        let fallback=section;
        if (fallback && covering) fallback={start:fallback.start,end:Math.min(16,fallback.end+covering.e.r-covering.s.r)};
        courses.push(...parseCell(value,day,fallback,source+' 第 '+(r+1)+' 行',warnings));
      }
    }
    return {courses:deduplicate(courses,warnings),warnings,format:'周课表网格'};
  }

  function parseWorkbook(workbook, XLSX) {
    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length>50) throw new Error('工作簿无效或工作表过多');
    const courses=[], warnings=[], formats=[];
    for (const name of workbook.SheetNames) {
      const sheet=workbook.Sheets[name];
      if (!sheet || !sheet['!ref']) continue;
      const range=XLSX.utils.decode_range(sheet['!ref']);
      if (range.e.r>10000 || range.e.c>255) {warnings.push(name+'：工作表过大，已跳过。');continue;}
      try {
        const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false,blankrows:true,range:{s:{r:0,c:0},e:range.e}});
        const result=parseMatrix(rows,sheet['!merges']||[],name);
        courses.push(...result.courses); warnings.push(...result.warnings); formats.push(result.format);
      } catch(error) {warnings.push(name+'：'+error.message);}
    }
    const unique=deduplicate(courses,warnings);
    if (!unique.length) throw new Error('没有解析到有效课程。'+warnings.slice(0,3).join(' '));
    return {courses:unique,warnings,format:Array.from(new Set(formats)).join(' / ')};
  }

  function readImport(bytes, name, XLSX) {
    if (!bytes || bytes.length > 12*1024*1024) throw new Error('文件不能超过 12 MB');
    const ext=text(name).toLowerCase().split('.').pop();
    if (!['json','xlsx','xls','csv','tsv','html','htm'].includes(ext)) throw new Error('请选择 Excel、CSV、HTML 或 JSON 文件');
    const decode=()=>{try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch(error){return new TextDecoder('gb18030').decode(bytes);}};
    if(ext==='json') {
      const restored=validateState(JSON.parse(decode()));
      if(!restored.courses.length)throw new Error('该备份中没有课程');
      return {courses:restored.courses,warnings:[],format:'本应用备份',restore:restored};
    }
    const head=new TextDecoder().decode(bytes.slice(0,200));
    const isText=['csv','tsv','html','htm'].includes(ext)||/^\s*(?:\uFEFF)?</.test(head);
    let input=isText?decode():bytes;
    if(isText && /<(?:html|table|tr|td)\b/i.test(input)) {
      // HTML exporters may include a second, multiline copy of the cell value in data-v.
      // Read the visible table text only; retain rowspan/colspan for the grid coordinates.
      input=input.replace(/<(?:td|th)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi,tag=>tag.replace(/\sdata-[\w-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,''));
    }
    const workbook=XLSX.read(input,{type:isText?'string':'array',cellDates:false,raw:true});
    return parseWorkbook(workbook,XLSX);
  }

  function parseDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('日期格式应为 YYYY-MM-DD');
    const [y,m,d]=value.split('-').map(Number), date=new Date(y,m-1,d,12);
    if (date.getFullYear()!==y || date.getMonth()!==m-1 || date.getDate()!==d) throw new Error('日期无效');
    return date;
  }
  const dateString = date => [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
  function mondayOf(date) {const d=new Date(date);d.setHours(12,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7));return d;}
  function currentWeek(startDate,now=new Date()) {
    const start=parseDate(startDate), day=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12);
    return Math.floor(Math.round((day-start)/86400000)/7)+1;
  }
  function weekDates(startDate,week) {
    const start=parseDate(startDate);start.setDate(start.getDate()+(week-1)*7);
    return Array.from({length:7},(_,i)=>{const d=new Date(start);d.setDate(d.getDate()+i);return dateString(d);});
  }
  function defaultState(now=new Date()) {
    return {schemaVersion:1,semester:'我的课表',startDate:dateString(mondayOf(now)),totalWeeks:20,times:DEFAULT_TIMES.map(x=>x.slice()),courses:[],sourceName:'',savedAt:''};
  }
  function validateState(raw) {
    if (!raw || raw.schemaVersion!==1 || !Array.isArray(raw.courses)) throw new Error('不是有效的下节啥课备份（版本 1）');
    parseDate(raw.startDate);
    if (parseDate(raw.startDate).getDay()!==1) throw new Error('学期第一周必须从周一开始');
    if (!Number.isInteger(raw.totalWeeks)||raw.totalWeeks<1||raw.totalWeeks>60) throw new Error('学期周数应为 1–60');
    if (raw.courses.length>MAX_COURSES) throw new Error('课程超过 1000 条');
    if (!Array.isArray(raw.times)||raw.times.length<1||raw.times.length>16) throw new Error('节次时间应有 1–16 节');
    let lastEnd=-1;
    const times=raw.times.map(pair=> {
      if (!Array.isArray(pair)||pair.length!==2||pair.some(x=>!/^([01]\d|2[0-3]):[0-5]\d$/.test(x))) throw new Error('节次时间格式应为 HH:MM');
      const minutes=s=>+s.slice(0,2)*60+(+s.slice(3));
      if(minutes(pair[0])>=minutes(pair[1])||minutes(pair[0])<lastEnd) throw new Error('节次时间必须按顺序排列且不能重叠');
      lastEnd=minutes(pair[1]);return pair.slice();
    });
    const courses=raw.courses.map(validateCourse);
    if (courses.some(c=>c.end>times.length)) throw new Error('有课程超过已配置的最大节次');
    if (courses.some(c=>c.weeks.some(w=>w>raw.totalWeeks))) throw new Error('有课程超过学期总周数');
    const ids=new Set();for(const c of courses){if(ids.has(c.id))c.id=uid();ids.add(c.id);}
    return {schemaVersion:1,semester:text(raw.semester).slice(0,80)||'我的课表',startDate:raw.startDate,totalWeeks:raw.totalWeeks,times,courses,sourceName:text(raw.sourceName).slice(0,200),savedAt:text(raw.savedAt).slice(0,40)};
  }
  function findConflicts(courses) {
    const results=[];
    for(let i=0;i<courses.length;i++) for(let j=i+1;j<courses.length;j++) {
      const a=courses[i],b=courses[j];
      if(a.day===b.day&&a.start<=b.end&&b.start<=a.end) {
        const weeks=a.weeks.filter(w=>b.weeks.includes(w));
        if(weeks.length)results.push({a:a.id,b:b.id,weeks});
      }
    }
    return results;
  }
  function coursesInWeek(courses,week) {return courses.filter(c=>c.weeks.includes(week)).sort((a,b)=>a.day-b.day||a.start-b.start||a.name.localeCompare(b.name,'zh'));}
  function coursesForWeekView(courses,week) {
    return courses.map(c=>({...c,isActive:c.weeks.includes(week)}))
      .sort((a,b)=>a.day-b.day||a.start-b.start||Number(b.isActive)-Number(a.isActive)||a.name.localeCompare(b.name,'zh'));
  }
  function layoutCourses(courses) {
    const positions=new Map();
    for(let day=1;day<=7;day++) {
      const sorted=courses.filter(c=>c.day===day).sort((a,b)=>a.start-b.start||Number(b.isActive===true)-Number(a.isActive===true)||a.end-b.end||a.id.localeCompare(b.id));
      let group=[],groupEnd=0;
      function flush() {
        const stacked=group.length>1&&group.every(c=>c.start===group[0].start&&c.end===group[0].end)&&group.some(c=>c.isActive===true)&&group.some(c=>c.isActive===false);
        if(stacked) {
          const weight=group.reduce((sum,c)=>sum+(c.isActive?2:1),0);let offset=0;
          for(const c of group){const size=(c.isActive?2:1)/weight;positions.set(c.id,{lane:0,count:1,stackKey:day+':'+c.start+':'+c.end,stackOffset:offset,stackSize:size});offset+=size;}
          group=[];groupEnd=0;return;
        }
        const laneEnds=[], assigned=[];
        for(const c of group){let lane=laneEnds.findIndex(end=>end<c.start);if(lane<0)lane=laneEnds.length;laneEnds[lane]=c.end;assigned.push([c.id,lane]);}
        for(const [id,lane] of assigned)positions.set(id,{lane,count:laneEnds.length});
        group=[];groupEnd=0;
      }
      for(const c of sorted){if(group.length&&c.start>groupEnd)flush();group.push(c);groupEnd=Math.max(groupEnd,c.end);}
      if(group.length)flush();
    }
    return positions;
  }
  return {MAX_WEEKS,MAX_COURSES,MAX_SECTIONS,DEFAULT_TIMES,text,uid,parseWeeks,formatWeeks,parseDay,parseSections,validateCourse,parseCell,parseMatrix,parseWorkbook,readImport,parseDate,dateString,mondayOf,currentWeek,weekDates,defaultState,validateState,findConflicts,coursesInWeek,coursesForWeekView,layoutCourses};
});
