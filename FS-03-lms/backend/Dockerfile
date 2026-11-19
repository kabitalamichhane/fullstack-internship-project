FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Same image runs the API and the video worker (worker needs FFmpeg).
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl ffmpeg
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
EXPOSE 5000
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
