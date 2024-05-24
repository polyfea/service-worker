
import { PrecacheController, PrecacheRoute } from 'workbox-precaching';
import { setCacheNameDetails } from 'workbox-core';
import { Router } from 'workbox-routing';
import { Caching, PolyfeaRoute } from './polyfea-route';
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
        this.reconcilationInterval = (parseInt(ri || "") || (60 * 30))*1000;
    }

    /**
     * Starts the service worker by adding event listeners and setting up route reconciliation.
     */
    public async start() {
        this.scope.addEventListener('install', (event: ExtendableEvent) => this.install(event));
        this.scope.addEventListener('activate', (event: ExtendableEvent) => this.activate(event));
        this.scope.addEventListener('fetch', (event: FetchEvent) => this.precache(event));
        this.scope.addEventListener('fetch', (event: FetchEvent) => this.runtime(event));
        this.scope.addEventListener('fetch', (event: FetchEvent) => this.fallback(event));

        setInterval(() => {
            this.reconcileRoutes();
        }, this.reconcilationInterval);

    }

    /**
     * @private
     * Reconciles the routes by fetching the caching configuration and updating the precache and router.
     */
    private async reconcileRoutes() {

        const lastReconciliationTime = localStorage.getItem('lastReconciliationTime');
        let age: number = 0;
        if (lastReconciliationTime) {
            age = Date.now() + 1000 - parseInt(lastReconciliationTime);
        }

        if (age && age < this.reconcilationInterval) {
            logger.debug("Skipping reconciliation - data are fresh ");
            return;
        }

        const config = new URL(globalThis.location.href).searchParams.get('caching-config');
        try {
            const response = await fetch(config || "./polyfea-caching.json");
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
                logger.info(`Service worker reconciled: precached ${caching.precache?.length || 0} files and added ${caching.routes?.length || 0} routes`);
            }
            localStorage.setItem('lastReconciliationTime', Date.now().toString());
        } catch (error) {
            logger.warn({ err: error }, "Failed to reconcile routes");
        }
    }

    /**
     * @private
     * Installs the service worker by reconciling routes and installing the precache.
     * @param event - The install event.
     */
    private install(event: ExtendableEvent) {
        event.waitUntil((async () => {
            logger.debug("Installing");
            await this.reconcileRoutes();
            await this.precacheController.install(event)
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
        })());
    }

    /**
     * @private
     * Handles the fetch event by responding from the precache if the URL is in the precache.
     * @param event - The fetch event.
     */
    private precache(event: FetchEvent) {
        const log = logger.child({ request: event.request })
        log.trace({ request: event.request }, `trying to fetch from the precache ${event.request.url}`);

        const { request } = event;

        const key = this.precacheController.getCacheKeyForURL(request.url);
        if (key) {
            log.debug(`Responded from precache: ${event.request.url}`);
            event.respondWith(caches.match(key) as Promise<Response>);
            return;
        }
    }

    /**
     * @private
     * Handles the fetch event by responding from the router if a matching route is found.
     * @param event - The fetch event.
     */
    private runtime(event: FetchEvent) {
        const log = logger.child({ request: event.request })
        log.trace({ request: event.request }, `trying to fetch from the router ${event.request.url}`);

        const { request } = event;

        const responsePromise = this.router.handleRequest({
            event,
            request,
        });
        if (responsePromise) {
            log.debug(`Responded from router: ${event.request.url}`);
            event.respondWith(responsePromise);
        }
    }

    /**
     * @private
     * Handles the fetch event when a route is not found.
     * @param event - The fetch event.
     */
    private fallback(event: FetchEvent) {
        logger.debug(`Route not found, ignoring: ${event.request.url}`);
    }
}

const polyfeaServiceWorker = new PolyfeaServiceWorker();
polyfeaServiceWorker.start();

