# TDEI Workspaces Frontend User Interface

Look at the [Nuxt 3 documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Branch Index

* ```develop``` merge your work here; keep this up to date with the "development" environment / dev tag
* ```staging``` keep this up to date with the "staging" environment / stage tag
* ```production``` keep this up to date with the "production" environment / prod tag

## Dev Setup

By default, the ```.env.example``` and ```nuxt.config.ts``` devServer is setup to *proxy* requests from your local machine
to the dev server in the cloud. This is to address CORS issues, and not require a local dev server on your machine to run.

If you *do* want to setup a local dev server, you must edit the devServer section in ```nuxt.config.ts```. See lines 47-49.

```zsh
# Copy `.env.example` to `.env` and adjust values as needed.
# Nuxt automatically loads .env files. No need to manually export these.
cp .env.example .env

# install deps (first time only)
npm install

# start dev server
npm run dev
```

## Troubleshooting

If you run `npm run dev` and nothing happens, double check your `.env` file.
Undefined environment variables are not handled gracefully right now.


