# TDEI Workspaces Frontend User Interface

Look at the [Nuxt 3 documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

### ⚠️ Reminder: you must set the tag of the environment you wish to deploy in this repo, then run the deploy workflow in workspaces-stack to deploy to dev, stage or prod.

## Dev Setup

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
