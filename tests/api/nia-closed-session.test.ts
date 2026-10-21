import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), createClient: vi.fn(), guard: vi.fn(), origin: vi.fn(), properties: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'a'.repeat(43) }) }) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/backend/public-request', () => ({ assertSameOrigin: mocks.origin, guardPublicRequest: mocks.guard }));
vi.mock('@/lib/backend/nia-conversation-response', () => ({ getNiaPublicPropertiesByIds: mocks.properties }));
import { GET } from '@/app/api/nia/conversations/route';
beforeEach(() => { vi.resetAllMocks(); mocks.origin.mockReturnValue(null); mocks.guard.mockResolvedValue(null); mocks.createClient.mockResolvedValue({ rpc: mocks.rpc }); });
describe('completed website chat session', () => {
  it('expires only the closed session cookie so a new chat can start', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ conversation_id: '11111111-1111-4111-8111-111111111111', mode: 'CLOSED', message_id: null, nia_context: {} }], error: null });
    const response = await GET(new Request('https://nestly.example/api/nia/conversations'));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ data: null });
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(mocks.properties).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('get_website_conversation_v2', expect.any(Object));
  });
  it('does not discard an active human handoff', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ conversation_id: '11111111-1111-4111-8111-111111111111', mode: 'HUMAN_ACTIVE', message_id: null, nia_context: {} }], error: null });
    mocks.properties.mockResolvedValue([]);
    const response = await GET(new Request('https://nestly.example/api/nia/conversations'));
    expect(response.status).toBe(200);
    expect((await response.json()).data.mode).toBe('HUMAN_ACTIVE');
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});
