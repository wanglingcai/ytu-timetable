'use strict';
(() => {
  const $=id=>document.getElementById(id),KEY='ytu-appearance-v1';
  let config={mask:80,blur:0,imageUrl:''},saved={mask:80,blur:0},objectUrl='',busy=false,saveTimer;
  const native=()=>window.AndroidLocal&&typeof AndroidLocal.readAppearance==='function';
  function report(message){if(window.receiveNativeError)window.receiveNativeError({message});else $('backgroundStatus').textContent=message;}
  function validate(value) {
    if(!value||!Number.isInteger(value.mask)||value.mask<0||value.mask>80||!Number.isInteger(value.blur)||value.blur<0||value.blur>20)throw new Error('背景遮罩或模糊设置无效');
    return {mask:value.mask,blur:value.blur};
  }
  function apply() {
    const has=!!config.imageUrl;
    document.body.classList.toggle('has-wallpaper',has);$('wallpaper').hidden=!has;
    document.documentElement.style.setProperty('--wallpaper-mask',config.mask/100);
    document.documentElement.style.setProperty('--wallpaper-blur',config.blur+'px');
    if(has&&$('wallpaperImage').getAttribute('src')!==config.imageUrl)$('wallpaperImage').src=config.imageUrl;
    if(!has)$('wallpaperImage').removeAttribute('src');
    $('backgroundMask').value=config.mask;$('backgroundBlur').value=config.blur;
    $('maskValue').textContent=config.mask+'%';$('blurValue').textContent=config.blur+'px';
    $('resetBackground').disabled=!has||busy;$('chooseBackground').disabled=busy;
    $('backgroundStatus').textContent=busy?'正在处理图片…':has?'背景已保存在本机，调整会自动保存。':'当前使用默认背景。选择图片后自动启用毛玻璃样式。';
  }
  async function database(operation,blob) {
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open('ytu-appearance',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('images');
      request.onerror=()=>reject(new Error('浏览器图片存储不可用'));
      request.onsuccess=()=>{
        const db=request.result,transaction=db.transaction('images',operation==='get'?'readonly':'readwrite'),store=transaction.objectStore('images');
        const item=operation==='get'?store.get('background'):operation==='put'?store.put(blob,'background'):store.delete('background');
        let result;item.onsuccess=()=>result=item.result;
        transaction.oncomplete=()=>{db.close();resolve(result);};transaction.onerror=()=>{db.close();reject(new Error('背景保存失败，请检查浏览器存储空间'));};transaction.onabort=transaction.onerror;
      };
    });
  }
  function setBlob(blob) {
    const previous=objectUrl;objectUrl=blob?URL.createObjectURL(blob):'';config.imageUrl=objectUrl;apply();if(previous)URL.revokeObjectURL(previous);
  }
  async function load() {
    try {
      if(native()){const data=JSON.parse(AndroidLocal.readAppearance());config={...validate(data),imageUrl:typeof data.imageUrl==='string'&&data.imageUrl.startsWith('file:///android_asset/personal-background.jpg?')?data.imageUrl:''};}
      else {const value=localStorage.getItem(KEY);if(value)config={...config,...validate(JSON.parse(value))};const blob=await database('get');if(blob instanceof Blob)setBlob(blob);}
      saved=validate(config);apply();
    }catch(error){apply();report('外观读取失败，可重新选择图片；课表未修改。');}
  }
  function save() {
    clearTimeout(saveTimer);
    try {
      const value=validate(config),json=JSON.stringify(value);
      if(native()){if(!AndroidLocal.saveAppearance(json))throw new Error('背景设置保存失败');}
      else {localStorage.setItem(KEY,json);if(localStorage.getItem(KEY)!==json)throw new Error('背景设置保存失败');}
      saved=value;
    }catch(error){config={...config,...saved};apply();report(error.message);}
  }
  async function normalized(file) {
    if(file.size>12*1024*1024)throw new Error('背景图片不能超过 12 MB');
    if(!/^image\//.test(file.type))throw new Error('请选择图片文件');
    const url=URL.createObjectURL(file),image=new Image();
    try {
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('无法解码图片，请尝试 JPG、PNG 或 WebP'));image.src=url;});
      if(image.naturalWidth>20000||image.naturalHeight>20000)throw new Error('图片尺寸不能超过 20000 像素');
      const ratio=Math.min(1,2048/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
      const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
      return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('图片处理失败')),'image/jpeg',.88));
    }finally{URL.revokeObjectURL(url);}
  }
  $('chooseBackground').onclick=()=>{if(native())AndroidLocal.chooseBackground();else $('backgroundInput').click();};
  $('backgroundInput').onchange=async event=>{
    const file=event.target.files[0];event.target.value='';if(!file||busy)return;busy=true;apply();
    try{const blob=await normalized(file);await database('put',blob);setBlob(blob);}catch(error){report(error.message);}finally{busy=false;apply();}
  };
  $('resetBackground').onclick=async()=>{
    if(busy)return;clearTimeout(saveTimer);
    if(native()){AndroidLocal.clearBackground();return;}
    busy=true;apply();
    try{await database('delete');config={mask:80,blur:0,imageUrl:''};setBlob(null);save();}catch(error){report(error.message);}finally{busy=false;apply();}
  };
  ['backgroundMask','backgroundBlur'].forEach(id=>{
    $(id).oninput=()=>{config.mask=Number($('backgroundMask').value);config.blur=Number($('backgroundBlur').value);apply();clearTimeout(saveTimer);saveTimer=setTimeout(save,180);};
    $(id).onchange=save;
  });
  $('wallpaperImage').onerror=()=>{config.imageUrl='';apply();report('背景图片未能加载，请重新选择；课表未修改。');};
  window.receiveAppearance=data=>{try{config={...validate(data),imageUrl:typeof data.imageUrl==='string'&&data.imageUrl.startsWith('file:///android_asset/personal-background.jpg?')?data.imageUrl:''};saved=validate(config);apply();}catch(error){report(error.message);}};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)save();});
  apply();load();
})();
