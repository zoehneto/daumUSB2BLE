# Creating Docker Image

`docker build -t daumusb2ble:latest .`

# Running Docker Image

`docker run -p 127.0.0.1:3000:3000 --privileged --network host daumusb2ble:latest`