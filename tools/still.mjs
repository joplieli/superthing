// Render selected frames of a page to PNG: node tools/still.mjs <page> <outPrefix> <frame...> [--w=960 --h=540] [--q=key=val&...]
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';
import fs from 'node:fs';
const args = process.argv.slice(2);
const opts = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const s = a.slice(2); const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1)]; }));
const pos = args.filter(a => !a.startsWith('--'));
const [pageUrl, outPrefix, ...frames] = pos;
const w = +(opts.w || 960), h = +(opts.h || 540);
const srv = await serve(0); const port = srv.address().port;
const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/google-chrome', headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
page.on('console', m => { const t = m.text(); if (!t.includes('404')) console.log('PAGE', t); });
page.on('pageerror', e => console.log('PAGEERR', e.message));
await page.setViewport({ width: w, height: h });
const q = `w=${w}&h=${h}` + (opts.q ? '&' + opts.q : '');
await page.goto(`http://127.0.0.1:${port}/${pageUrl}${pageUrl.includes('?') ? '&' : '?'}${q}`);
await page.waitForFunction('window.READY===true', { timeout: 300000 });
for (const f of frames) {
  const t0 = Date.now();
  const b64 = await page.evaluate(async (f) => { await window.renderFrame(+f); return document.querySelector('canvas').toDataURL('image/png'); }, f);
  fs.writeFileSync(`${outPrefix}_${String(f).padStart(4, '0')}.png`, Buffer.from(b64.split(',')[1], 'base64'));
  console.log('frame', f, Date.now() - t0, 'ms');
}
await browser.close(); srv.close();
