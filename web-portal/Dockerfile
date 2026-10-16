# Veritag web platform — container image (static bundle behind nginx).
# Build context is the REPO ROOT, with the SDK checked out in ./sdk:
#   docker build -f web-portal/Dockerfile --build-arg VITE_API_BASE=https://api.veritag.art .
FROM node:20-alpine AS build
WORKDIR /repo

COPY sdk/ts/veritag-sdk /repo/sdk/ts/veritag-sdk
RUN cd sdk/ts/veritag-sdk && npm install --no-audit --no-fund && npm run build

ARG VITE_API_BASE=""
ARG VITE_STUDIO_BASE=""
ENV VITE_API_BASE=$VITE_API_BASE VITE_STUDIO_BASE=$VITE_STUDIO_BASE
COPY web-portal /repo/web-portal
RUN cd web-portal && npm install --no-audit --no-fund && npm run build

FROM nginx:alpine
COPY --from=build /repo/web-portal/dist-web /usr/share/nginx/html
# Client-side routes (/p, /t/…, /studio/…) all serve the app shell.
RUN printf 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; }\n  location / { try_files $uri /index.html; }\n}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
