import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('sw entry point', () => {
    beforeEach(() => {
        vi.resetModules();
        (self as any).location = { href: 'http://localhost/sw.mjs' };
        (self as any).registration = { scope: 'http://localhost/' };

        global.fetch = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ precache: [], routes: [] }), { status: 200 })
        );
    });

    it('creates and starts PolyfeaServiceWorker on import', async () => {
        const startSpy = vi.fn().mockResolvedValue(undefined);
        vi.doMock('../src/polyfea-sw', () => ({
            PolyfeaServiceWorker: vi.fn().mockImplementation(function (this: any) {
                this.start = startSpy;
            }),
        }));

        await import('../src/sw');
        expect(startSpy).toHaveBeenCalled();
    });
});
