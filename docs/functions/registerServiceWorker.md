[**@polyfea/service-worker**](../README.md) • **Docs**

***

[@polyfea/service-worker](../globals.md) / registerServiceWorker

# Function: registerServiceWorker()

> **registerServiceWorker**(`cachingConfigPath`, `configReconcileIntervalSeconds`): `void`

Registers the service worker for the application.

## Parameters

• **cachingConfigPath**: `string`= `""`

The path to the caching configuration file.

• **configReconcileIntervalSeconds**: `number`= `0`

The interval in seconds for reconciling the configuration.

## Returns

`void`

## Default Value

```ts
is the value of the meta tag with the name "polyfea-sw-caching-config".
```

## Default Value

```ts
is the value of the meta tag with the name "polyfea-sw-reconcile-interval".
```

## Source

register.ts:10
