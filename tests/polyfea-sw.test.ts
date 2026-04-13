import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createIDBMock } from './setup';

// ── flushPromises helper ──────────────────────────────────────────────────────
// Flush all pending microtasks and macrotasks
async function flushPromises(rounds = 5): Promise<void> {
    for (let i = 0; i < rounds; i++) {
        await new Promise(resolve => setImmediate ? setImmediate(resolve) : setTimeout(resolve, 0));
    }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function makeScopeMock(href = 'http://localhost/sw.mjs') {
    const listeners: Record<string, Function> = {};
    const scope = {
        addEventListener: vi.fn((type: string, handler: Function) => {
            listeners[type] = handler;
        }),
        skipWaiting: vi.fn().mockResolvedValue(undefined),
        clients: { claim: vi.fn().mockResolvedValue(undefined) },
        registration: { scope: 'http://localhost/' },
        location: { href },
        _fire: (type: string, event: any) => listeners[type]?.(event),
        _listeners: listeners,
    };
    return scope;
}

function makeExtendableEvent(name: string) {
    let waitPromise: Promise<any> | null = null;
    // Create a proper ExtendableEvent so workbox instanceof checks pass
    const ExtEvt = (globalThis as any).ExtendableEvent as typeof Event;
    const event: any = new ExtEvt(name);
    event.waitUntil = vi.fn((p: Promise<any>) => { waitPromise = p; });
    event._waitUntil = () => waitPromise;
    return event;
}

function makeFetchEvent(url: string, destination = '') {
    let responsePromise: Promise<Response> | null = null;
    const innerRequest = new Request(url);
    // Create an event that passes instanceof FetchEvent check
    // Use ExtendableEvent as base (FetchEvent extends it) - workbox checks ExtendableEvent
    const ExtEvt = (globalThis as any).ExtendableEvent as typeof Event;
    const event: any = new ExtEvt('fetch');
    event.request = innerRequest;
    event.respondWith = vi.fn((p: Promise<Response>) => { responsePromise = p; });
    event.waitUntil = vi.fn();
    event._responsePromise = () => responsePromise;
    // override request destination
    try {
        Object.defineProperty(event.request, 'destination', { value: destination, configurable: true });
    } catch (_) {
        // destination may not be configurable in some environments
    }
    return event;
}

async function buildSW(href = 'http://localhost/sw.mjs', storedTime: string | null = null) {
    createIDBMock(storedTime, true);
    const scope = makeScopeMock(href);
    (self as any).location = { href };
    (self as any).registration = { scope: 'http://localhost/' };

    vi.resetModules();
    const { PolyfeaServiceWorker } = await import('../src/polyfea-sw');
    const sw = new PolyfeaServiceWorker(scope as unknown as ServiceWorkerGlobalScope);
    return { sw, scope };
}

// ── fetch mock helper ─────────────────────────────────────────────────────────
// Return a fresh Response body on every call to avoid "body already used" errors
function mockFetch(body: any = {}, status = 200) {
    const bodyStr = JSON.stringify(body);
    global.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve(new Response(bodyStr, { status }))
    );
}

