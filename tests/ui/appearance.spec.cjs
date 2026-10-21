const {test,expect}=require('@playwright/test');
async function fixture(page) {
  await page.clock.install({time:new Date('2026-10-21T13:35:20+08:00')});
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  await page.evaluate(()=>{
    const base={teacher:'模拟教师',room:'模拟实验楼306',weeks:[8]};
    const courses=[
      {...base,id:'long',name:'计算机网络课程设计与实践_03',day:7,start:3,end:4},
      {...base,id:'web',name:'Web服务端技术上机_01',day:2,start:9,end:10},
      {...base,id:'single',name:'单节超长课程名称与实践_40',day:3,start:1,end:1},
      {...base,id:'stack-active',name:'同格本周课程长名称',day:4,start:5,end:6},
      {...base,id:'stack-inactive',name:'同格非本周课程长名称',day:4,start:5,end:6,weeks:[9]},
      {...base,id:'conflict',name:'冲突课程长名称',day:2,start:9,end:10}
    ].map(Timetable.validateCourse);
    localStorage.setItem('ytu-timetable-v1',JSON.stringify({...Timetable.defaultState(),semester:'模拟外观测试',startDate:'2026-08-31',courses}));
  });await page.reload();
}
async function image(page,kind='pattern') {
  return Buffer.from(await page.evaluate(kind=>{
    const c=document.createElement('canvas');c.width=320;c.height=640;const x=c.getContext('2d');
    x.fillStyle=kind==='dark'?'#080b18':'#fff';x.fillRect(0,0,320,640);
    if(kind==='pattern')for(let y=0;y<640;y+=40)for(let i=0;i<320;i+=40){x.fillStyle=['#ff1177','#060b25','#00ccff','#ffe500'][(y/40+i/40)%4];x.fillRect(i,y,40,40);}
    return c.toDataURL('image/png').split(',')[1];
  },kind),'base64');
}
async function choose(page,kind) {
  await page.locator('#backgroundInput').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:await image(page,kind)});
  await expect(page.locator('body')).toHaveClass(/has-wallpaper/);
  await expect.poll(()=>page.locator('#wallpaperImage').evaluate(n=>n.complete&&n.naturalWidth>0)).toBe(true);
}
test('长标题、单节和堆叠卡片在各屏宽保留完整行，地点无重叠，原始名称仍可查看',async({page})=>{
  await fixture(page);
  for(const width of [320,393,768]) {
    await page.setViewportSize({width,height:852});
    await expect.poll(()=>page.evaluate(()=>Array.from(document.querySelectorAll('.course-card')).every(card=>{
      const title=card.querySelector('strong'),room=card.querySelector('small'),r=title.getBoundingClientRect(),b=card.getBoundingClientRect();
      const line=parseFloat(getComputedStyle(title).lineHeight),padding=parseFloat(getComputedStyle(card).paddingBottom);
      if(getComputedStyle(title).visibility==='hidden')return true;
      if(r.height>line*3+.6||Math.abs(r.height/line-Math.round(r.height/line))>.08||r.bottom>b.bottom-padding+.6)return false;
      if(!room.hidden){const s=room.getBoundingClientRect();if(s.top-r.bottom<3.5||s.bottom>b.bottom-padding+.6)return false;}
      return true;
    }))).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  const web=page.locator('.course-card').filter({hasText:'Web服务端'});await expect(web.locator('strong')).toHaveText('Web服务端技术上机');
  await web.click();await expect(page.locator('#courseDetail')).toContainText('Web服务端技术上机_01');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('ytu-timetable-v1')).courses.find(c=>c.id==='web').name)).toBe('Web服务端技术上机_01');
});
test('图片、遮罩与模糊本地持久化；损坏图片保留原背景，备份独立，恢复默认',async({page})=>{
  await fixture(page);const before=await page.evaluate(()=>localStorage.getItem('ytu-timetable-v1'));
  await page.locator('#settingsButton').click();await choose(page,'pattern');
  await page.locator('#backgroundMask').fill('80');await page.locator('#backgroundMask').dispatchEvent('change');
  await page.locator('#backgroundBlur').fill('20');await page.locator('#backgroundBlur').dispatchEvent('change');
  const old=await page.locator('#wallpaperImage').getAttribute('src');
  await page.locator('#backgroundInput').setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('broken image')});
  await expect(page.locator('#toast')).toContainText('无法解码');expect(await page.locator('#wallpaperImage').getAttribute('src')).toBe(old);
  await page.locator('#backgroundInput').setInputFiles([]);expect(await page.locator('#wallpaperImage').getAttribute('src')).toBe(old);
  await page.reload();await expect(page.locator('body')).toHaveClass(/has-wallpaper/);
  await expect.poll(()=>page.locator('#wallpaperImage').evaluate(n=>n.complete&&n.naturalWidth===320)).toBe(true);
  await page.locator('#settingsButton').click();await expect(page.locator('#backgroundMask')).toHaveValue('80');await expect(page.locator('#backgroundBlur')).toHaveValue('20');
  expect(await page.evaluate(()=>localStorage.getItem('ytu-timetable-v1'))).toBe(before);
  await page.locator('#settingsDialog .close-dialog').click();const download=page.waitForEvent('download');await page.locator('#backupButton').click();
  const file=await(await download).createReadStream();let json='';for await(const chunk of file)json+=chunk;
  expect(JSON.parse(json).courses).toHaveLength(6);expect(json).not.toMatch(/imageUrl|wallpaper|background\.jpg|blob:/);
  await page.locator('#settingsButton').click();await page.locator('#resetBackground').click();await expect(page.locator('body')).not.toHaveClass(/has-wallpaper/);
  await expect(page.locator('#backgroundMask')).toHaveValue('35');await expect(page.locator('#backgroundBlur')).toHaveValue('0');
  await page.reload();await expect(page.locator('body')).not.toHaveClass(/has-wallpaper/);
  expect(await page.evaluate(()=>localStorage.getItem('ytu-timetable-v1'))).toBe(before);
});
test('暗色、纯白与高对比壁纸下的文字衬底和玻璃界面',async({page})=>{
  await fixture(page);
  for(const kind of ['dark','white','pattern']) {
    await page.locator('#settingsButton').click();await choose(page,kind);
    await page.locator('#backgroundMask').fill('0');await page.locator('#backgroundMask').dispatchEvent('change');
    await page.locator('#backgroundBlur').fill('0');await page.locator('#backgroundBlur').dispatchEvent('change');
    await page.locator('#settingsDialog .close-dialog').click();
    expect(await page.locator('.schedule-wrap').evaluate(n=>getComputedStyle(n).backgroundColor)).toBe('rgba(255, 255, 255, 0.55)');
    expect(await page.locator('.course-card:not(.inactive)').first().evaluate(n=>getComputedStyle(n).backgroundColor.startsWith('rgb('))).toBe(true);
    expect(await page.locator('.course-card.inactive').evaluate(n=>getComputedStyle(n).backgroundColor)).toBe('rgba(241, 245, 249, 0.9)');
    await page.screenshot({path:`test-results/wallpaper-${kind}-phone.png`,fullPage:true});
  }
});
test('八组课程配色与深色壁纸上的关键小字满足可读对比度',async({page})=>{
  await fixture(page);
  const colors=await page.evaluate(()=>Array.from({length:8},(_,i)=>{
    const chip=document.createElement('span');chip.className='palette-'+i;document.body.append(chip);
    const css=getComputedStyle(chip),pair=[css.color,css.backgroundColor];chip.remove();return pair;
  }));
  const rgb=value=>value.match(/[\d.]+/g).map(Number);
  const luminance=color=>rgb(color).slice(0,3).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
  const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  for(const [fg,bg] of colors)expect(contrast(fg,bg)).toBeGreaterThanOrEqual(4.5);
  await page.locator('#settingsButton').click();await choose(page,'dark');await page.locator('#backgroundMask').fill('0');await page.locator('#backgroundMask').dispatchEvent('change');await page.locator('#settingsDialog .close-dialog').click();
  const pairs=await page.evaluate(()=>['.day-head.today .date','.day-head:not(.today) .date','.time-label span','.masthead h1','.semester-name','.week-card .small','.schedule-hint','.quick-action'].map(selector=>{
    const node=document.querySelector(selector);let background=[0,0,0];const ancestors=[];
    for(let n=node;n;n=n.parentElement)ancestors.unshift(n);
    // Composite glass layers over black, the darkest possible wallpaper.
    for(const n of ancestors){if(n===document.body||n===document.documentElement)continue;const c=getComputedStyle(n).backgroundColor.match(/[\d.]+/g).map(Number),alpha=c[3]??1;background=background.map((v,i)=>c[i]*alpha+v*(1-alpha));}
    return [getComputedStyle(node).color,'rgb('+background.join(',')+')'];
  }));
  for(const [fg,bg] of pairs)expect(contrast(fg,bg),fg+' on '+bg).toBeGreaterThanOrEqual(4.5);
});
