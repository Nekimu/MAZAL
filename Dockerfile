# Multi-stage Dockerfile for MAZAL POS & ERP on Railway
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root and frontend package files
COPY package*.json ./
COPY mazal/package*.json ./mazal/

# Install dependencies
RUN npm install
RUN cd mazal && npm install

# Copy application source code
COPY . .

# Build the frontend bundle
RUN npm run build

# Production runtime stage
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/mazal/dist ./mazal/dist
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/scripts ./scripts

EXPOSE 3000

CMD ["node", "server.js"]
