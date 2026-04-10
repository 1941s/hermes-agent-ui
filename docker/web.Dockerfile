ARG NODE_IMAGE=node:20-alpine
FROM ${NODE_IMAGE} AS deps
WORKDIR /repo
ARG NPM_REGISTRY=https://registry.npmjs.org
RUN npm config set registry ${NPM_REGISTRY}
RUN npm install -g pnpm@10.33.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json

RUN pnpm install --frozen-lockfile

ARG NODE_IMAGE=node:20-alpine
FROM ${NODE_IMAGE} AS builder
WORKDIR /repo
ARG NPM_REGISTRY=https://registry.npmjs.org
RUN npm config set registry ${NPM_REGISTRY}
RUN npm install -g pnpm@10.33.0

COPY --from=deps /repo/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_AGENT_WS_URL=ws://localhost:8000/ws/agent
ARG NEXT_PUBLIC_AGENT_AUTH_TOKEN=
ENV NEXT_PUBLIC_AGENT_WS_URL=${NEXT_PUBLIC_AGENT_WS_URL}
ENV NEXT_PUBLIC_AGENT_AUTH_TOKEN=${NEXT_PUBLIC_AGENT_AUTH_TOKEN}

RUN pnpm install --frozen-lockfile
RUN pnpm --filter web build

ARG NODE_IMAGE=node:20-alpine
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public
RUN addgroup -S appgroup && adduser -S appuser -G appgroup && chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
