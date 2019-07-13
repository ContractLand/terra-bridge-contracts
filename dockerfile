FROM node:10-alpine

# Npm dependencies
RUN apk --update --no-cache add git python make g++

# Install dependencies
WORKDIR /app/
COPY ./package.json ./package-lock.json install-deps.sh /app/
COPY ./deployment/package.json ./deployment/package-lock.json /app/deployment/
RUN npm install

# Install dependencies in deployment
RUN cd deployment && npm install

# Build contracts
COPY ./truffle.js ./truffle-config.js /app/
COPY ./contracts/ /app/contracts/
RUN npm run-script build

COPY . /app/

CMD ["npm", "run-script", "deploy"]