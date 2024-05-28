// vite.config.js
import { defineConfig } from 'vite'
import EnvironmentPlugin from 'vite-plugin-environment'
import dts from "vite-plugin-dts";



export default defineConfig(({ command, mode, isSsrBuild, isPreview }) => {


    return {
        resolve: {
            alias: {
                path: "path-browserify",
            },
        },

        server: {
            watch: {
                usePolling: true
            }
        },

        plugins: [
            EnvironmentPlugin({
                NODE_ENV: mode,
            }),
            dts({ insertTypesEntry: true }),
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
    };
})