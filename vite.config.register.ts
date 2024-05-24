// vite.config.js
import { defineConfig } from 'vite'
import EnvironmentPlugin from 'vite-plugin-environment'

export default defineConfig({
    plugins: [
        EnvironmentPlugin({
            NODE_ENV: 'development',
            DEBUG: 'false',
        }),
    ],

    publicDir: 'dist',

    build: {
        outDir: 'dist',
        emptyOutDir: false,
        sourcemap: true,

        lib: {
            entry: 'src/register.ts',
            name: 'PolyfeaServiceWorker',
            fileName: 'register'
        },
    }
})