// Local-only, network-isolated regression: a slow history read must not delay a saved reply.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const origin = 'http://127.0.0.1:3047';
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3047'], {
  env: { ...process.env, NIA_N8N_ENABLED: 'false', TELEGRAM_OUTBOUND_ENABLED: 'false', TELEGRAM_HANDOFF_CHAT_ID: '', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54399', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-only' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', x => { serverLog += x; }); server.stderr.on('data', x => { serverLog += x; });
let browser;
try {
  let ready = false;
  for (let i=0;i<30;i++) { try { const r=await fetch(origin,{signal:AbortSignal.timeout(2000)}); if(r.ok){ready=true;break;} }catch{} await new Promise(r=>setTimeout(r,300)); }
  assert.ok(ready, 'Local production server must start');
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']}: {})});
  const page=await browser.newPage();
  const property={id:'11111111-1111-4111-8111-111111111111',title:'Synthetic GRA apartment',location:'GRA',priceLabel:'₦2,500,000/year'};
  let sent=false, postRepliedAt=0;
  await page.route('**/*',async route=>{
    const req=route.request(), url=new URL(req.url());
    if(url.origin!==origin){await route.abort();return;}
    if(url.pathname==='/api/nia/conversations/messages'&&req.method()==='POST'){
      sent=true; postRepliedAt=performance.now();
      await route.fulfill({json:{data:{mode:'AI_ACTIVE',message:'Here is your matching home.',properties:[property]}}});return;
    }
    if(url.pathname==='/api/nia/conversations'){
      if(sent){await new Promise(r=>setTimeout(r,4000));if(page.isClosed())return;await route.fulfill({json:{data:{conversationId:'synthetic-chat',mode:'AI_ACTIVE',messages:[{id:'synthetic-reply',senderType:'nia',content:'Here is your matching home.',deliveryStatus:'sent',createdAt:'2026-10-21T12:00:00Z'}],currentProperties:[property]}}});}
      else await route.fulfill({json:{data:null}});return;
    }
    if(url.pathname.startsWith('/api/')){
      if(req.method()!=='GET'){await route.abort();return;}
      await route.fulfill({json:{data:[],total:0,page:1,pageSize:20}});return;
    }
    await route.continue();
  });
  await page.goto(origin);
  await page.getByRole('button',{name:'Open Nia Property Assistant',exact:true}).click();
  const chat=page.getByRole('dialog',{name:'Nia Property Assistant',exact:true});
  await chat.locator('input').fill('Show me apartments in GRA');
  await page.getByRole('button',{name:'Send message to Nia',exact:true}).click();
  await page.getByText('Synthetic GRA apartment',{exact:true}).waitFor({state:'visible',timeout:1500});
  const visibleAfterMs=Math.round(performance.now()-postRepliedAt);
  assert.ok(visibleAfterMs<1500, 'Saved reply must be visible before the delayed 4-second history read');
  console.log(JSON.stringify({environment:'local production build, synthetic browser endpoints',visibleAfterMs,historyDelayMs:4000,externalProviderRequests:0,passed:true}));
}catch(error){console.error(serverLog.slice(-1200));throw error;}
finally{if(browser)await browser.close();server.kill('SIGTERM');}
