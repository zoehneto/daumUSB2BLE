FROM node:16-bullseye

# Install system dependencies
RUN apt update && apt install -y --no-install-recommends \
    python2 \
    bluetooth \
    bluez \
    libbluetooth-dev \
    libudev-dev \
    libusb-1.0-0-dev \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./

RUN npm ci

# Bundle app source
COPY . .

EXPOSE 3000
EXPOSE 9229
CMD [ "node", "server.js" ]