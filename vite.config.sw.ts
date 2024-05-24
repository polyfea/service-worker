// vite.config.js
import { defineConfig } from 'vite'
import EnvironmentPlugin from 'vite-plugin-environment'
import dts from "vite-plugin-dts";

export default defineConfig({
    plugins: [
        EnvironmentPlugin({
            NODE_ENV: 'development',
            DEBUG: 'false',
        }),
        dts({ insertTypesEntry: true}),
    ],

    publicDir: 'dist',

    build: {
        outDir: 'dist',
        emptyOutDir: false,
        sourcemap: true,

        lib: {
            entry: 'src/sw.ts',
            name: 'PolyfeaServiceWorker',
            fileName: 'sw'
        },
        
    }
})