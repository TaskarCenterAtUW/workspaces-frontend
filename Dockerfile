FROM node as builder

ARG VITE_TDEI_API_URL
ARG VITE_TDEI_USER_API_URL
ARG VITE_API_URL
ARG VITE_OSM_URL
ARG VITE_RAPID_URL
ARG VITE_PATHWAYS_EDITOR_URL
ARG CODE_VERSION=unknown

WORKDIR /app/
COPY . .
RUN npm install
RUN npm run generate

FROM nginx
COPY --from=builder /app/.output/public /usr/share/nginx/html/

# https://stackoverflow.com/questions/44438637/arg-substitution-in-run-command-not-working-for-dockerfile
ARG CODE_VERSION

RUN echo This is $CODE_VERSION
RUN echo This is $CODE_VERSION > /usr/share/nginx/html/VERSION

RUN chown -R nginx:nginx /usr/share/nginx/html/

COPY nginx.conf /etc/nginx/conf.d/default.conf