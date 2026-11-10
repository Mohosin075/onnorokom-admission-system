# Build stage
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
ARG VITE_API_URL=/api
ARG VITE_APP_MODE=assessment
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APP_MODE=$VITE_APP_MODE
RUN npm run build
RUN node scripts/configure-nginx.mjs

FROM build AS test
CMD ["npm", "test"]

# Production stage
FROM nginx:alpine AS runtime

COPY --from=build /app/nginx.generated.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
