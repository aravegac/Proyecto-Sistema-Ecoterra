FROM node:20-slim

WORKDIR /app

# Esta línea es indispensable para que reconozca el comando pnpm:
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install

COPY . .

EXPOSE 5173

CMD ["pnpm", "vite", "--host", "0.0.0.0", "--port", "5173"]