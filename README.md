# TDEI Workspaces Frontend User Interface

Look at the [Nuxt 3 documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Dev Setup

NB: This will start the dev server against the cloud-hosted backend. If you need to change both the frontend and the backend, you'll
need to start a local copy of the backend (workspaces-tasking-manager) and set the environment vars appropriately below. 

The below values are for cloud-hosted dev:

```
export VITE_TDEI_API_URL=https://api-dev.tdei.us/api/v1/
export VITE_TDEI_USER_API_URL=https://portal-api-dev.tdei.us/api/v1/
export VITE_API_URL=https://api.workspaces-dev.sidewalks.washington.edu/api/v1/
export VITE_OSM_URL=https://osm.workspaces-dev.sidewalks.washington.edu/
export VITE_RAPID_URL=https://rapid.workspaces-dev.sidewalks.washington.edu
export VITE_PATHWAYS_EDITOR_URL=https://pathways.workspaces-dev.sidewalks.washington.edu
export CODE_VERSION="local"

# install deps
npm install

# start dev server
npm run dev
```
