// Identity keys: an ECDSA P-256 key pair per install, so a peer can prove it's
// really the friend whose ID it's using — the ID alone proves nothing, since
// it's shared openly and the signaling broker lets whoever's online claim any
// free one. WebCrypto only; see "identity verification" in renderer.js for the
// handshake that uses these.

const KEY_ALGO = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN_ALGO = { name: 'ECDSA', hash: 'SHA-256' };
const encoder = new TextEncoder();

function toBase64(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(str) {
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}

// `stored` is what this returned as `stored` last time (kept in the secure
// store), or nothing on first run — then a new pair is made and `stored` is
// set for the caller to save.
export async function loadIdentity(stored) {
  if (stored?.privateJwk && stored?.publicKey) {
    const privateKey = await crypto.subtle.importKey('jwk', stored.privateJwk, KEY_ALGO, false, ['sign']);
    return { privateKey, publicKey: stored.publicKey, stored: null };
  }
  const pair = await crypto.subtle.generateKey(KEY_ALGO, true, ['sign', 'verify']);
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const publicKey = toBase64(await crypto.subtle.exportKey('spki', pair.publicKey));
  const privateKey = await crypto.subtle.importKey('jwk', privateJwk, KEY_ALGO, false, ['sign']); // non-extractable from here on
  return { privateKey, publicKey, stored: { privateJwk, publicKey } };
}

// IDs minted since identity keys exist are derived from the public key, so
// any connection to one can be checked against the ID itself. Older IDs are
// random ('p-' + a UUID) and never start with 'k'.
export async function idForKey(publicKey) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', fromBase64(publicKey)));
  return 'p-k' + [...hash.slice(0, 20)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function isKeyDerivedId(id) {
  return /^p-k[0-9a-f]{40}$/.test(id);
}

export function newNonce() {
  return toBase64(crypto.getRandomValues(new Uint8Array(18)));
}

// What gets signed: the verifier's challenge plus both IDs, so a signature only
// ever proves "signer to verifier, this once" — it can't be replayed later, or
// relayed by a third peer to pass as the signer to someone else.
function challengeText(nonce, signerId, verifierId) {
  return encoder.encode(`patycord-auth|${nonce}|${signerId}|${verifierId}`);
}

export async function signChallenge(privateKey, nonce, signerId, verifierId) {
  return toBase64(await crypto.subtle.sign(SIGN_ALGO, privateKey, challengeText(nonce, signerId, verifierId)));
}

export async function verifyChallenge(publicKey, nonce, signerId, verifierId, signature) {
  const key = await crypto.subtle.importKey('spki', fromBase64(publicKey), KEY_ALGO, false, ['verify']);
  return crypto.subtle.verify(SIGN_ALGO, key, fromBase64(signature), challengeText(nonce, signerId, verifierId));
}
