[**@polyfea/service-worker**](../README.md) • **Docs**

***

[@polyfea/service-worker](../globals.md) / PolyfeaRouteOptions

# Interface: PolyfeaRouteOptions

Options for defining a Polyfea route.

## Properties

### destination?

> `optional` **destination**: `string`

If specified, the route will only match requests with the specified destination matching the value.

#### Source

polyfea-route.ts:22

***

### maxAgeSeconds?

> `optional` **maxAgeSeconds**: `number`

If specified, the cached entries will be deleted after the specified time in seconds.

#### See

[workbox-expiration](https://developer.chrome.com/docs/workbox/modules/workbox-expiration)

#### Source

polyfea-route.ts:33

***

### method?

> `optional` **method**: `"DELETE"` \| `"GET"` \| `"HEAD"` \| `"PATCH"` \| `"POST"` \| `"PUT"`

Request method to cache the response. Defaults to ['GET'].

#### Source

polyfea-route.ts:44

***

### pattern

> **pattern**: `string`

Regular expression to match the route.

#### Source

polyfea-route.ts:17

***

### statuses?

> `optional` **statuses**: `number`[]

Allowed response statuses to put response into cache.

#### See

[workbox-cacheable-response](https://developer.chrome.com/docs/workbox/modules/workbox-cacheable-response)

#### Example

```ts
[0, 200, 404]
```

#### Default Value

```ts
[0, 200, 201, 202, 204].
```

#### Source

polyfea-route.ts:52

***

### strategy?

> `optional` **strategy**: `"cache-first"` \| `"network-first"` \| `"cache-only"` \| `"network-only"` \| `"stale-while-revalidate"`

Cache strategy to use for this route. Defaults to "cache-first".

#### Source

polyfea-route.ts:27

***

### syncRetentionMinutes?

> `optional` **syncRetentionMinutes**: `number`

If specified, failing requests are retried until the syncRetentionTime is not reached.

#### See

[workbox-background-sync](https://developer.chrome.com/docs/workbox/modules/workbox-background-sync)

#### Source

polyfea-route.ts:39
