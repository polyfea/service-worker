import { PrecacheEntry } from "workbox-precaching";
import { Route, RegExpRoute, NavigationRoute, Router } from 'workbox-routing';
import { NetworkOnly, CacheFirst, CacheOnly, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { RouteMatchCallbackOptions, WorkboxPlugin } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import {BackgroundSyncPlugin} from 'workbox-background-sync';


/**
 * Options for defining a Polyfea route. One of prefix, pattern, or destination must be specified.
 */
export interface PolyfeaRouteOptions {

    /**
     * prefix to meatch route. either relative to base url or absolute path
     */
    prefix?: string;
    /**
     * Regular expression to match the route.
     */
    pattern?: string;

    /**
     * If specified, the route will only match requests with the specified destination matching the value.
     */
    destination?: string;

    /**
     * Cache strategy to use for this route. Defaults to "cache-first".
     */
    strategy?: "cache-first" | "network-first" | "cache-only" | "network-only" | "stale-while-revalidate";

    /**
     * If specified, the cached entries will be deleted after the specified time in seconds.
     * @see [workbox-expiration](https://developer.chrome.com/docs/workbox/modules/workbox-expiration)
     */
    maxAgeSeconds?: number;

    /**
     * If specified, failing requests are retried until the syncRetentionMinutes is not reached.
     * @see [workbox-background-sync](https://developer.chrome.com/docs/workbox/modules/workbox-background-sync)
     */
    syncRetentionMinutes?: number;

    /**
     * Request method to cache the response. Defaults to ['GET'].
     */
    method?: 'DELETE' | 'GET' | 'HEAD' | 'PATCH' | 'POST' | 'PUT';

    /**
     * Allowed response statuses to put response into cache.
     * @see [workbox-cacheable-response](https://developer.chrome.com/docs/workbox/modules/workbox-cacheable-response)
     * @example [0, 200, 404]
     * @defaultValue [0, 200, 201, 202, 204].
     */
    statuses?: Array<number>;
}

/**
 * Caching configuration for the Polyfea route. The caching configuration is 
 * loaded dynamically from the specified URL or the default polyfea-caching.json file.
 * 
 * @see (@link registerServiceWorker)
 */
export interface Caching {
    /**
     * Array of precache entries or URLs to precache durring install or reconcilation.
     */
    precache: Array<PrecacheEntry | string>;

    /**
     * Array of Polyfea route options.
     */
    routes: Array<PolyfeaRouteOptions>;
}

/**
 * Represents a Polyfea route that extends the RegExpRoute class.
 */
export class PolyfeaRoute extends RegExpRoute {
    /**
     * Creates a new instance of the PolyfeaRoute class.
     * @param route - The Polyfea route options.
     */
    constructor(route: PolyfeaRouteOptions) {

        const pattern = new RegExp(route.pattern || '.*');

        let prefix = route.prefix || '';
        if (prefix) {
            let basePath = decodeURIComponent(
                new URL(globalThis.location.href).
                    searchParams.
                    get('base-path') || '');
            if (!basePath) { 
                basePath = new URL(globalThis.location.href).pathname.
                    split('/').slice(0, -1).join('/') 
            }
            // create normalized absolute path
            prefix = new URL(prefix, `http://host${basePath}/`).pathname;
        }

        let handler: any;

        const plugins: WorkboxPlugin[] = [];
        if (route.strategy !== 'network-only') {
            plugins.push(new CacheableResponsePlugin({ statuses: route.statuses || [0, 200, 201, 202, 204] }));
        }

        if (route.maxAgeSeconds) {
            plugins.push(new ExpirationPlugin({
                maxAgeSeconds: route.maxAgeSeconds,
            }));
        }

        if(route.syncRetentionMinutes) {
            plugins.push(new BackgroundSyncPlugin('polyfea', {
                maxRetentionTime: route.syncRetentionMinutes, 
              }));
            }

        switch (route.strategy) {
            case "cache-first":
                handler = new CacheFirst({ plugins });
                break;
            case "cache-only":
                handler = new CacheOnly({ plugins });
                break;
            case "network-first":
                handler = new NetworkFirst({ plugins });
                break;
            case "network-only":
                handler = new NetworkOnly({plugins});
                break;
            case "stale-while-revalidate":
                handler = new StaleWhileRevalidate({ plugins });
                break;
            default:
                handler = new CacheFirst({ plugins });
                break;
        }

        super(pattern, handler, route.method || 'GET');
        const regexpMatch = this.match;

        /**
         * Overrides the match method of the RegExpRoute class.
         * @param options - The route match options.
         * @returns True if the route matches the options, false otherwise.
         */
        this.match = (options: RouteMatchCallbackOptions) => {

            if (route.destination && options.request.destination !== route.destination) {
                return false;
            }
            if (route.prefix && !options.url.pathname.startsWith(route.prefix)) {
                return false;
            }
            
            return regexpMatch(options);
        };
    }

    /**
     * Creates a new instance of the PolyfeaRoute class from the given route options.
     * @param route - The Polyfea route options.
     * @returns A new instance of the PolyfeaRoute class.
     */
    static from(route: PolyfeaRouteOptions) {
        return new PolyfeaRoute(route);
    }
}