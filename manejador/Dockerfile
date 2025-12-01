FROM node:18-alpine
WORKDIR /app

COPY server/package*.json ./server/
COPY client/package*.json ./client/
RUN cd server && npm install
RUN cd client && npm install

COPY server ./server
COPY client ./client

RUN cd client && npm run build
RUN mkdir -p server/public && cp -r client/dist/* server/public/

WORKDIR /app/server
EXPOSE 8080
CMD ["node", "index.js"]
