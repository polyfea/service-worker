[**@polyfea/service-worker**](../README.md) • **Docs**

***

[@polyfea/service-worker](../globals.md) / Caching

# Interface: Caching

Caching configuration for the Polyfea route. The caching configuration is 
loaded dynamically from the specified URL or the default polyfea-caching.json file.

## See

(@link registerServiceWorker)

## Properties

### precache

> **precache**: (`string` \| `PrecacheEntry`)[]

Array of precache entries or URLs to precache durring install or reconcilation.

#### Source

polyfea-route.ts:65

***

### routes

> **routes**: [`PolyfeaRouteOptions`](PolyfeaRouteOptions.md)[]

Array of Polyfea route options.

#### Source

polyfea-route.ts:70
