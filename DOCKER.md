# Creating Docker Image

`docker build -t daumusb2ble:latest .`

# Running Docker Image

Before starting:
- make sure that hci0 in the container is the correct bluetooth adapter (can alternatively be changed by setting the environment variable `BLENO_HCI_DEVICE_ID=1` for hci1 etc.)
- ensure bluetooth isn't managed by `bluetoothd` on the host but the adapter is still up (see https://github.com/abandonware/bleno#linux for details)

`docker run -p 127.0.0.1:3000:3000 --privileged --network host daumusb2ble:latest`