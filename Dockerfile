FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
RUN mkdir -p uploads public
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/produtos || exit 1
CMD ["node","server.js"]
