FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.28-alpine
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
ENV LAYA_BACKEND_URL=http://api:8000
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD ["nginx", "-t"]
