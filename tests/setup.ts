import { vi } from 'vitest';

// ── ExtendableEvent / FetchEvent polyfills needed by workbox ─────────────────
if (typeof (globalThis as any).ExtendableEvent === 'undefined') {
    class ExtendableEvent extends Event {
        waitUntil(_promise: Promise<any>) {}
    }
    (globalThis as any).ExtendableEvent = ExtendableEvent;
}
if (typeof (globalThis as any).FetchEvent === 'undefined') {
    class FetchEvent extends (globalThis as any).ExtendableEvent {
        request: Request;
        respondWith(_promise: Promise<Response>) {}
        constructor(type: string, init?: any) {
            super(type);
            this.request = init?.request ?? new Request('http://localhost/');
        }
    }
    (globalThis as any).FetchEvent = FetchEvent;
}

// ── IDBKeyRange / IDBRequest polyfills ──────────────────────────────────────
if (typeof globalThis.IDBKeyRange === 'undefined') {
    (globalThis as any).IDBKeyRange = {
        only: (v: any) => ({ only: v }),
        bound: (l: any, u: any) => ({ lower: l, upper: u }),
        lowerBound: (v: any) => ({ lower: v }),
        upperBound: (v: any) => ({ upper: v }),
    };
}
if (typeof globalThis.IDBRequest === 'undefined') {
    (globalThis as any).IDBRequest = class IDBRequest {};
}
if (typeof globalThis.IDBKeyRange === 'undefined') {
    (globalThis as any).IDBOpenDBRequest = class IDBOpenDBRequest {};
}

// ── Minimal ServiceWorkerGlobalScope on `self` ──────────────────────────────
const mockSelf = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    skipWaiting: vi.fn().mockResolvedValue(undefined),
    clients: {
        claim: vi.fn().mockResolvedValue(undefined),
        matchAll: vi.fn().mockResolvedValue([]),
    },
    registration: {
        scope: 'http://localhost/',
    },
    location: {
        href: 'http://localhost/sw.mjs',
    },
} as unknown as ServiceWorkerGlobalScope;

Object.defineProperty(globalThis, 'self', { value: mockSelf, writable: true });

// ── caches ───────────────────────────────────────────────────────────────────
Object.defineProperty(globalThis, 'caches', {
    value: {
        match: vi.fn().mockResolvedValue(new Response('cached')),
        open: vi.fn().mockResolvedValue({
            put: vi.fn(),
            match: vi.fn(),
            keys: vi.fn().mockResolvedValue([]),
            delete: vi.fn(),
        }),
        has: vi.fn().mockResolvedValue(false),
        keys: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockResolvedValue(true),
    },
    writable: true,
    configurable: true,
});

vi.mock('workbox-background-sync', () => {
  return {
    Queue: vi.fn().mockImplementation(function () {
      return {
        pushRequest: vi.fn(),
        replayRequests: vi.fn(),
        shiftRequest: vi.fn(),
        unshiftRequest: vi.fn(),
        popRequest: vi.fn(),
      };
    }),
    BackgroundSyncPlugin: vi.fn().mockImplementation(function () {
      return {};
    }),
  };
});

// ── Minimal IndexedDB mock ───────────────────────────────────────────────────
export function createIDBMock(storedValue: string | null = null, triggerUpgrade = false, storedConfig: object | null = null) {
    const objectStoreMock = {
        get: vi.fn().mockImplementation((key: string) => {
            const req: any = {};
            queueMicrotask(() => {
                if (key === 'cachedConfig') {
                    req.result = storedConfig
                        ? { id: 'cachedConfig', value: JSON.stringify(storedConfig) }
                        : null;
                } else {
                    // lastReconciliationTime (and any other key)
                    req.result = { id: 'lastReconciliationTime', value: storedValue };
                }
                req.onsuccess?.({ target: req } as any);
            });
            return req;
        }),
        put: vi.fn().mockImplementation(() => {
            const req: any = {};
            queueMicrotask(() => req.onsuccess?.({ target: req } as any));
            return req;
        }),
        createObjectStore: vi.fn(),
    };

    const transactionMock = {
        objectStore: vi.fn().mockReturnValue(objectStoreMock),
    };

    const dbMock = {
        transaction: vi.fn().mockReturnValue(transactionMock),
        createObjectStore: vi.fn(),
        result: null as any,
    };
    dbMock.result = dbMock;

    const openRequest: any = {
        onerror: null,
        onsuccess: null,
        onupgradeneeded: null,
        result: dbMock,
    };

    const idbMock = {
        open: vi.fn().mockImplementation(() => {
            queueMicrotask(() => {
                if (triggerUpgrade) {
                    openRequest.onupgradeneeded?.({ target: openRequest } as any);
                }
                openRequest.onsuccess?.({ target: openRequest } as any);
            });
            return openRequest;
        }),
    };

    Object.defineProperty(globalThis, 'indexedDB', {
        value: idbMock,
        writable: true,
        configurable: true,
    });

    return { idbMock, objectStoreMock, transactionMock, dbMock, openRequest };
}

// Install a default IDB mock (no stored value, no upgrade)
createIDBMock(null, false);

// Ensure caches is on self (workbox reads self.caches)
Object.defineProperty(self, 'caches', {
    value: (globalThis as any).caches,
    writable: true,
    configurable: true,
});

// ── Suppress console noise by default ───────────────────────────────────────
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'info').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});
vi.spyOn(console, 'debug').mockImplementation(() => {});
