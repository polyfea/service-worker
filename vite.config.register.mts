// vite.config.js
import { defineConfig } from 'vite'
import EnvironmentPlugin from 'vite-plugin-environment'

export default defineConfig(({ command, mode, isSsrBuild, isPreview }) => {


    return {
    plugins: [
        EnvironmentPlugin({
            NODE_ENV: mode,
        }),
    ],

    publicDir: 'dist',

    server: {
        watch: {
            usePolling: true
        }
    },

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
};
})