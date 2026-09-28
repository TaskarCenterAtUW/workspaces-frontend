# TDEI Workspaces Frontend User Interface

Look at the [Nuxt 3 documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Branch Index

* ```develop``` merge your work here; keep this up to date with the "development" environment / dev tag
* ```staging``` keep this up to date with the "staging" environment / stage tag
* ```production``` keep this up to date with the "production" environment / prod tag

## Dev Setup

By default, the ```.env.example``` and ```nuxt.config.ts``` ```nitro.devProxy``` is setup to *proxy* requests from your local machine to the dev server in the cloud. This is to address CORS issues, and not require a local dev server on your machine to run.

If you *do* want to point at local backends instead of the cloud dev servers,
edit the `nitro.devProxy` section in `nuxt.config.ts` (commented examples are in
that block).

```zsh
# Copy `.env.example` to `.env` and adjust values as needed.
# Nuxt automatically loads .env files. No need to manually export these.
cp .env.example .env

# install deps (first time only)
npm install

# start dev server
npm run dev
```

The app runs at http://localhost:3000/.

### Signing in locally

Local OpenID Connect (TDEI) login works against the dev Keycloak, which accepts
`http://localhost:3000/auth/callback` as a redirect URI — just click **TDEI
Login** and sign in normally.

If you serve the app on a different host or port, its `redirect_uri` won't be one
the dev Keycloak allows and login will be rejected. In that case, either add that
callback (and `/logout/callback`) to the workspaces client's Valid Redirect URIs
in the dev Keycloak, or borrow a session: log in on a deployed dev instance, copy
its `localStorage['tdei-auth']` value into the same key on your local origin, and
reload.

### Rapid editors (OpenSidewalks)

The Rapid 2 / Rapid 3 editor bundles are loaded through the `/rapid2` and
`/rapid3` devProxy routes, which point at the **Azure blob storage** deploys
(`wsrapid.blob.core.windows.net/editor/dev/rapid{2,3}/`) — the
`rapid.workspaces-dev.sidewalks.washington.edu` host is not currently serving
them. This works with no local Rapid build.

To develop against a **locally built Rapid**, build it, serve its output on
`http://localhost:8080/dist`, and swap the relevant `/rapid2` or `/rapid3` target
in `nuxt.config.ts` `nitro.devProxy` to that URL (commented example is in the
block). Note each proxy key must match its `VITE_RAPID*_URL` prefix.

## Troubleshooting

If you run `npm run dev` and nothing happens, double check your `.env` file.
Undefined environment variables are not handled gracefully right now.

**The editor is blank / `rapid.js` (or `rapid-dev.js`) hangs or 404s.** The Rapid
proxy target is unreachable — confirm the `/rapid2`/`/rapid3` targets in
`nuxt.config.ts` resolve (the blob URLs above), or that your local Rapid build is
running on `:8080` if you switched to it. Restart `npm run dev` after editing the
proxy config.

**Signed in but no workspaces/data load.** API calls are proxied to the cloud dev
hosts; if they fail, check the dev-server console. A TLS-cert error from those
hosts can be worked around (dev only) by starting with
`NODE_TLS_REJECT_UNAUTHORIZED=0 npm run dev`.


