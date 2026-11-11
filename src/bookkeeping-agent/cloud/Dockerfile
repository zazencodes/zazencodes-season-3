FROM node:22-slim

WORKDIR /app

# Install deps first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy the rest of the app.
COPY tsconfig.json server.ts ./
COPY scripts ./scripts
COPY public ./public
COPY agent-home ./agent-home

# tsx is a devDep; we run TypeScript directly at runtime, so install it as a runtime dep here.
RUN npm install --no-save tsx

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/data
EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "start"]
