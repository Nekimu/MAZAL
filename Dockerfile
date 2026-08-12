# Multi-stage Dockerfile for MAZAL POS & ERP on Railway
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root and frontend package files
COPY package*.json ./
COPY mazal/package*.json ./mazal/

# Install root & frontend dependencies
RUN npm install --ignore-scripts
RUN cd mazal && npm install

# Copy application source code
COPY . .

# Build the frontend bundle
RUN cd mazal && npm run build

# Production runtime stage
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Install production server dependencies
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts

# Copy compiled frontend dist bundle and backend server
COPY --from=builder /app/mazal/dist ./mazal/dist
COPY --from=builder /app/mazal/dist ./dist
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/scripts ./scripts

EXPOSE 3000

CMD ["node", "server.js"]
