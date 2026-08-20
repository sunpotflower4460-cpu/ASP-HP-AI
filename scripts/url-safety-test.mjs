import assert from 'node:assert/strict';
import { isSafeHttpsUrl } from './lib/url-safety.mjs';

assert.equal(isSafeHttpsUrl('https://www.example-service.jp/path'), true, 'normal HTTPS URL should be allowed');
assert.equal(isSafeHttpsUrl('http://www.example-service.jp/path'), false, 'HTTP must be rejected');
assert.equal(isSafeHttpsUrl('https://user:pass@example-service.jp/path'), false, 'embedded credentials must be rejected');
assert.equal(isSafeHttpsUrl('https://localhost/path'), false, 'localhost must be rejected');
assert.equal(isSafeHttpsUrl('https://127.0.0.1/path'), false, 'loopback IPv4 must be rejected');
assert.equal(isSafeHttpsUrl('https://[::1]/path'), false, 'loopback IPv6 must be rejected');
assert.equal(isSafeHttpsUrl('https://example.com/path'), false, 'example.com placeholder must be rejected');
assert.equal(isSafeHttpsUrl('https://example.org/path'), false, 'example.org placeholder must be rejected');
assert.equal(isSafeHttpsUrl('https://sample.example/path'), false, '.example placeholder TLD must be rejected');
assert.equal(isSafeHttpsUrl('https://example.com/path', { allowPlaceholder: true }), true, 'placeholder may be allowed only when explicitly requested for non-active samples');
assert.equal(isSafeHttpsUrl('not-a-url'), false, 'invalid URL must be rejected');

console.log('URL safety test passed.');
