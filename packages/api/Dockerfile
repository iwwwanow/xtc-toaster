FROM node:22-alpine AS build
RUN apk add --no-cache python3 make g++
RUN npm install -g pnpm

WORKDIR /app
COPY package.json ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules

ENV PORT=3000
EXPOSE 3000
CMD ["node", "dist/index.js"]
