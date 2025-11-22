FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3336 3335

CMD ["npm", "run", "dev", "--", "--host"]
