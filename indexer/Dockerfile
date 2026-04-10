FROM node:20-slim

WORKDIR /app

COPY indexer/package.json indexer/yarn.lock ./
RUN yarn install --production

COPY indexer/src/ ./src/

CMD ["node", "src/index.js"]
