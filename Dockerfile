FROM node as builder

ENV VITE_TDEI_API_URL=""
ENV VITE_TDEI_USER_API_URL=""
ENV VITE_API_URL=""
ENV VITE_OSM_URL=""
ENV VITE_RAPID_URL=""
ENV VITE_PATHWAYS_EDITOR_URL=""
ENV VITE_IMAGERY_SCHEMA=""
ENV VITE_IMAGERY_EXAMPLE_URL=""
ENV VITE_LONG_FORM_QUEST_SCHEMA=""
ENV VITE_LONG_FORM_QUEST_EXAMPLE_URL=""
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
