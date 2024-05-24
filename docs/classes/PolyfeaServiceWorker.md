[**@polyfea/service-worker**](../README.md) • **Docs**

***

[@polyfea/service-worker](../globals.md) / PolyfeaServiceWorker

# Class: PolyfeaServiceWorker

Represents the PolyfeaServiceWorker class. The service worker caching strategy is regularly reconciled 
using the configuration file specified in the service worker query parameter `caching-config' or using the default `./polyfea-caching.json` file. 
The configuration is reconciled at the interval specified in the service worker query parameter `reconcile-interval` or using the default 30 minutes.
This class handles the installation, activation, and event handling of the service worker and regular reconcilation of its caching strategies.

## Constructors

### new PolyfeaServiceWorker()

> **new PolyfeaServiceWorker**(`scope`): [`PolyfeaServiceWorker`](PolyfeaServiceWorker.md)

Creates an instance of PolyfeaServiceWorker.

#### Parameters

• **scope**: `ServiceWorkerGlobalScope`= `undefined`

The service worker global scope.

#### Returns

[`PolyfeaServiceWorker`](PolyfeaServiceWorker.md)

#### Source

sw.ts:24

## Properties

### precacheController

> `private` **precacheController**: `PrecacheController`

#### Source

sw.ts:16

***

### reconcilationInterval

> `private` **reconcilationInterval**: `number`

#### Source

sw.ts:18

***

### router

> `private` **router**: `Router`

#### Source

sw.ts:17

***

### scope

> `private` **scope**: `ServiceWorkerGlobalScope`

The service worker global scope.

#### Source

sw.ts:25

## Methods

### activate()

> `private` **activate**(`event`): `void`

Activates the service worker by activating the precache.

#### Parameters

• **event**: `ExtendableEvent`

The activate event.

#### Returns

`void`

#### Source

sw.ts:112

***

### fallback()

> `private` **fallback**(`event`): `void`

Handles the fetch event when a route is not found.

#### Parameters

• **event**: `FetchEvent`

The fetch event.

#### Returns

`void`

#### Source

sw.ts:164

***

### install()

> `private` **install**(`event`): `void`

Installs the service worker by reconciling routes and installing the precache.

#### Parameters

• **event**: `ExtendableEvent`

The install event.

#### Returns

`void`

#### Source

sw.ts:99

***

### precache()

> `private` **precache**(`event`): `void`

Handles the fetch event by responding from the precache if the URL is in the precache.

#### Parameters

• **event**: `FetchEvent`

The fetch event.

#### Returns

`void`

#### Source

sw.ts:124

***

### reconcileRoutes()

> `private` **reconcileRoutes**(): `Promise`\<`void`\>

Reconciles the routes by fetching the caching configuration and updating the precache and router.

#### Returns

`Promise`\<`void`\>

#### Source

sw.ts:58

***

### runtime()

> `private` **runtime**(`event`): `void`

Handles the fetch event by responding from the router if a matching route is found.

#### Parameters

• **event**: `FetchEvent`

The fetch event.

#### Returns

`void`

#### Source

sw.ts:143

***

### start()

> **start**(): `Promise`\<`void`\>

Starts the service worker by adding event listeners and setting up route reconciliation.

#### Returns

`Promise`\<`void`\>

#### Source

sw.ts:41
