import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({origin:vi.fn(),rate:vi.fn(),transcribe:vi.fn()}));
vi.mock('@/lib/backend/public-request',()=>({assertSameOrigin:mocks.origin,guardPublicRequest:mocks.rate}));
vi.mock('@/lib/backend/voice-transcription',async importOriginal=>({...await importOriginal<typeof import('@/lib/backend/voice-transcription')>(),transcribeNiaRecording:mocks.transcribe}));
import { GET, POST } from '@/app/api/nia/transcribe/route';
const bytes=Uint8Array.from([0x1a,0x45,0xdf,0xa3,1,2,3,4]);
function request(type='audio/webm',duration='3',audio:BlobPart=bytes){const form=new FormData();form.set('audio',new File([audio],'voice.webm',{type}));form.set('durationSeconds',duration);return new Request('https://nestly.example/api/nia/transcribe',{method:'POST',body:form});}
beforeEach(()=>{vi.resetAllMocks();mocks.origin.mockReturnValue(null);mocks.rate.mockResolvedValue(null);mocks.transcribe.mockResolvedValue('Two bedrooms in GRA');vi.stubEnv('NIA_VOICE_ENABLED','true');vi.stubEnv('NIA_N8N_WEBHOOK_URL','https://synthetic.n8n.cloud/webhook/nestly-nia-response');vi.stubEnv('NESTLY_WF01_RELAY_SECRET','synthetic-secret');});
afterEach(()=>vi.unstubAllEnvs());
describe('voice transcription API',()=>{
 it('advertises disabled service until activation is approved',async()=>{vi.stubEnv('NIA_VOICE_ENABLED','false');expect(await GET().json()).toEqual({enabled:false});expect((await POST(request())).status).toBe(503);expect(mocks.transcribe).not.toHaveBeenCalled();});
 it('rejects a different origin before any provider work',async()=>{mocks.origin.mockReturnValue(new Response(null,{status:403}));expect((await POST(request())).status).toBe(403);expect(mocks.rate).not.toHaveBeenCalled();});
 it('applies the five-per-minute transcription rate limit',async()=>{mocks.rate.mockResolvedValue(new Response(null,{status:429}));expect((await POST(request())).status).toBe(429);expect(mocks.rate).toHaveBeenCalledWith(expect.any(Request),'nia-voice-transcription',{maxRequests:5,windowSeconds:60});expect(mocks.transcribe).not.toHaveBeenCalled();});
 it('returns editable text without sending a conversation message',async()=>{const response=await POST(request());expect(response.status).toBe(200);expect(await response.json()).toEqual({text:'Two bedrooms in GRA'});expect(response.headers.get('cache-control')).toBe('no-store');expect(mocks.transcribe).toHaveBeenCalledWith(bytes,'audio/webm',3,expect.objectContaining({signal:expect.any(AbortSignal)}));});
 it.each(['0','61','invalid'])('rejects invalid declared duration %s',async duration=>{expect((await POST(request('audio/webm',duration))).status).toBe(400);expect(mocks.transcribe).not.toHaveBeenCalled();});
 it('rejects non-audio and forged audio signatures',async()=>{expect((await POST(request('text/plain'))).status).toBe(415);expect((await POST(request('audio/webm','2','not really audio'))).status).toBe(415);expect(mocks.transcribe).not.toHaveBeenCalled();});
 it('rejects oversized bodies without reading or calling the provider',async()=>{const r=request();r.headers.set('content-length',String(3*1024*1024));expect((await POST(r)).status).toBe(413);expect(mocks.transcribe).not.toHaveBeenCalled();});
 it('reports empty speech and sanitizes upstream failures',async()=>{mocks.transcribe.mockRejectedValueOnce(new Error('NO_SPEECH'));expect((await POST(request())).status).toBe(422);mocks.transcribe.mockRejectedValueOnce(new Error('sensitive-provider-diagnostic'));const r=await POST(request());expect(r.status).toBe(502);expect(JSON.stringify(await r.json())).not.toContain('sensitive-provider-diagnostic');});
});
