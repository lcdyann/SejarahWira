FROM node:22-alpine
WORKDIR /app
COPY backend/package*.json backend/
RUN cd backend && npm ci --omit=dev
COPY . .
ENV NODE_ENV=production PORT=5000
EXPOSE 5000
USER node
CMD ["node", "backend/server.js"]
