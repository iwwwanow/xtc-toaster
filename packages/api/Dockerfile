FROM node:22-alpine AS build
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules

ENV PORT=3000
EXPOSE 3000
CMD ["node", "dist/index.js"]
