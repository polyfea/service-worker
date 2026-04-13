import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Vitest runs in Node even with happy-dom, so pino loads pino.js (server) not
 * browser.js. The server version ignores browser.write. We therefore mock pino
 * so the browser.write callback IS invoked, letting us verify logger.ts wiring.
 */

// ── pino mock factory ────────────────────────────────────────────────────────
function createPinoMock() {
    const levelValues: Record<string, number> = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };
    const levelLabels: Record<number, string> = { 10: 'trace', 20: 'debug', 30: 'info', 40: 'warn', 50: 'error', 60: 'fatal' };

    function createLogger(opts: any = {}, _stream?: any, bindings?: any): any {
        const levelLabel = opts.level || 'info';
        const levelValue = levelValues[levelLabel] ?? 30;
        const write = opts.browser?.write;

        const log = (_level: string, levelVal: number, args: any[]) => {
            if (levelVal < levelValue) return;
            const obj: any = { level: levelVal, time: Date.now(), ...bindings };
            if (typeof args[0] === 'object' && args[0] !== null) {
                Object.assign(obj, args[0]);
                obj.msg = args[1] ?? '';
            } else {
                obj.msg = args[0] ?? '';
            }
            if (write) write(obj);
        };

        const logger: any = {
            level: levelLabel,
            info:  (...args: any[]) => log('info',  30, args),
            warn:  (...args: any[]) => log('warn',  40, args),
            error: (...args: any[]) => log('error', 50, args),
            debug: (...args: any[]) => log('debug', 20, args),
            trace: (...args: any[]) => log('trace', 10, args),
            fatal: (...args: any[]) => log('fatal', 60, args),
            child: (childBindings: any) => createLogger(opts, _stream, { ...bindings, ...childBindings }),
        };
        return logger;
    }

    const pinoMock = vi.fn().mockImplementation((opts?: any, stream?: any) => createLogger(opts, stream));
    (pinoMock as any).levels = { values: levelValues, labels: levelLabels };
    (pinoMock as any).stdTimeFunctions = { isoTime: () => `,"time":"${new Date().toISOString()}"` };
    return pinoMock;
}

function mockPino() {
    const pinoMock = createPinoMock();
    vi.doMock('pino', () => ({
        pino: pinoMock,
        levels: (pinoMock as any).levels,
        stdTimeFunctions: (pinoMock as any).stdTimeFunctions,
    }));
    return pinoMock;
}

describe('logger', () => {
    beforeEach(() => {
        vi.resetModules();
        (self as any).__POLYFEA_SW_LOGS_LEVEL = undefined;
        (self as any).__POLYFEA_LOGS_LEVEL = undefined;
    });

    it('exports a logger object with child()', async () => {
        mockPino();
        const { logger } = await import('../src/logger');
        expect(logger).toBeDefined();
        expect(typeof logger.child).toBe('function');
    });

    it('child logger has standard log methods', async () => {
        mockPino();
        const { logger } = await import('../src/logger');
        expect(typeof logger.info).toBe('function');
        expect(typeof logger.warn).toBe('function');
        expect(typeof logger.error).toBe('function');
        expect(typeof logger.debug).toBe('function');
    });

    it('uses debug level when __POLYFEA_SW_LOGS_LEVEL is set to debug value', async () => {
        (self as any).__POLYFEA_SW_LOGS_LEVEL = 20; // pino debug = 20
        mockPino();
        const { logger } = await import('../src/logger');
        expect(logger.level).toBe('debug');
    });

    it('uses __POLYFEA_LOGS_LEVEL when SW level is undefined', async () => {
        (self as any).__POLYFEA_SW_LOGS_LEVEL = undefined;
        (self as any).__POLYFEA_LOGS_LEVEL = 30; // info = 30
        mockPino();
        const { logger } = await import('../src/logger');
        expect(logger.level).toBe('info');
    });

    it('uses info level by default in non-development mode', async () => {
        mockPino();
        const { logger } = await import('../src/logger');
        expect(logger.level).toBe('info');
    });

    it('write callback invoked on logger.info (console.info spy)', async () => {
        const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
        mockPino();
        const { logger } = await import('../src/logger');
        logger.info('test message');
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('write callback invoked on logger.warn (console.warn spy)', async () => {
        const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        mockPino();
        const { logger } = await import('../src/logger');
        logger.warn('test warn');
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('write callback invoked on logger.error (console.error spy)', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        mockPino();
        const { logger } = await import('../src/logger');
        logger.error('test error');
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('write callback invoked on logger.debug when level is debug', async () => {
        (self as any).__POLYFEA_SW_LOGS_LEVEL = 20;
        const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
        mockPino();
        const { logger } = await import('../src/logger');
        logger.debug('test debug');
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('child logger with component calls write callback', async () => {
        const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
        mockPino();
        const { logger } = await import('../src/logger');
        const child = logger.child({ component: 'mycomp' });
        child.info('with component');
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });
});
