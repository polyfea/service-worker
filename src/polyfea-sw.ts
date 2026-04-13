
import { PrecacheController, PrecacheRoute } from 'workbox-precaching';
import { setCacheNameDetails } from 'workbox-core';
import { Router } from 'workbox-routing';
import { Caching, Interceptor, PolyfeaRoute } from './polyfea-route';
import { logger } from './logger';

/**
 * Represents the PolyfeaServiceWorker class. The service worker caching strategy is regularly reconciled 
 * using the configuration file specified in the service worker query parameter `caching-config' or using the default `./polyfea-caching.json` file. 
 * The configuration is reconciled at the interval specified in the service worker query parameter `reconcile-interval` or using the default 30 minutes.
 * This class handles the installation, activation, and event handling of the service worker and regular reconcilation of its caching strategies.
 */
export class PolyfeaServiceWorker {

    private precacheController: PrecacheController;
    private router = new Router();
    private reconcilationInterval: number;
    private interceptors: Array<Interceptor> = [];

    /**
     * Creates an instance of PolyfeaServiceWorker.
     * @param scope - The service worker global scope.
     */
    constructor(
        private scope: ServiceWorkerGlobalScope = self as unknown as ServiceWorkerGlobalScope) {
        setCacheNameDetails({
            prefix: 'polyfea',
            suffix: 'v1',
            precache: 'install-time',
            runtime: 'run-time',
        });

        this.precacheController = new PrecacheController();
        const ri = new URL(globalThis.location.href).searchParams.get('reconcile-interval');
        this.reconcilationInterval = (parseInt(ri || "") || (60 * 30)) * 1000;
    }

    /**
     * Starts the service worker by adding event listeners and setting up route reconciliation.
     */
    public async start() {
        // Zlúčili sme fetch eventy do JEDNÉHO listenera
        this.scope.addEventListener('install', (event: ExtendableEvent) => this.install(event));
        this.scope.addEventListener('activate', (event: ExtendableEvent) => this.activate(event));
        this.scope.addEventListener('fetch', (event: FetchEvent) => this.handleFetch(event));
        this.reconcileRoutes();
    }

    /**
     * @private
     * Reconciles the routes by fetching the caching configuration and updating the precache and router.
     */
    private async reconcileRoutes(install = false) {

        const lastReconciliationTime = await this.getLastReconciliationTime();
        let age: number = 0;
        if (lastReconciliationTime) {
            age = Date.now() + 1000 - parseInt(lastReconciliationTime);
        }

        if (!install && age && age < this.reconcilationInterval) {
            logger.debug("Skipping reconciliation - data are fresh ");
            return;
        }

        const config = decodeURIComponent(
            new URL(globalThis.location.href).
                searchParams.
                get('caching-config') || "./polyfea-caching.json") ;
        try {
            const response = await fetch(config);
            if (response.status < 300) {
                const caching = await response.json() as Caching;
                this.precacheController.addToCacheList((caching.precache || []).filter((pre) => {
                    const url = typeof pre === 'string' ? pre : pre.url;
                    return !this.precacheController.getCacheKeyForURL(url)
                }));

                this.router.routes.clear();

                caching.routes?.
                    map(PolyfeaRoute.from).
                    forEach((route: PolyfeaRoute) => this.router.registerRoute(route));

                this.interceptors = [];
                for (const interceptor of caching.interceptors || []) {
                    try {
                        const module = await import(interceptor.module);
                        if (module && module.default && module.default.interceptor) {
                            /* v8 ignore next 6 */
                            this.interceptors.push((request, event) => {
                                const resp =  module.default(request, event, interceptor.options);
                                if (resp) {
                                    logger.debug(`Request ${request.url} handled by interceptor: ${interceptor.name}`);
                                }
                                return resp;
                            });
                        } else {
                            logger.warn(`Interceptor module ${interceptor.module} does not have a default export with an interceptor function`);
                        }
                    } catch (err) {
                        logger.warn({ err }, `Failed to load interceptor module ${interceptor.module}`);
                    }
                }

                logger.info(`Service worker reconciled: precached ${caching.precache?.length || 0} files and added ${caching.routes?.length || 0} routes`);
            }
            await this.setLastReconciliationTime(Date.now().toString());
        } catch (error) {
            logger.warn({ err: error }, "Failed to reconcile routes");
        }
    }


    private async getLastReconciliationTime(): Promise<string | null> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('polyfeaDB', 1);
            request.onerror = () => reject(request.error);
            request.onupgradeneeded = () => {
                const db = request.result;
                db.createObjectStore('reconciliationTime', { keyPath: 'id' });
            };
            request.onsuccess = () => {
                const db = request.result;
                const transaction = db.transaction('reconciliationTime', 'readonly');
                const objectStore = transaction.objectStore('reconciliationTime');
                const getRequest = objectStore.get('lastReconciliationTime');
                getRequest.onerror = () => resolve(null);
                getRequest.onsuccess = () => resolve(getRequest.result?.value);
            };
        });
    }

    private async setLastReconciliationTime(value: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('polyfeaDB', 1);
            request.onerror = () => reject(request.error);
            request.onupgradeneeded = () => {
                const db = request.result;
                db.createObjectStore('reconciliationTime');
            };
            request.onsuccess = () => {
                const db = request.result;
                const transaction = db.transaction('reconciliationTime', 'readwrite');
                const objectStore = transaction.objectStore('reconciliationTime');
                const putRequest = objectStore.put({ id: 'lastReconciliationTime', value });
                putRequest.onerror = () => reject(putRequest.error);
                putRequest.onsuccess = () => resolve();
            };
        });
    }

    /**
     * @private
     * Installs the service worker by reconciling routes and installing the precache.
     * @param event - The install event.
     */
    private install(event: ExtendableEvent) {
        event.waitUntil((async () => {
            logger.debug("Installing");
            await this.reconcileRoutes(true);
            await this.precacheController.install(event);
            
            this.scope.skipWaiting(); 
        })());
    };

    /**
     * @private
     * Activates the service worker by activating the precache.
     * @param event - The activate event.
     */
    private activate(event: ExtendableEvent) {
        event.waitUntil((async () => {
            logger.debug("Activating");
            this.precacheController.activate(event)

            await this.scope.clients.claim();
        })());
    }

    /**
     * @private
     * cascading fetch handler
     */
    private handleFetch(event: FetchEvent) {
        const { request } = event;
        const log = logger.child({ request });
        this.reconcileRoutes().catch((err) => log.warn({ err }, "Failed to reconcile routes during fetch"));
        
        const precacheKey = this.precacheController.getCacheKeyForURL(request.url);
        if (precacheKey) {
            log.debug(`Responded from precache: ${request.url}`);
            event.respondWith(caches.match(precacheKey) as Promise<Response>);
            return; 
        }



        const responsePromise = this.router.handleRequest({ event, request });
        if (responsePromise) {
            log.debug(`Responded from router: ${request.url}`);
            event.respondWith(responsePromise);
            return; 
        }

        log.debug(`Route not found in SW, letting network handle it: ${request.url}`);
    }

     async tryInterceptors(event: FetchEvent): Promise<Response | null> {
        for (const interceptor of this.interceptors) {
            try {
                const response = await interceptor(event.request, event);
                if (response) {
                    return response;
                }
            } catch (error) {
                logger.error({ error }, `Interceptor ${interceptor.name} failed for ${event.request.url}`);
                
            }
        }
        return null; // No MFE handled the request
    }
}
