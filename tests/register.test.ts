import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── helpers ──────────────────────────────────────────────────────────────────

// Set up navigator.serviceWorker
Object.defineProperty(globalThis.navigator, 'serviceWorker', {
    value: { register: vi.fn() },
    writable: true,
    configurable: true,
});

// ── tests ─────────────────────────────────────────────────────────────────────
describe('register', () => {
    let WorkboxMock: any;
    let wbInstance: any;

    beforeEach(async () => {
        vi.resetModules();
        wbInstance = { register: vi.fn().mockResolvedValue(undefined) };
        // Workbox is instantiated with `new` — use a class-style mock
        WorkboxMock = vi.fn().mockImplementation(function (this: any) {
            Object.assign(this, wbInstance);
        });
        vi.doMock('workbox-window', () => ({ Workbox: WorkboxMock }));

        // Set a predictable document.baseURI
        Object.defineProperty(document, 'baseURI', {
            value: 'http://localhost/',
            writable: true,
            configurable: true,
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        // Remove injected meta tags
        document.querySelectorAll('meta[name^="polyfea"]').forEach(el => el.remove());
    });

    function addMeta(name: string, content: string) {
        const meta = document.createElement('meta');
        meta.name = name;
        meta.content = content;
        document.head.appendChild(meta);
    }

    it('registers service worker with default URL when no params', async () => {
        const { registerServiceWorker } = await import('../src/register');
        registerServiceWorker('', 0);
        expect(WorkboxMock).toHaveBeenCalledWith(
            expect.stringContaining('sw.mjs'),
            expect.objectContaining({ type: 'module' })
        );
        expect(wbInstance.register).toHaveBeenCalled();
    });

    it('appends caching-config param when cachingConfigPath provided', async () => {
        const { registerServiceWorker } = await import('../src/register');
        WorkboxMock.mockClear();
        registerServiceWorker('./my-config.json', 0);
        const call = WorkboxMock.mock.calls[0][0] as string;
        expect(call).toContain('caching-config');
    });

    it('reads caching-config from meta tag when argument is empty', async () => {
        addMeta('polyfea-sw-caching-config', './meta-config.json');
        const { registerServiceWorker } = await import('../src/register');
        registerServiceWorker('', 0);
        const call = WorkboxMock.mock.calls[0][0] as string;
        expect(call).toContain('caching-config');
    });

    it('skips caching-config param when no config path and no meta tag', async () => {
        const { registerServiceWorker } = await import('../src/register');
        registerServiceWorker();
        const call = WorkboxMock.mock.calls[0][0] as string;
        expect(call).not.toContain('caching-config');
    });

    it('appends reconcile-interval param when provided', async () => {
        const { registerServiceWorker } = await import('../src/register');
        WorkboxMock.mockClear();
        registerServiceWorker('', 60);
        const call = WorkboxMock.mock.calls[0][0] as string;
        expect(call).toContain('reconcile-interval=60');
    });

    it('reads reconcile-interval from meta tag when argument is 0', async () => {
        addMeta('polyfea-sw-reconcile-interval', '90');
        const { registerServiceWorker } = await import('../src/register');
        registerServiceWorker('', 0);
        const call = WorkboxMock.mock.calls[0][0] as string;
        expect(call).toContain('reconcile-interval=90');
    });

    it('skips reconcile-interval param when value is 0 and no meta tag', async () => {
        const { registerServiceWorker } = await import('../src/register');
        registerServiceWorker('', 0);
        const call = WorkboxMock.mock.calls[0][0] as string;
        expect(call).not.toContain('reconcile-interval');
    });

    it('includes base-path in query string', async () => {
        Object.defineProperty(document, 'baseURI', {
            value: 'http://localhost/myapp/',
            writable: true,
            configurable: true,
        });
        const { registerServiceWorker } = await import('../src/register');
        registerServiceWorker();
        const call = WorkboxMock.mock.calls[0][0] as string;
        expect(call).toContain('base-path');
    });

    it('uses scope from polyfea-sw-scope meta tag', async () => {
        addMeta('polyfea-sw-scope', '/custom-scope/');
        const { registerServiceWorker } = await import('../src/register');
        registerServiceWorker();
        expect(WorkboxMock).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ scope: '/custom-scope/' })
        );
    });

    it('falls back to baseURI pathname for scope when no meta tag', async () => {
        Object.defineProperty(document, 'baseURI', {
            value: 'http://localhost/app/',
            writable: true,
            configurable: true,
        });
        const { registerServiceWorker } = await import('../src/register');
        registerServiceWorker();
        expect(WorkboxMock).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ scope: '/app/' })
        );
    });

    it('does not register when serviceWorker is not in navigator', async () => {
        // Remove the serviceWorker property entirely so `'serviceWorker' in navigator` returns false
        const navigatorProto = Object.getPrototypeOf(navigator);
        const origDesc = Object.getOwnPropertyDescriptor(globalThis.navigator, 'serviceWorker') ||
                         Object.getOwnPropertyDescriptor(navigatorProto, 'serviceWorker');
        // Delete from own properties
        try { delete (globalThis.navigator as any).serviceWorker; } catch (_) {}
        // Redefine as non-existent via defineProperty with value=undefined but unenumerable
        // The safest way is to use a navigator without serviceWorker key
        // Actually we need 'serviceWorker' NOT in navigator - use defineProperty on a fresh object
        const navWithoutSW = Object.create(Object.getPrototypeOf(navigator));
        Object.defineProperty(globalThis, 'navigator', {
            value: navWithoutSW,
            writable: true,
            configurable: true,
        });

        const { registerServiceWorker } = await import('../src/register');
        WorkboxMock.mockClear();
        registerServiceWorker();
        expect(WorkboxMock).not.toHaveBeenCalled();
        // restore original navigator
        Object.defineProperty(globalThis, 'navigator', {
            value: Object.prototype,
            writable: true,
            configurable: true,
        });
        // Restore by redefining with old descriptor or just set the mock back
        Object.defineProperty(globalThis.navigator, 'serviceWorker', {
            value: { register: vi.fn() },
            writable: true,
            configurable: true,
        });
    });

    it('auto-registers on module import', async () => {
        // Importing the module calls registerServiceWorker() at the bottom
        await import('../src/register');
        expect(WorkboxMock).toHaveBeenCalled();
    });
});
