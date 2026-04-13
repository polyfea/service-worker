import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'happy-dom',
        setupFiles: ['./tests/setup.ts'],
        globals: true,
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            exclude: ['src/vite-env.d.ts', 'src/index.ts'],
            thresholds: {
                statements: 100,
            },
            reporter: ['text', 'html', 'lcov'],
        },
    },
    define: {
        'import.meta.env.MODE': '"test"',
    },
});
