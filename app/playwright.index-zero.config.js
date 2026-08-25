const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({
  testDir:'./tests',
  timeout:30000,
  use:{headless:true},
  webServer:{
    command:'python3 -m http.server 4173 --bind 127.0.0.1 --directory ../public',
    url:'http://127.0.0.1:4173/index.html',
    reuseExistingServer:false,
    timeout:20000
  },
  reporter:[['list'],['json',{outputFile:'test-results/index-zero.json'}]]
});
