// Compass Ed deadline reminders (v2.9) and weekly parent summaries (v2.10). Supabase runs this every hour (see README,
// "Deadline reminders"): it asks the database which students have work due in the next 24 hours (ed_push_due) and which
// parents are due their Friday summary (ed_push_weekly), sends each a Web Push message, and removes devices the push
// service says are gone (ed_push_gone).
// Secrets (Edge Functions > Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:you@your-school), CRON_SECRET.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase. Web Push is RFC 8291 (encryption) + RFC 8292 (VAPID),
// done here with the built-in Web Crypto so the function needs no packages.

const env = (k: string) => (globalThis as any).Deno?.env.get(k) ?? "";
const enc = new TextEncoder();
const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));
const cat = (...a: Uint8Array[]) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const HOSTS = /^https:\/\/(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)\//;   // same list as ed_push_host

// VAPID: a short-lived ES256 token for the push service's origin, signed with our private key
export async function vapid(endpoint: string, pub: string, priv: string, subject: string) {
  const p = unb64u(pub);
  const key = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: b64u(p.slice(1, 33)), y: b64u(p.slice(33, 65)), d: priv, ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(head + "." + body));
  return "vapid t=" + head + "." + body + "." + b64u(sig) + ", k=" + pub;
}

// aes128gcm: a one-off key pair, ECDH with the browser's key, HKDF with its auth secret, then one AES-GCM record
export async function encrypt(text: string, p256dh: string, auth: string) {
  const ua = unb64u(p256dh), secret = unb64u(auth), salt = crypto.getRandomValues(new Uint8Array(16));
  const mine = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const as = new Uint8Array(await crypto.subtle.exportKey("raw", mine.publicKey));
  const their = await crypto.subtle.importKey("raw", ua, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: their } as any, mine.privateKey, 256);
  const hkdf = async (salt: Uint8Array, ikm: ArrayBuffer | Uint8Array, info: Uint8Array, bytes: number) =>
    new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]), bytes * 8));
  const ikm = await hkdf(secret, shared, cat(enc.encode("WebPush: info\0"), ua, as), 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16), nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]), cat(enc.encode(text), new Uint8Array([2]))));
  const head = new Uint8Array(21); head.set(salt); new DataView(head.buffer).setUint32(16, 4096); head[20] = as.length;
  return cat(head, as, ct);
}

type Msg = { endpoint: string; p256dh: string; auth: string; title: string; body: string; url: string; tag: string; ttl: number; assign_id?: number };
async function send(m: Msg) {
  if (!HOSTS.test(m.endpoint)) return 400;
  const res = await fetch(m.endpoint, { method: "POST", headers: {
    Authorization: await vapid(m.endpoint, env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"), env("VAPID_SUBJECT") || "mailto:admin@example.com"),
    "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: String(Math.min(43200, m.ttl || 43200)), Urgency: "normal" },
    body: await encrypt(JSON.stringify({ title: m.title, body: m.body, url: m.url, tag: m.tag }), m.p256dh, m.auth), signal: AbortSignal.timeout(10000) });
  await res.body?.cancel();
  return res.status;
}

async function handler(req: Request) {
  if (!env("CRON_SECRET") || req.headers.get("x-cron-secret") !== env("CRON_SECRET")) return new Response("forbidden", { status: 403 });
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const rpc = (fn: string, body = {}) => fetch(env("SUPABASE_URL") + "/rest/v1/rpc/" + fn, { method: "POST", body: JSON.stringify(body),
    headers: Object.assign({ "Content-Type": "application/json", apikey: key }, /^eyJ/.test(key) ? { Authorization: "Bearer " + key } : {}) });
  // check the keys before asking for the list: ed_push_due marks each reminder as sent, so a bad key would lose them all.
  // Sign a token and verify it with the public key, which proves the two halves are a pair.
  try {
    const t = await vapid("https://fcm.googleapis.com/", env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"), "mailto:check@example.com"), [h, b, g] = t.slice(8, t.indexOf(",")).split(".");
    const pub = await crypto.subtle.importKey("raw", unb64u(env("VAPID_PUBLIC_KEY")), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    if (!await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, unb64u(g), enc.encode(h + "." + b))) throw new Error("not a pair");
  } catch { return new Response("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY missing or not a pair", { status: 500 }); }
  const r = await rpc("ed_push_due");
  if (!r.ok) return new Response("database said " + r.status + ": " + await r.text(), { status: 500 });
  const w = await rpc("ed_push_weekly");   // an older database without parent summaries just sends reminders
  const due: Msg[] = (await r.json()).concat(w.ok ? await w.json() : []), gone: string[] = [], again: Msg[] = []; let sent = 0, failed = 0;
  for (let i = 0; i < due.length; i += 20) await Promise.all(due.slice(i, i + 20).map(async m => {
    try { const s = await send(m); if (s === 404 || s === 410) gone.push(m.endpoint); else if (s < 300) sent++; else { failed++; if ((s === 429 || s >= 500) && m.assign_id) again.push(m); console.log("push", s, new URL(m.endpoint).host); } }
    catch (e) { failed++; if (m.assign_id) again.push(m); console.log("push failed", String(e)); }   // network trouble or the 10-second limit; a missed weekly summary waits for next week
  }));
  if (gone.length) await rpc("ed_push_gone", { p_endpoints: gone });
  if (again.length) await rpc("ed_push_retry", { p_endpoints: again.map(m => m.endpoint), p_assign: again.map(m => m.assign_id) });   // next hour tries these again
  return Response.json({ due: due.length, sent, gone: gone.length, failed, retry: again.length });
}

(globalThis as any).Deno?.serve(handler);
