FROM node:22-alpine AS build
WORKDIR /app
COPY services/package.json services/package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.services.json ./
COPY services ./services
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY services/package.json services/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist-services ./dist-services
USER node
CMD ["sh", "-c", "node dist-services/${SERVICE}/src/server.js"]
