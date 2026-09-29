# DealShield website - security headers and deployment

The live site is served by **nginx** (observed `nginx/1.28.3 (Ubuntu)`), not Vercel. The repo carries three
copies of the policy; keep them identical:

| Where | File | Notes |
|---|---|---|
| nginx (live) | `docs/nginx-security-headers.conf` | Paste into the HTTPS `server {}` block. Full set incl. `frame-ancestors 'none'`, HSTS, X-Frame-Options DENY. |
| Vercel (if used) | `vercel.json` `headers` | Same CSP + headers; account pages get `X-Robots-Tag: noindex` and `Cache-Control: no-store`. |
| Each HTML page | `<meta http-equiv="Content-Security-Policy">` | Fallback when the server sends none. Browsers ignore `frame-ancestors` in meta, so it is omitted there; framing protection needs the server header. |

## The CSP

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdn.jsdelivr.net;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data:;
connect-src 'self' https://api.dealshield.ng;
object-src 'none'; base-uri 'self'; form-action 'self';
frame-ancestors 'none'            (server header only)
```

Pinned third-party assets actually used:
- `https://cdn.tailwindcss.com/3.4.16` (Tailwind Play CDN - generates styles at runtime; needs `'unsafe-inline'` styles)
- `https://cdn.jsdelivr.net/npm/lucide@0.468.0/dist/umd/lucide.min.js`
- `https://cdn.jsdelivr.net/npm/gsap@3.12.2/dist/gsap.min.js` and `.../ScrollTrigger.min.js` (index.html only)
- Google Fonts CSS + font files

Known weaknesses (not fixed here): `'unsafe-inline'` scripts are still required because every page uses inline
`<script>` blocks and `onclick=` handlers. Removing it requires moving inline JS to files (or nonces/hashes) and a
compiled Tailwind build instead of the Play CDN. `cdn.jsdelivr.net` is a broad origin; SRI (below) narrows it.

## SRI (Subresource Integrity) - must be done at deploy time

SRI hashes were **not** added: they cannot be computed offline in this environment and a wrong hash blocks the
script. At deploy time, on a machine with network access, for each pinned URL:

```
curl -sL <url> | openssl dgst -sha384 -binary | openssl base64 -A
```

then add `integrity="sha384-<hash>" crossorigin="anonymous"` to the matching `<script src>` tag. The Tailwind Play
CDN serves a JS bundle that can change under the same version path; better to replace it with a self-hosted
compiled CSS file.

## API base (single config point)

`assets/runtime.js` exposes `DS.API_BASE`. The default is `''` (same origin): the web server must proxy `/auth`,
`/escrow`, `/listings` (exact **and** `/listings/...`), `/wallet`, `/admin` to the API over HTTPS. To call a
separate API host instead, add to each page head:

```
<meta name="ds-api-base" content="https://api.dealshield.ng">
```

Only `https://<hostname>` values are accepted; `http://` or raw-IP values are ignored (fallback to same origin).
If you do this, the API must allow CORS from `https://dealshield.com.ng`, and `connect-src` already allows
`https://api.dealshield.ng`.

nginx proxy example (adjust upstream):

```
location = /listings      { proxy_pass https://api.dealshield.ng/listings; }
location ^~ /listings/    { proxy_pass https://api.dealshield.ng; }
location ^~ /auth/        { proxy_pass https://api.dealshield.ng; }
location ^~ /escrow/      { proxy_pass https://api.dealshield.ng; }
location ^~ /wallet/      { proxy_pass https://api.dealshield.ng; }
```

## Operator steps

1. Confirm canonical domain `https://dealshield.com.ng` (canonical/og:url/sitemap/robots use it) and API host `https://api.dealshield.ng`.
2. Install `docs/nginx-security-headers.conf` in the HTTPS server block; `nginx -t`; reload.
3. Verify `/listings` and `/listings/1` both reach the API.
4. Generate SRI hashes as above; add them; retest pages.
5. `curl -sI https://dealshield.com.ng/login.html` should show CSP, HSTS, X-Frame-Options DENY, `X-Robots-Tag: noindex`.
6. Load every page with DevTools open and check for CSP violations before announcing.
7. HSTS `preload` was deliberately left out; add it only after confirming every subdomain is HTTPS.
