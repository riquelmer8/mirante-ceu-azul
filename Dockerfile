# Imagem leve com Node 20
FROM node:20-alpine

WORKDIR /app

# Instala apenas as dependências do servidor primeiro (cache de layer)
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --omit=dev

# Copia o restante da aplicação
COPY server/ ./server/
COPY public/ ./public/

# Healthcheck simples
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/config > /dev/null || exit 1

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server/server.js"]
