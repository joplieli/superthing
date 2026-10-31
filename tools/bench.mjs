import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';
import fs from 'node:fs';
const srv = await serve(0); const port = srv.address().port;
const browser = await puppeteer.launch({executablePath:'/usr/local/bin/google-chrome', headless:true,
 args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-dev-shm-usage','--window-size=1920,1080']});
const page = await browser.newPage();
page.on('console', m => console.log('PAGE', m.text())); page.on('pageerror', e => console.log('ERR', e.message));
await page.setViewport({width:1920,height:1080});
await page.goto(`http://127.0.0.1:${port}/${process.argv[2]}`);
await page.waitForFunction('window.READY===true',{timeout:120000});
for (let f=0; f<4; f++){
  let t0=Date.now(); await page.evaluate(f=>window.renderFrame(f), f); const tr=Date.now()-t0;
  t0=Date.now(); const b64 = await page.evaluate(()=>document.querySelector('canvas').toDataURL('image/png')); const tc=Date.now()-t0;
  t0=Date.now(); const shot = await page.screenshot({type:'png'}); const ts=Date.now()-t0;
  if(f==3){fs.writeFileSync('/tmp/verify/bench.png', Buffer.from(b64.split(',')[1],'base64'));}
  console.log({f, renderMs:tr, toDataURLms:tc, screenshotMs:ts, pngKB: (b64.length*0.75/1024)|0});
}
await browser.close(); srv.close();
