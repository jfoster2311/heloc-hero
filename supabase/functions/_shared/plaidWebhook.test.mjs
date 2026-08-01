// plaidWebhook.test.mjs — exercises the real verification against a real signer.
//
//   node --experimental-strip-types supabase/functions/_shared/plaidWebhook.test.mjs
//
// Runs under Node (>= 22), not Deno: it needs no Supabase runtime because
// plaidWebhook.ts deliberately has no runtime imports — see the `import type`
// note at the top of that file. Node strips the TypeScript on the way in.
//
// This exists because the thing it covers is a security control in the money
// path that cannot be exercised by opening the app. It generates a P-256 key,
// signs a JWT exactly the way Plaid does, and checks that a genuine webhook is
// accepted and that each individual forgery is not — algorithm confusion, a
// swapped body, a replayed capture, a corrupted signature, an unknown key.
//
// If you change verifyPlaidWebhook, run this. A subtly wrong implementation
// does not throw: it silently rejects every real webhook and transaction
// syncing stops with no error anyone will notice.
import { verifyPlaidWebhook } from './plaidWebhook.ts';

const enc = new TextEncoder();
const b64url = (bytes) =>
  Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function sha256Hex(s) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'],
);
const jwk = await crypto.subtle.exportKey('jwk', publicKey);

// Plaid's shape, including the extra members we deliberately drop on import.
const plaidKey = {
  kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y,
  kid: 'test-kid', use: 'sig', alg: 'ES256',
  created_at: Math.floor(Date.now() / 1000), expired_at: null,
};

let fetches = 0;
const stubPlaid = {
  getWebhookVerificationKey: async (kid) => {
    fetches++;
    if (kid !== 'test-kid') throw new Error('unknown kid');
    return plaidKey;
  },
};

async function makeJwt({ body, alg = 'ES256', kid = 'test-kid', iat, bodyHash, corrupt = false }) {
  const header = b64url(enc.encode(JSON.stringify({ alg, kid, typ: 'JWT' })));
  const payload = b64url(enc.encode(JSON.stringify({
    iat: iat ?? Math.floor(Date.now() / 1000),
    request_body_sha256: bodyHash ?? await sha256Hex(body),
  })));
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, privateKey, enc.encode(`${header}.${payload}`),
  );
  const bytes = new Uint8Array(sig);
  if (corrupt) bytes[0] ^= 0xff;
  return `${header}.${payload}.${b64url(bytes)}`;
}

const req = (token) => new Request('https://x/plaid-webhook', {
  method: 'POST',
  headers: token ? { 'Plaid-Verification': token } : {},
});

const BODY = JSON.stringify({ webhook_type: 'TRANSACTIONS', webhook_code: 'SYNC_UPDATES_AVAILABLE', item_id: 'itm_1' });
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};

console.log('\nPlaid webhook verification\n');

let r = await verifyPlaidWebhook(req(await makeJwt({ body: BODY })), BODY, stubPlaid);
check('genuine webhook is accepted', r.valid, JSON.stringify(r));

r = await verifyPlaidWebhook(req(await makeJwt({ body: BODY })), BODY + ' ', stubPlaid);
check('body tampered after signing is rejected', !r.valid && r.reason === 'body hash mismatch', JSON.stringify(r));

r = await verifyPlaidWebhook(req(await makeJwt({ body: BODY, alg: 'HS256' })), BODY, stubPlaid);
check('alg confusion (HS256) is rejected', !r.valid && r.reason.includes('unsupported alg'), JSON.stringify(r));

r = await verifyPlaidWebhook(req(await makeJwt({ body: BODY, alg: 'none' })), BODY, stubPlaid);
check('alg none is rejected', !r.valid && r.reason.includes('unsupported alg'), JSON.stringify(r));

r = await verifyPlaidWebhook(req(await makeJwt({ body: BODY, corrupt: true })), BODY, stubPlaid);
check('corrupted signature is rejected', !r.valid && r.reason === 'bad signature', JSON.stringify(r));

r = await verifyPlaidWebhook(
  req(await makeJwt({ body: BODY, iat: Math.floor(Date.now() / 1000) - 6 * 60 })), BODY, stubPlaid);
check('replay outside the 5-minute window is rejected', !r.valid && r.reason.includes('stale'), JSON.stringify(r));

r = await verifyPlaidWebhook(
  req(await makeJwt({ body: BODY, iat: Math.floor(Date.now() / 1000) - 4 * 60 })), BODY, stubPlaid);
check('4 minutes old is still accepted', r.valid, JSON.stringify(r));

r = await verifyPlaidWebhook(req(null), BODY, stubPlaid);
check('missing header is rejected', !r.valid && r.reason.includes('missing'), JSON.stringify(r));

r = await verifyPlaidWebhook(req('not.a.jwt'), BODY, stubPlaid);
check('malformed JWT is rejected', !r.valid, JSON.stringify(r));

r = await verifyPlaidWebhook(req(await makeJwt({ body: BODY, kid: 'other' })), BODY, stubPlaid);
check('unknown kid fails closed', !r.valid && r.reason.includes('key fetch failed'), JSON.stringify(r));

// The trap the caller comment warns about, demonstrated properly.
// Round-tripping ALREADY-COMPACT JSON is identity, so the first version of this
// test proved nothing. What actually happens in production is that the sender's
// bytes carry whitespace the receiver's JSON.stringify does not reproduce: sign
// the wire format, verify against the re-serialisation, and it must fail.
const wireBody = JSON.stringify(JSON.parse(BODY), null, 2);
const reSerialised = JSON.stringify(JSON.parse(wireBody));
check('the two serialisations really do differ', wireBody !== reSerialised);
r = await verifyPlaidWebhook(req(await makeJwt({ body: wireBody })), reSerialised, stubPlaid);
check('re-serialised body is rejected (proves raw-body requirement)',
  !r.valid && r.reason === 'body hash mismatch', JSON.stringify(r));
r = await verifyPlaidWebhook(req(await makeJwt({ body: wireBody })), wireBody, stubPlaid);
check('the same bytes that were signed are accepted', r.valid, JSON.stringify(r));

const before = fetches;
await verifyPlaidWebhook(req(await makeJwt({ body: BODY })), BODY, stubPlaid);
check('key is cached across calls', fetches === before, `fetches went ${before} -> ${fetches}`);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