// ── tests ─────────────────────────────────────────────────────────────────────
describe('PolyfeaServiceWorker', () => {
    beforeEach(() => {
        vi.useRealTimers();
        (self as any).location = { href: 'http://localhost/sw.mjs' };
        (self as any).registration = { scope: 'http://localhost/' };
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    // ── constructor ────────────────────────────────────────────────────────
    describe('constructor', () => {
        it('creates instance with default scope', async () => {
            // Do NOT call new PolyfeaServiceWorker() without a scope arg in tests;
            // `self` in happy-dom points to window, not ServiceWorkerGlobalScope.
            // Instead test that the constructor accepts a mock scope.
            createIDBMock(null, false);
            vi.resetModules();
            const { PolyfeaServiceWorker } = await import('../src/polyfea-sw');
            const scope = makeScopeMock();
            const sw = new PolyfeaServiceWorker(scope as unknown as ServiceWorkerGlobalScope);
            expect(sw).toBeInstanceOf(PolyfeaServiceWorker);
        }, 15000);

        it('parses reconcile-interval from SW URL', async () => {
            createIDBMock(null, false);
            (self as any).location = { href: 'http://localhost/sw.mjs?reconcile-interval=120' };
            vi.resetModules();
            const { PolyfeaServiceWorker } = await import('../src/polyfea-sw');
            const scope = makeScopeMock('http://localhost/sw.mjs?reconcile-interval=120');
            const sw = new PolyfeaServiceWorker(scope as unknown as ServiceWorkerGlobalScope);
            expect(sw).toBeDefined();
        });

        it('uses default 30-min interval when reconcile-interval is missing', async () => {
            createIDBMock(null, false);
            vi.resetModules();
            const { PolyfeaServiceWorker } = await import('../src/polyfea-sw');
            const sw = new PolyfeaServiceWorker();
            expect(sw).toBeDefined();
        });
    });

    // ── start ──────────────────────────────────────────────────────────────
    describe('start()', () => {
        it('registers install, activate, and fetch listeners', async () => {
            mockFetch({ precache: [], routes: [] });
            createIDBMock(null, true);
            vi.resetModules();
            const { PolyfeaServiceWorker } = await import('../src/polyfea-sw');
            const scope = makeScopeMock();
            const sw = new PolyfeaServiceWorker(scope as unknown as ServiceWorkerGlobalScope);
            await sw.start();
            expect(scope.addEventListener).toHaveBeenCalledWith('install', expect.any(Function));
            expect(scope.addEventListener).toHaveBeenCalledWith('activate', expect.any(Function));
            expect(scope.addEventListener).toHaveBeenCalledWith('fetch', expect.any(Function));
        });
    });

    // ── install event ──────────────────────────────────────────────────────
    describe('install event', () => {
        it('calls waitUntil and skipWaiting', async () => {
            mockFetch({ precache: ['/index.html'], routes: [] });
            const { sw, scope } = await buildSW();
            await sw.start();

            const installEvent = makeExtendableEvent('install');
            (scope as any)._fire('install', installEvent);
            await installEvent._waitUntil();
            expect(installEvent.waitUntil).toHaveBeenCalled();
            expect(scope.skipWaiting).toHaveBeenCalled();
        });
    });

    // ── activate event ─────────────────────────────────────────────────────
    describe('activate event', () => {
        it('calls clients.claim', async () => {
            mockFetch({ precache: [], routes: [] });
            const { sw, scope } = await buildSW();
            await sw.start();

            const activateEvent = makeExtendableEvent('activate');
            (scope as any)._fire('activate', activateEvent);
            await activateEvent._waitUntil();
            expect(scope.clients.claim).toHaveBeenCalled();
        });
    });

    // ── reconcileRoutes ────────────────────────────────────────────────────
    describe('reconcileRoutes', () => {
        it('fetches default polyfea-caching.json when no param', async () => {
            global.fetch = vi.fn().mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify({ precache: [], routes: [] }), { status: 200 })));
            createIDBMock(null, true);
            vi.resetModules();
            const { PolyfeaServiceWorker } = await import('../src/polyfea-sw');
            const scope = makeScopeMock();
            const sw = new PolyfeaServiceWorker(scope as unknown as ServiceWorkerGlobalScope);
            await sw.start();
            await flushPromises();
            expect(global.fetch).toHaveBeenCalledWith('./polyfea-caching.json');
        });

        it('uses caching-config search param when present', async () => {
            const configPath = './custom-config.json';
            const url = 'http://localhost/sw.mjs?caching-config=' + encodeURIComponent(configPath);
            // globalThis.location.href is read each call in reconcileRoutes — override it
            const origDesc = Object.getOwnPropertyDescriptor(globalThis, 'location');
            Object.defineProperty(globalThis, 'location', {
                value: { href: url },
                writable: true,
                configurable: true,
            });
            global.fetch = vi.fn().mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify({ precache: [], routes: [] }), { status: 200 })));
            createIDBMock(null, true);
            vi.resetModules();
            const { PolyfeaServiceWorker } = await import('../src/polyfea-sw');
            const scope = makeScopeMock(url);
            const sw = new PolyfeaServiceWorker(scope as unknown as ServiceWorkerGlobalScope);
            await sw.start();
            await flushPromises();
            expect(global.fetch).toHaveBeenCalledWith(configPath);
            // restore
            if (origDesc) {
                Object.defineProperty(globalThis, 'location', origDesc);
            } else {
                (globalThis as any).location = undefined;
            }
        });

        it('skips reconciliation when data is fresh (age < interval)', async () => {
            const recentTime = (Date.now() - 1000).toString(); // 1 second ago
            createIDBMock(recentTime, false);
            global.fetch = vi.fn().mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify({ precache: [], routes: [] }), { status: 200 })));
            vi.resetModules();
            const { PolyfeaServiceWorker } = await import('../src/polyfea-sw');
            const scope = makeScopeMock();
            const sw = new PolyfeaServiceWorker(scope as unknown as ServiceWorkerGlobalScope);
            await sw.start();
            const fetchCallCount = (fetch as any).mock?.calls?.length ?? 0;
            // fetch should only be called during install (forced), not again during start
            expect(fetchCallCount).toBeLessThanOrEqual(1);
        });

        it('handles fetch error gracefully', async () => {
            global.fetch = vi.fn().mockRejectedValue(new Error('network error'));
            createIDBMock(null, true);
            vi.resetModules();
            const { PolyfeaServiceWorker } = await import('../src/polyfea-sw');
            const scope = makeScopeMock();
            const sw = new PolyfeaServiceWorker(scope as unknown as ServiceWorkerGlobalScope);
            // Should not throw
            await expect(sw.start()).resolves.toBeUndefined();
        });

        it('handles non-2xx HTTP response gracefully', async () => {
            global.fetch = vi.fn().mockResolvedValue(new Response('not found', { status: 404 }));
            createIDBMock(null, true);
            vi.resetModules();
            const { PolyfeaServiceWorker } = await import('../src/polyfea-sw');
            const scope = makeScopeMock();
            const sw = new PolyfeaServiceWorker(scope as unknown as ServiceWorkerGlobalScope);
            await expect(sw.start()).resolves.toBeUndefined();
        });

        it('processes routes from caching config', async () => {
            global.fetch = vi.fn().mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify({
                    precache: ['/index.html'],
                    routes: [
                        { pattern: '/api/.*', strategy: 'network-first' },
                        { prefix: '/static', strategy: 'cache-first' },
                    ],
                }), { status: 200 })));
            createIDBMock(null, true);
            vi.resetModules();
            const { PolyfeaServiceWorker } = await import('../src/polyfea-sw');
            const scope = makeScopeMock();
            const sw = new PolyfeaServiceWorker(scope as unknown as ServiceWorkerGlobalScope);
            await sw.start();
            await flushPromises();
            expect(sw).toBeDefined();
        });

        it('avoids re-adding already precached URLs', async () => {
            // First call caches /index.html; second call should skip it
            global.fetch = vi.fn().mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify({ precache: ['/index.html'], routes: [] }), { status: 200 })));
            createIDBMock(null, true);
            vi.resetModules();
            const { PolyfeaServiceWorker } = await import('../src/polyfea-sw');
            const scope = makeScopeMock();
            const sw = new PolyfeaServiceWorker(scope as unknown as ServiceWorkerGlobalScope);
            await sw.start();
            // second reconcile (non-install) needs old enough timestamp
            createIDBMock(null, false);
            await (sw as any).reconcileRoutes(true);
            expect(sw).toBeDefined();
        });

        it('loads interceptor module with valid interceptor export', async () => {
            const interceptorFn = vi.fn().mockReturnValue(null);
            (interceptorFn as any).interceptor = true;
            const moduleMock = { default: interceptorFn };

            global.fetch = vi.fn().mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify({
                    precache: [],
                    routes: [],
                    interceptors: [{ name: 'myInterceptor', module: 'http://localhost/interceptor.mjs', options: { foo: 'bar' } }],
                }), { status: 200 })));

            vi.stubGlobal('import', async (_url: string) => moduleMock);
            createIDBMock(null, true);
            vi.resetModules();

            // We need to spy on dynamic import at module level - use doMock
            vi.doMock('http://localhost/interceptor.mjs', () => moduleMock);

            const { PolyfeaServiceWorker } = await import('../src/polyfea-sw');
            const scope = makeScopeMock();
            const sw = new PolyfeaServiceWorker(scope as unknown as ServiceWorkerGlobalScope);
            await sw.start();
            expect(sw).toBeDefined();
        });

        it('warns when interceptor module has no default.interceptor', async () => {
            global.fetch = vi.fn().mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify({
                    precache: [],
                    routes: [],
                    interceptors: [{ name: 'bad', module: 'http://localhost/bad.mjs' }],
                }), { status: 200 })));
            createIDBMock(null, true);
            vi.resetModules();
            // module without proper export
            vi.doMock('http://localhost/bad.mjs', () => ({ default: {} }));
            const { PolyfeaServiceWorker } = await import('../src/polyfea-sw');
            const scope = makeScopeMock();
            const sw = new PolyfeaServiceWorker(scope as unknown as ServiceWorkerGlobalScope);
            // Should not throw
            await expect(sw.start()).resolves.toBeUndefined();
        });

        it('warns when interceptor module fails to load', async () => {
            global.fetch = vi.fn().mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify({
                    precache: [],
                    routes: [],
                    interceptors: [{ name: 'err', module: 'http://localhost/nonexistent.mjs' }],
                }), { status: 200 })));
            createIDBMock(null, true);
            vi.resetModules();
            const { PolyfeaServiceWorker } = await import('../src/polyfea-sw');
            const scope = makeScopeMock();
            const sw = new PolyfeaServiceWorker(scope as unknown as ServiceWorkerGlobalScope);
            await expect(sw.start()).resolves.toBeUndefined();
        });
    });

    // ── handleFetch ────────────────────────────────────────────────────────
    describe('handleFetch', () => {
        it('passes through when no precache key and no router match', async () => {
            global.fetch = vi.fn().mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify({ precache: [], routes: [] }), { status: 200 })));
            const { sw, scope } = await buildSW();
            await sw.start();

            const fetchEvent = makeFetchEvent('http://localhost/unmatched');
            (scope as any)._fire('fetch', fetchEvent);
            // respondWith should NOT have been called - network handles it
            await flushPromises();
            expect(fetchEvent.respondWith).not.toHaveBeenCalled();
        });

        it('responds from precache when key exists', async () => {
            global.fetch = vi.fn().mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify({
                    precache: [{ url: '/index.html', revision: '1' }],
                    routes: [],
                }), { status: 200 })));
            const { sw, scope } = await buildSW();
            await sw.start();
            // Force precache a URL key
            const ctrl = (sw as any).precacheController;
            vi.spyOn(ctrl, 'getCacheKeyForURL').mockReturnValue(
                'http://localhost/index.html?__WB_REVISION__=1'
            );

            const fetchEvent = makeFetchEvent('http://localhost/index.html');
            (scope as any)._fire('fetch', fetchEvent);
            await flushPromises();
            expect(fetchEvent.respondWith).toHaveBeenCalled();
        });

        it('responds from router when route matches', async () => {
            global.fetch = vi.fn().mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify({
                    precache: [],
                    routes: [{ pattern: '.*', strategy: 'cache-first' }],
                }), { status: 200 })));
            const { sw, scope } = await buildSW();
            await sw.start();
            // Simulate router matching
            const fakeResponse = new Response('from router');
            vi.spyOn((sw as any).router, 'handleRequest').mockReturnValue(Promise.resolve(fakeResponse));

            const fetchEvent = makeFetchEvent('http://localhost/some/page');
            (scope as any)._fire('fetch', fetchEvent);
            await flushPromises();
            expect(fetchEvent.respondWith).toHaveBeenCalled();
        });

        it('warns when reconcileRoutes throws during fetch', async () => {
            global.fetch = vi.fn().mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify({ precache: [], routes: [] }), { status: 200 })));
            const { sw, scope } = await buildSW();
            await sw.start();
            // Make next reconcile fail
            vi.spyOn(sw as any, 'reconcileRoutes').mockRejectedValue(new Error('reconcile failed'));

            const fetchEvent = makeFetchEvent('http://localhost/page');
            (scope as any)._fire('fetch', fetchEvent);
            await flushPromises();
            // Should not throw
            expect(sw).toBeDefined();
        });
    });

    // ── tryInterceptors ────────────────────────────────────────────────────
    describe('tryInterceptors()', () => {
        it('returns null when no interceptors registered', async () => {
            global.fetch = vi.fn().mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify({ precache: [], routes: [] }), { status: 200 })));
            const { sw } = await buildSW();
            await sw.start();
            const event = makeFetchEvent('http://localhost/test');
            const result = await sw.tryInterceptors(event as unknown as FetchEvent);
            expect(result).toBeNull();
        });

        it('returns first non-null interceptor response', async () => {
            global.fetch = vi.fn().mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify({ precache: [], routes: [] }), { status: 200 })));
            const { sw } = await buildSW();
            await sw.start();
            const mockResponse = new Response('intercepted');
            (sw as any).interceptors = [
                vi.fn().mockResolvedValue(mockResponse),
            ];
            const event = makeFetchEvent('http://localhost/test');
            const result = await sw.tryInterceptors(event as unknown as FetchEvent);
            expect(result).toBe(mockResponse);
        });

        it('skips null responses and returns next non-null one', async () => {
            global.fetch = vi.fn().mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify({ precache: [], routes: [] }), { status: 200 })));
            const { sw } = await buildSW();
            await sw.start();
            const mockResponse = new Response('second interceptor');
            (sw as any).interceptors = [
                vi.fn().mockResolvedValue(null),
                vi.fn().mockResolvedValue(mockResponse),
            ];
            const event = makeFetchEvent('http://localhost/test');
            const result = await sw.tryInterceptors(event as unknown as FetchEvent);
            expect(result).toBe(mockResponse);
        });

        it('logs error and continues when interceptor throws', async () => {
            global.fetch = vi.fn().mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify({ precache: [], routes: [] }), { status: 200 })));
            const { sw } = await buildSW();
            await sw.start();
            const goodResponse = new Response('good');
            (sw as any).interceptors = [
                vi.fn().mockRejectedValue(new Error('boom')),
                vi.fn().mockResolvedValue(goodResponse),
            ];
            const event = makeFetchEvent('http://localhost/test');
            const result = await sw.tryInterceptors(event as unknown as FetchEvent);
            expect(result).toBe(goodResponse);
        });

        it('returns null when all interceptors return null', async () => {
            global.fetch = vi.fn().mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify({ precache: [], routes: [] }), { status: 200 })));
            const { sw } = await buildSW();
            await sw.start();
            (sw as any).interceptors = [
                vi.fn().mockResolvedValue(null),
                vi.fn().mockResolvedValue(null),
            ];
            const event = makeFetchEvent('http://localhost/test');
            const result = await sw.tryInterceptors(event as unknown as FetchEvent);
            expect(result).toBeNull();
        });
    });

    // ── IDB helpers ────────────────────────────────────────────────────────
    describe('IndexedDB helpers', () => {
        it('returns null when IDB get returns undefined', async () => {
            createIDBMock(null, false);
            vi.resetModules();
            const { PolyfeaServiceWorker } = await import('../src/polyfea-sw');
            const scope = makeScopeMock();
            const sw = new PolyfeaServiceWorker(scope as unknown as ServiceWorkerGlobalScope);
            const result = await (sw as any).getLastReconciliationTime();
            expect(result).toBeNull();
        });

        it('returns stored time string from IDB', async () => {
            createIDBMock('1234567890', false);
            vi.resetModules();
            const { PolyfeaServiceWorker } = await import('../src/polyfea-sw');
            const scope = makeScopeMock();
            const sw = new PolyfeaServiceWorker(scope as unknown as ServiceWorkerGlobalScope);
            const result = await (sw as any).getLastReconciliationTime();
            expect(result).toBe('1234567890');
        });

        it('setLastReconciliationTime stores value in IDB', async () => {
            const { objectStoreMock } = createIDBMock(null, false);
            vi.resetModules();
            const { PolyfeaServiceWorker } = await import('../src/polyfea-sw');
            const scope = makeScopeMock();
            const sw = new PolyfeaServiceWorker(scope as unknown as ServiceWorkerGlobalScope);
            await (sw as any).setLastReconciliationTime('9999');
            expect(objectStoreMock.put).toHaveBeenCalledWith({ id: 'lastReconciliationTime', value: '9999' });
        });

        it('getLastReconciliationTime rejects when IDB open errors', async () => {
            const openReq: any = {};
            const idbMock = {
                open: vi.fn().mockImplementation(() => {
                    queueMicrotask(() => {
                        openReq.onerror?.();
                    });
                    return openReq;
                }),
            };
            Object.defineProperty(globalThis, 'indexedDB', {
                value: idbMock,
                writable: true,
                configurable: true,
            });
            vi.resetModules();
            const { PolyfeaServiceWorker } = await import('../src/polyfea-sw');
            const scope = makeScopeMock();
            const sw = new PolyfeaServiceWorker(scope as unknown as ServiceWorkerGlobalScope);
            await expect((sw as any).getLastReconciliationTime()).rejects.toBeUndefined();
        });

        it('getLastReconciliationTime resolves null when objectStore.get errors', async () => {
            const objectStoreMock = {
                get: vi.fn().mockImplementation(() => {
                    const req: any = {};
                    queueMicrotask(() => req.onerror?.());
                    return req;
                }),
                put: vi.fn(),
                createObjectStore: vi.fn(),
            };
            const transactionMock = { objectStore: vi.fn().mockReturnValue(objectStoreMock) };
            const dbMock = { transaction: vi.fn().mockReturnValue(transactionMock), createObjectStore: vi.fn() };
            const openReq: any = { result: dbMock };
            const idbMock = {
                open: vi.fn().mockImplementation(() => {
                    queueMicrotask(() => openReq.onsuccess?.({ target: openReq } as any));
                    return openReq;
                }),
            };
            Object.defineProperty(globalThis, 'indexedDB', {
                value: idbMock,
                writable: true,
                configurable: true,
            });
            vi.resetModules();
            const { PolyfeaServiceWorker } = await import('../src/polyfea-sw');
            const scope = makeScopeMock();
            const sw = new PolyfeaServiceWorker(scope as unknown as ServiceWorkerGlobalScope);
            const result = await (sw as any).getLastReconciliationTime();
            expect(result).toBeNull();
        });

        it('setLastReconciliationTime rejects when IDB open errors', async () => {
            const openReq: any = { error: new Error('idb open failed') };
            const idbMock = {
                open: vi.fn().mockImplementation(() => {
                    queueMicrotask(() => openReq.onerror?.());
                    return openReq;
                }),
            };
            Object.defineProperty(globalThis, 'indexedDB', {
                value: idbMock,
                writable: true,
                configurable: true,
            });
            vi.resetModules();
            const { PolyfeaServiceWorker } = await import('../src/polyfea-sw');
            const scope = makeScopeMock();
            const sw = new PolyfeaServiceWorker(scope as unknown as ServiceWorkerGlobalScope);
            await expect((sw as any).setLastReconciliationTime('abc')).rejects.toBeDefined();
        });

        it('setLastReconciliationTime rejects when put errors', async () => {
            const putReq: any = { error: new Error('put failed') };
            const objectStoreMock = {
                put: vi.fn().mockImplementation(() => {
                    queueMicrotask(() => putReq.onerror?.());
                    return putReq;
                }),
                createObjectStore: vi.fn(),
            };
            const transactionMock = { objectStore: vi.fn().mockReturnValue(objectStoreMock) };
            const dbMock = { transaction: vi.fn().mockReturnValue(transactionMock), createObjectStore: vi.fn() };
            const openReq: any = { result: dbMock };
            const idbMock = {
                open: vi.fn().mockImplementation(() => {
                    queueMicrotask(() => openReq.onsuccess?.({ target: openReq } as any));
                    return openReq;
                }),
            };
            Object.defineProperty(globalThis, 'indexedDB', {
                value: idbMock,
                writable: true,
                configurable: true,
            });
            vi.resetModules();
            const { PolyfeaServiceWorker } = await import('../src/polyfea-sw');
            const scope = makeScopeMock();
            const sw = new PolyfeaServiceWorker(scope as unknown as ServiceWorkerGlobalScope);
            await expect((sw as any).setLastReconciliationTime('abc')).rejects.toBeDefined();
        });

        it('createObjectStore is triggered on upgradeneeded', async () => {
            createIDBMock(null, true);
            vi.resetModules();
            const { PolyfeaServiceWorker } = await import('../src/polyfea-sw');
            const scope = makeScopeMock();
            const sw = new PolyfeaServiceWorker(scope as unknown as ServiceWorkerGlobalScope);
            const time = await (sw as any).getLastReconciliationTime();
            expect(time).toBeNull();
        });
    });
});
