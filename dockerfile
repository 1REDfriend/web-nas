FROM node:25-alpine

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install

COPY . .

RUN npm run build

RUN npx prisma generate

EXPOSE 5491

CMD ["npm", "run", "start"]