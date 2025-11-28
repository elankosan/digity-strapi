# Strapi Dockerfile for Production

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Build Strapi
FROM base AS builder
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
# Build TypeScript config files
RUN npx tsc --project tsconfig.json || true
ENV NODE_ENV=production
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 strapi

COPY --from=builder --chown=strapi:nodejs /app ./

# Create uploads directory
RUN mkdir -p /app/public/uploads && chown -R strapi:nodejs /app/public/uploads

USER strapi

EXPOSE 1337

ENV PORT=1337
ENV HOST=0.0.0.0

CMD ["npm", "run", "start"]
