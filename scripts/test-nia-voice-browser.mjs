// Loopback-only voice UI tests. Fake microphone + mocked transcription; no audio leaves this process.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const origin='http://127.0.0.1:3058';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3058'],{env:{...process.env,NIA_VOICE_ENABLED:'false',NIA_N8N_ENABLED:'false',TELEGRAM_OUTBOUND_ENABLED:'false',TELEGRAM_HANDOFF_CHAT_ID:'',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54399',NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic'},stdio:['ignore','pipe','pipe']});
let log='';server.stdout.on('data',x=>log+=x);server.stderr.on('data',x=>log+=x);let browser;
try{
 for(let i=0;i<40;i++){try{const r=await fetch(origin,{signal:AbortSignal.timeout(1500)});if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']}: {})});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.addInitScript(()=>{
  window.voiceTest={starts:0,stops:0,deny:false,offset:0};const now=Date.now;Date.now=()=>now()+window.voiceTest.offset;
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{window.voiceTest.starts++;if(window.voiceTest.deny)throw new DOMException('Denied','NotAllowedError');return{getTracks:()=>[{stop:()=>window.voiceTest.stops++}]};}}});
  window.MediaRecorder=class{static isTypeSupported(t){return t.includes('webm');}constructor(_s,o){this.state='inactive';this.mimeType=o?.mimeType||'audio/webm';}start(){this.state='recording';}stop(){if(this.state==='inactive')return;this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob([new Uint8Array([0x1a,0x45,0xdf,0xa3,1,2])],{type:this.mimeType})});this.onstop?.();});}};
 });
 let transcriptions=0,chatSends=0,delay=0,fail=false,lastDuration=0,sentText='';
 await page.route('**/*',async r=>{const request=r.request(),url=new URL(request.url());if(url.origin!==origin){await r.abort();return;}
  if(url.pathname==='/api/nia/transcribe'){
   if(request.method()==='GET'){await r.fulfill({json:{enabled:true}});return;}
   transcriptions++;const body=request.postDataBuffer()?.toString()||'';lastDuration=Number(body.match(/name="durationSeconds"\r\n\r\n([^\r]+)/)?.[1]);
   if(delay)await new Promise(x=>setTimeout(x,delay));if(fail){fail=false;await r.fulfill({status:422,json:{error:'No speech was detected. Please try again.'}});return;}
   await r.fulfill({json:{text:'two-bedroom apartment in GRA'}});return;
  }
  if(url.pathname==='/api/nia/conversations/messages'){chatSends++;sentText=request.postDataJSON().content;await r.fulfill({json:{data:{mode:'AI_ACTIVE',message:'Synthetic saved response',properties:[]}}});return;}
  if(url.pathname==='/api/nia/conversations'){await r.fulfill({json:{data:null}});return;}
  if(url.pathname.startsWith('/api/')){if(request.method()!=='GET'){await r.abort();return;}await r.fulfill({json:{data:[],total:0}});return;}
  await r.continue();});
 await page.goto(origin);await page.getByRole('button',{name:'Open Nia Property Assistant',exact:true}).click();
 const mic=()=>page.getByRole('button',{name:'Record voice note',exact:true});const stop=()=>page.getByRole('button',{name:'Stop recording and transcribe',exact:true});const input=()=>page.getByRole('dialog',{name:'Nia Property Assistant'}).locator('input');
 await mic().waitFor();assert.equal(await page.evaluate(()=>window.voiceTest.starts),0);
 await input().fill('Hi Nia');await mic().click();await stop().waitFor();await input().press('Enter');assert.equal(chatSends,0);
 await stop().click();await page.waitForFunction(()=>document.querySelector('[role="dialog"] input')?.value==='Hi Nia two-bedroom apartment in GRA');assert.equal(chatSends,0);assert.equal(transcriptions,1);
 await input().fill('Edited: two-bedroom apartment in GRA');await page.getByRole('button',{name:'Send message to Nia'}).click();await page.waitForTimeout(250);assert.equal(chatSends,1);assert.equal(sentText,'Edited: two-bedroom apartment in GRA');
 const beforeCancel=transcriptions;await mic().click();await stop().waitFor();await page.getByRole('button',{name:'Cancel recording',exact:true}).click();await mic().waitFor();await page.waitForTimeout(100);assert.equal(transcriptions,beforeCancel);
 await input().fill('Keep draft');delay=600;await mic().click();await stop().click();await page.getByText('Transcribing… Review the text before sending.',{exact:true}).waitFor();await page.getByRole('button',{name:'Cancel recording',exact:true}).click();await page.waitForTimeout(750);assert.equal(await input().inputValue(),'Keep draft');delay=0;
 await page.evaluate(()=>window.voiceTest.deny=true);await mic().click();await page.getByText('Microphone access was denied. Allow it in your browser, or type your message.',{exact:true}).waitFor();assert.equal(await input().inputValue(),'Keep draft');await page.getByRole('button',{name:'Cancel recording',exact:true}).click();await page.evaluate(()=>window.voiceTest.deny=false);
 fail=true;await mic().click();await stop().click();await page.getByRole('button',{name:'Retry transcription',exact:true}).waitFor();const starts=await page.evaluate(()=>window.voiceTest.starts);await page.getByRole('button',{name:'Retry transcription',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[role="dialog"] input')?.value==='Keep draft two-bedroom apartment in GRA');assert.equal(await page.evaluate(()=>window.voiceTest.starts),starts);
 await input().fill('');await mic().click();await stop().waitFor();await page.evaluate(()=>window.voiceTest.offset+=61000);await page.waitForFunction(()=>document.querySelector('[role="dialog"] input')?.value==='two-bedroom apartment in GRA');assert.ok(lastDuration>0&&lastDuration<=60);
 const stops=await page.evaluate(()=>window.voiceTest.stops);await mic().click();await stop().waitFor();await page.getByRole('button',{name:'Close Nia assistant',exact:true}).click();await page.waitForFunction(previous=>window.voiceTest.stops>previous,stops);assert.equal(chatSends,1);
 console.log(JSON.stringify({environment:'local production build, fake microphone and mocked transcription',passed:['no automatic permission','record-stop-edit-manual-send','cancel recording','cancel transcription','permission denial','retry without re-recording','60-second auto-stop','close releases microphone'],externalAudioUploads:0,screenshots:0}));
}catch(e){console.error(log.slice(-1200));throw e;}
finally{if(browser)await browser.close();server.kill('SIGTERM');}
