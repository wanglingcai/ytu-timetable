const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({
  testDir:'tests/ui',timeout:30000,workers:1,reporter:'list',
  use:{baseURL:'http://127.0.0.1:4173',viewport:{width:393,height:852},locale:'zh-CN',timezoneId:'Asia/Shanghai',launchOptions:{channel:'msedge'},screenshot:'only-on-failure'},
  webServer:{command:'node scripts/serve.cjs',url:'http://127.0.0.1:4173',reuseExistingServer:false},
});
