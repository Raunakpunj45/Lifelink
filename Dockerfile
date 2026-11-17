FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV PORT=3000 DB_FILE=/app/data/lifelink.db
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["sh", "-c", "[ -f /app/data/lifelink.db ] || node seed.js; node server.js"]
