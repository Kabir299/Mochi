# The AI server as a container, for hosts like Render, Railway or Fly.io.
# Set GROQ_API_KEY (and/or GEMINI_API_KEY, ANTHROPIC_API_KEY) and APP_KEY in the host's settings.
FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY index.ts ./
ENV PORT=8787
ENV NODE_ENV=production
# Run as the image's unprivileged user, not root.
USER node
EXPOSE 8787
CMD ["node", "index.ts"]
