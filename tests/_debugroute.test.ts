import { describe, it, expect } from 'vitest';
import { PolyfeaRoute } from '../src/polyfea-route';

function makeMatchOptions(url: string, destination = '', method = 'GET') {
    const urlObj = new URL(url);
    return {
        url: urlObj,
        request: { destination, method, url } as unknown as Request,
        event: {} as FetchEvent,
        sameOrigin: true,
        params: undefined,
    };
}

describe('debug pattern', () => {
    it('checks pattern matching and location.origin', () => {
        process.stdout.write('location.origin:' + location.origin + '\n');
        process.stdout.write('location.href:' + location.href + '\n');
        const testUrl = new URL('http://localhost/api/data');
        process.stdout.write('testUrl.origin:' + testUrl.origin + '\n');
        process.stdout.write('same origin:' + String(testUrl.origin === location.origin) + '\n');
        
        const route = new PolyfeaRoute({ strategy: 'cache-first', pattern: 'localhost\\/api\\/.*' });
        const result = route.match(makeMatchOptions('http://localhost/api/data'));
        process.stdout.write('match result:' + String(result) + '\n');
        
        const re = /localhost\/api\/.*/;
        const m = re.exec('http://localhost/api/data');
        process.stdout.write('regex.exec index:' + String(m?.index) + '\n');
        expect(true).toBe(true);
    });
});
