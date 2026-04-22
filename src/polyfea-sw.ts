import { PrecacheController } from "workbox-precaching";
import { setCacheNameDetails } from "workbox-core";
import { Router } from "workbox-routing";
import { Caching, PolyfeaRoute } from "./polyfea-route";
import { logger } from "./logger";

/** interface for optional interceptor modules */
interface InterceptorModule {
  name: string;

  intercept(
    request: Request,
    event: ExtendableEvent,
    options?: any,
  ): Promise<Response> | undefined;

  activate?(): Promise<void>;
}

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
  private interceptors: Array<InterceptorModule> = [];
  private routesRestored = false;

  /**
   * Creates an instance of PolyfeaServiceWorker.
   * @param scope - The service worker global scope.
   */
  constructor(
    private scope: ServiceWorkerGlobalScope = self as unknown as ServiceWorkerGlobalScope,
  ) {
    setCacheNameDetails({
      prefix: "polyfea",
      suffix: "v1",
      precache: "install-time",
      runtime: "run-time",
    });

    this.precacheController = new PrecacheController();
    const ri = new URL(globalThis.location.href).searchParams.get("reconcile-interval");
    this.reconcilationInterval = (parseInt(ri || "") || 60 * 30) * 1000;
  }

  /**
   * Starts the service worker by adding event listeners and setting up route reconciliation.
   */
  public async start() {
    // Zlúčili sme fetch eventy do JEDNÉHO listenera
    this.scope.addEventListener("install", (event: ExtendableEvent) => this.install(event));
    this.scope.addEventListener("activate", (event: ExtendableEvent) => this.activate(event));
    this.scope.addEventListener("fetch", (event: FetchEvent) => this.handleFetch(event));
  }

  /**
   * @private
   * Reconciles the routes by fetching the caching configuration and updating the precache and router.
   */
  private async reconcileRoutes(install = false) {
    // On every SW process restart the in-memory router is empty.
    // Restore routes from the last persisted config before checking freshness.
    if (!this.routesRestored) {
      this.routesRestored = true;
      const stored = await this.getStoredConfig();
      if (stored) {
        await this.applyConfig(stored);
      }
    }

    const lastReconciliationTime = await this.getLastReconciliationTime();
    let age: number = 0;
    if (lastReconciliationTime) {
      age = Date.now() - parseInt(lastReconciliationTime); // Fix: removed erroneous +1000
    }

    if (!install && age && age < this.reconcilationInterval) {
      logger.debug("Skipping reconciliation - data are fresh ");
      return;
    }

    const config = decodeURIComponent(
      new URL(globalThis.location.href).searchParams.get("caching-config") ||
        "./polyfea-caching.json",
    );
    try {
      const response = await fetch(config);
      if (response.status < 300) {
        const caching = (await response.json()) as Caching;
        await this.applyConfig(caching, install);
        await this.setStoredConfig(caching);
        // Fix: timestamp only set on success, not on non-2xx responses
        await this.setLastReconciliationTime(Date.now().toString());
        logger.info(
          `Service worker reconciled: precached ${caching.precache?.length || 0} files and added ${caching.routes?.length || 0} routes`,
        );
      }
    } catch (error) {
      logger.warn({ err: error }, "Failed to reconcile routes");
    }
  }

  /**
   * @private
   * Applies a caching configuration to the in-memory router and interceptors.
   */
  private async applyConfig(caching: Caching, install = false): Promise<void> {
    const newPrecacheUrls = (caching.precache || []).filter((pre) => {
      const url = typeof pre === "string" ? pre : pre.url;
      return !this.precacheController.getCacheKeyForURL(url);
    });

    this.precacheController.addToCacheList(newPrecacheUrls);
    if (!install && newPrecacheUrls.length > 0) {
      try {
        const cache = await caches.open('polyfea-install-time-v1');
        const fetchPromises = newPrecacheUrls.map(async (pre) => {
          const url = typeof pre === "string" ? pre : pre.url;
          const cacheKey = this.precacheController.getCacheKeyForURL(url);
          if (cacheKey) {
            const existing = await cache.match(cacheKey);
            if (!existing) {
              const response = await fetch(url);
              if (response.ok) {
                await cache.put(cacheKey, response);
              }
            }
          }
        });
        await Promise.all(fetchPromises);
        logger.debug(`Dynamically populated missing items into install-time cache`);
      } catch (err) {
        logger.error({ err }, "Failed to dynamically populate install-time cache");
      }
    }

    this.router.routes.clear();
    caching.routes
      ?.map(PolyfeaRoute.from)
      .forEach((route: PolyfeaRoute) => this.router.registerRoute(route));

    this.interceptors = [];
    for (const interceptor of caching.interceptors || []) {
      try {
        const module = await import(interceptor.module);
        if (module && module.default && module.default.interceptor) {
          const name = interceptor.name;
          const options = interceptor.options;
          // Fix: Object.assign({}, ...) avoids mutating the live ES module export
          this.interceptors.push(
            Object.assign({}, module.default, {
              name,
              intercept: (request: Request, event: FetchEvent) => {
                const resp = module.default.interceptor(request, event, options);
                if (resp) {
                  logger.debug(`Request ${request.url} handled by interceptor: ${name}`);
                }
                return resp;
              },
            }),
          );
        } else {
          logger.warn(
            `Interceptor module ${interceptor.module} does not have a default export with an interceptor function`,
          );
        }
      } catch (err) {
        logger.warn({ err }, `Failed to load interceptor module ${interceptor.module}`);
      }
    }
  }

  private async getStoredConfig(): Promise<Caching | null> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("polyfeaDB", 1);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("reconciliationTime", { keyPath: "id" });
      };
      request.onsuccess = () => {
        const db = request.result;
        const store = db.transaction("reconciliationTime", "readonly").objectStore("reconciliationTime");
        const getRequest = store.get("cachedConfig");
        getRequest.onerror = () => resolve(null);
        getRequest.onsuccess = () => {
          const value = getRequest.result?.value;
          if (value) {
            try { resolve(JSON.parse(value) as Caching); } catch { resolve(null); }
          } else {
            resolve(null);
          }
        };
      };
    });
  }

  private async setStoredConfig(caching: Caching): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("polyfeaDB", 1);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("reconciliationTime", { keyPath: "id" });
      };
      request.onsuccess = () => {
        const db = request.result;
        const store = db.transaction("reconciliationTime", "readwrite").objectStore("reconciliationTime");
        const putRequest = store.put({ id: "cachedConfig", value: JSON.stringify(caching) });
        putRequest.onerror = () => reject(putRequest.error);
        putRequest.onsuccess = () => resolve();
      };
    });
  }

  private async getLastReconciliationTime(): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("polyfeaDB", 1);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("reconciliationTime", { keyPath: "id" });
      };
      request.onsuccess = () => {
        const db = request.result;
        const store = db.transaction("reconciliationTime", "readonly").objectStore("reconciliationTime");
        const getRequest = store.get("lastReconciliationTime");
        getRequest.onerror = () => resolve(null);
        getRequest.onsuccess = () => resolve(getRequest.result?.value ?? null);
      };
    });
  }

  private async setLastReconciliationTime(value: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("polyfeaDB", 1);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("reconciliationTime");
      };
      request.onsuccess = () => {
        const db = request.result;
        const store = db.transaction("reconciliationTime", "readwrite").objectStore("reconciliationTime");
        const putRequest = store.put({ id: "lastReconciliationTime", value });
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
    event.waitUntil(
      (async () => {
        logger.debug("Installing");
        await this.reconcileRoutes(true);
        await this.precacheController.install(event);

        this.scope.skipWaiting();
      })(),
    );
  }

  /**
   * @private
   * Activates the service worker by activating the precache.
   * @param event - The activate event.
   */
  private activate(event: ExtendableEvent) {
    event.waitUntil(
      (async () => {
        logger.debug("Activating");
        this.precacheController.activate(event);
        await this.reconcileRoutes();
        for (const interceptor of this.interceptors) {
          if (interceptor.activate) {
            try {
              await interceptor.activate();
              logger.debug(`Interceptor ${interceptor.name} activated successfully`);
            } catch (error) {
              logger.error({ error }, `Interceptor ${interceptor.name} failed to activate`);
            }
          }
        }

        await this.scope.clients.claim();
      })(),
    );
  }

  /**
   * @private
   * cascading fetch handler
   */
  private handleFetch(event: FetchEvent) {
    const { request } = event;
    const log = logger.child({ request });
    // invoke background reconcilation if needed, but do not await it - we don't want to delay the response
    setTimeout(() => this.reconcileRoutes().catch((err) =>
      log.warn({ err }, "Failed to reconcile routes during fetch"),
    ), 0);
    

    const precacheKey = this.precacheController.getCacheKeyForURL(request.url);
    if (precacheKey) {
      log.debug(`Responded from precache: ${request.url}`);
      // Fix: caches.match can return undefined; fall back to network to avoid rejecting the fetch
      event.respondWith(caches.match(precacheKey).then((r) => r ?? fetch(request)));
      return;
    }

    let responsePromise = this.tryInterceptors(event);
    if (responsePromise) {
      log.debug(`Responded from interceptor: ${request.url}`);
      event.respondWith(responsePromise);
      return;
    }

    responsePromise = this.router.handleRequest({ event, request });
    if (responsePromise) {
      log.debug(`Responded from router: ${request.url}`);
      event.respondWith(responsePromise);
      return;
    }

    log.debug(`Route not found in SW, letting network handle it: ${request.url}`);
  }

  tryInterceptors(event: FetchEvent): Promise<Response> | undefined {
    for (const interceptor of this.interceptors) {
      try {
        const response = interceptor.intercept(event.request, event);
        if (response) {
          return response;
        }
      } catch (error) {
        logger.error({ error }, `Interceptor ${interceptor.name} failed for ${event.request.url}`);
      }
    }
    return undefined; // No MFE handled the request
  }
}
