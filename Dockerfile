FROM node as builder

ENV VITE_TDEI_API_URL=https://api-dev.tdei.us/api/v1/
ENV VITE_TDEI_USER_API_URL=https://portal-api-dev.tdei.us/api/v1/
ENV VITE_API_URL=https://api.workspaces-dev.sidewalks.washington.edu/api/v1/
ENV VITE_OSM_URL=https://osm.workspaces-dev.sidewalks.washington.edu/
ENV VITE_RAPID_URL=https://rapid.workspaces-dev.sidewalks.washington.edu/
ENV VITE_PATHWAYS_EDITOR_URL=https://pathways.workspaces-dev.sidewalks.washington.edu/
ENV VITE_IMAGERY_SCHEMA=https://raw.githubusercontent.com/TaskarCenterAtUW/tdei-tools/main/docs/imagery-layer/schema.json
ENV VITE_IMAGERY_EXAMPLE_URL=https://raw.githubusercontent.com/TaskarCenterAtUW/tdei-tools/main/docs/imagery-layer/example.json
ENV VITE_LONG_FORM_QUEST_SCHEMA=https://raw.githubusercontent.com/TaskarCenterAtUW/tdei-tools/refs/heads/main/docs/quest-definition/schema.json
ENV VITE_LONG_FORM_QUEST_EXAMPLE_URL=https://raw.githubusercontent.com/TaskarCenterAtUW/tdei-tools/refs/heads/main/docs/quest-definition/example.json
ENV VITE_SENTRY_AUTH_TOKEN=""
ENV VITE_SENTRY_DSN=""

ARG CODE_VERSION=unknown

WORKDIR /app/
COPY . .
RUN npm install
RUN npm run generate

FROM nginx
COPY --from=builder /app/.output/public /usr/share/nginx/html/

# https://stackoverflow.com/questions/44438637/arg-substitution-in-run-command-not-working-for-dockerfile
ARG CODE_VERSION

RUN echo "This is (frontend, cgimap, osmrails, pathways, rapid, taskingmanager) $CODE_VERSION"
RUN echo "This is (frontend, cgimap, osmrails, pathways, rapid, taskingmanager) $CODE_VERSION" > /usr/share/nginx/html/VERSION

RUN chown -R nginx:nginx /usr/share/nginx/html/

COPY nginx.conf /etc/nginx/conf.d/default.conf
