# TDEI Workspaces Frontend User Interface

Look at the [Nuxt 3 documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

### ⚠️ Reminder: you must set the tag of the environment you wish to deploy in this repo, then run the deploy workflow in workspaces-stack to deploy to dev, stage or prod.

## Dev Setup

```
# set these e.g. to the dev TDEI instance--note: any tokens you get from these hosts must match the environment for other components
# e.g. you can't use dev TDEI KeyCloak JWT tokens in stage or production environments. 
export VITE_TDEI_API_URL=https://api-dev.tdei.us/api/v1/
export VITE_TDEI_USER_API_URL=https://portal-api-dev.tdei.us/api/v1/

# use your local workspaces-backend instance--or set to the dev instance of this component if not running locally
export VITE_API_URL=http://localhost:3000/api/v1/
export VITE_OSM_URL=http://localhost:3000/

# probably want to leave these as-is
export VITE_RAPID_URL=https://rapid.workspaces-dev.sidewalks.washington.edu/
export VITE_PATHWAYS_EDITOR_URL=https://pathways.workspaces-dev.sidewalks.washington.edu/

# probably don't need to change any of these
export CODE_VERSION="local"
export VITE_IMAGERY_SCHEMA=https://raw.githubusercontent.com/TaskarCenterAtUW/asr-imagery-list/refs/heads/main/schema/schema.json
export VITE_IMAGERY_EXAMPLE_URL=https://github.com/TaskarCenterAtUW/asr-imagery-list/blob/main/examples/example.json
export VITE_LONG_FORM_QUEST_SCHEMA=https://raw.githubusercontent.com/TaskarCenterAtUW/asr-quests/refs/heads/main/schema/schema.json
export VITE_LONG_FORM_QUEST_EXAMPLE_URL=https://raw.githubusercontent.com/TaskarCenterAtUW/asr-quests/refs/heads/main/docs/quest-definition/example.json

# install deps (first time only)
npm install

# start dev server
npm run dev
```

## Troubleshooting

If you run ```npm run dev``` and nothing happens, check that you've set your "exports" as above. Undefined environment variables are not handled gracefully right now.