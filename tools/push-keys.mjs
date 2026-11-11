/**
 * Makes the key pair for notifications. Run once:
 *
 *     node tools/push-keys.mjs
 *
 * It prints exactly what to paste where. Nothing is saved or sent anywhere.
 * Keep the PRIVATE key secret: it only goes into Supabase's Edge Function secrets.
 */
import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pub = publicKey.export({ format: 'jwk' });
const priv = privateKey.export({ format: 'jwk' });
const b64u = buf => Buffer.from(buf).toString('base64url');
const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]);
const PUBLIC = b64u(raw);
const PRIVATE = priv.d;

console.log(`
=== 1) Add this line to the end of your .env file (and to Vercel later) ===

VITE_VAPID_PUBLIC_KEY=${PUBLIC}

=== 2) Supabase → Edge Functions → Secrets → add these three ===

VAPID_PUBLIC_KEY   ${PUBLIC}
VAPID_PRIVATE_KEY  ${PRIVATE}
VAPID_SUBJECT      mailto:andreiventura04@gmail.com
`);
