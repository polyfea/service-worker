// Test fixture: a minimal interceptor module for unit tests.
// Must be a plain object (not a function) so Object.assign in polyfea-sw.ts
// can add the `name` and `intercept` properties without hitting the
// non-writable `name` property of a named function.
const fn = (request, _event, options) => {
  if (options?.passThrough) return undefined;
  return new Response(`intercepted:${request.url}`);
};
export default {
  interceptor: fn,
};
