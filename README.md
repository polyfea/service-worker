# Service worker for Polyfea microfrontends

Implements configurable service worker with regular reconcilation of the caching strategies. This allows [Polyfea Controller](https://github.com/polyfea/polyfea-controller) to aggregate caching rules accross multiple mifrofrontends registered in the scope of the single microfrontendClass resource. The service worker is build using the [Workbox](https://developer.chrome.com/docs/workbox) framework.

## Intended usage

This package provides two module scripts in  `dist/register.mjs` and `dist/sw.mjs`. Both are intended to be served by the server at the intended scope (base url) and loaded into html page and service worker.

Example:

```html
<!DOCTYPE html>
<html>
<head>
    <base href="/pwa-scope/">
    <title>My PWA</title>
    <link rel="manifest" href="manifest.json">
    
    <script type="module" src="./@polyfea/service-worker/register.mjs"></script>
    <!-- optional configuration of the service worker 
    <meta name="polyfea-sw-caching-config" content="./polyfea-caching.json">
    <meta name="polyfea-sw-reconcile-interval" content="1800000">
    -->
</head>
<body>
    ...
</body>
```

**Important: sw.mjs must be served on the path that defines is scope, which typically means the base url. In the example above it shall be served from the path `/pwa-scope/sw.mjs`**

The precaching and runtime caching strategies are loaded and regularly reconciled from the `./polyfea-caching.json` configuration object which implements [Caching](./doc/interfaces/Caching.md). The actual patch to the configuration file and reconcilation period may be defined by metatags as depicted in the example above.

Example of the configuration file:

```json
{
    "precache": [
        { "url": "/index.html", "revision": "1" }
    ],
    "routes": [
        { "pattern": "/api/.*", "strategy": "network-only" },
        { "pattern": "/api/.*", "strategy": "network-only", "method": "POST", "syncRetentionMinutes": 60 },  
        { "pattern": "/test-data/.*", "strategy": "cache-only" },
        { "pattern": ".*", "strategy": "cache-first", "maxAgeSeconds":  86400 }
    ]

}
```

## Documentation

The package may be also bundled into existing project. See [Reference Documentation](./docs/README.md) for more informations.

## Development

Clone and run 

```sh
npm install
```

then start the project by `npm start` and open browser at [http://localhost:3000].
