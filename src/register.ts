
import { Workbox } from 'workbox-window';


/**
 * Registers the service worker for the application.
 * @param cachingConfigPath - The path to the caching configuration file. @defaultValue is the value of the meta tag with the name "polyfea-sw-caching-config".
 * @param configReconcileIntervalSeconds - The interval in seconds for reconciling the configuration. @defaultValue is the value of the meta tag with the name "polyfea-sw-reconcile-interval".
 */
export function registerServiceWorker(cachingConfigPath: string = "", configReconcileIntervalSeconds: number = 0) {
    if ('serviceWorker' in navigator) {

        const swUrl = new URL('./sw.mjs', document.baseURI);
        if (!cachingConfigPath) {
            cachingConfigPath = document.querySelector('meta[name="polyfea-sw-caching-config"]')?.getAttribute('content') || "";
        }
        if (cachingConfigPath) {
            swUrl.searchParams.set('caching-config', encodeURIComponent(cachingConfigPath));
        }

        if (!configReconcileIntervalSeconds) {
            configReconcileIntervalSeconds = parseInt(document.querySelector('meta[name="polyfea-sw-reconcile-interval"]')?.getAttribute('content') || "0");
        }

        if (configReconcileIntervalSeconds) {
            swUrl.searchParams.set('reconcile-interval', configReconcileIntervalSeconds.toString());
        }

        swUrl.searchParams.set('base-path', new URL(document.baseURI).pathname);

        const wb = new Workbox(swUrl.pathname + swUrl.search);

        wb.register();
    }
}

registerServiceWorker();