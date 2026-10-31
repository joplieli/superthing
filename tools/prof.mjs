import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';
const srv = await serve(0); const port = srv.address().port;
const browser = await puppeteer.launch({executablePath:'/usr/local/bin/google-chrome', headless:true,
 args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-dev-shm-usage']});
for (const url of process.argv.slice(2)) {
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('ERR', e.message));
  await page.setViewport({width:1920,height:1080});
  await page.goto(`http://127.0.0.1:${port}/${url}`);
  await page.waitForFunction('window.READY===true',{timeout:120000});
  await page.evaluate(()=>window.renderFrame(0));
  const r = await page.evaluate(()=>window.profile());
  console.log(url, JSON.stringify(r, (k,v)=>typeof v==='number'?Math.round(v):v));
  await page.close();
}
await browser.close(); srv.close();
