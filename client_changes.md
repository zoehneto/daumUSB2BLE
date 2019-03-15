changes to ergoFACE005 client
for testing kettlerUSB2BLE
https://github.com/360manu/kettlerUSB2BLE


https://www.npmjs.com/package/raspberry
sudo apt-get update
sudo apt-get upgrade
# this will take a while
# not sure if it war really necessarry
sudo apt-get install nodejs npm


sudo systemctl disable ergoFACE.service
sudo systemctl daemon-reload



install bleno
https://github.com/noble/bleno
# since bluez is allready installed, directly install bleno
npm install bleno

# try to start kettlerUSB2BLE
cd kettlerUSB2BLE-master
node server.js
# Error: Cannot find module 'express'
npm install express
node server.js
#  Cannot find module 'q'
npm install q
node server.js
# Cannot find module 'serialport'
npm install serialport
node server.js
# Cannot find module 'socket.io'
npm install socket.io
node server.js
# Error: Cannot find module 'ejs'
npm install ejs

# lets have a look at the server
http://192.168.0.123:3000/

success, the site is loading and a graph window is shown

lets start zwift and search for devices
no devices are found

try to change the code
modify the index.ejs file with the ip of your raspbery
var socket = io.connect("192.168.0.123:3000");

sudo reboot
sudo systemctl stop ergoFACE.service
node server.js
[KettlerBLE starting]
bleno warning: adapter state unauthorized, please run as root or with sudo
               or see README for information on running without root/sudo:
               https://github.com/sandeepmistry/bleno#running-on-linux

sudo systemctl restart bluetooth


node server.js
[KettlerBLE starting]

# Error: listen EADDRINUSE :::3000
sudo systemctl restart bluetooth
killall -9 node
node server.js

still cannot find a BLE device in ZWIFT or with nRF tool box

turned DEBUG = true

if (p.vendorId == '0x067b' && p.productId == '0x2303')

now there is some trafic on serial port
[KettlerBLE starting]
Kettler app listening on port 3000!
undefined  undefined
0x067b  0x2303
Kettler found on port /dev/ttyUSB0
[OUT]: VE

[OUT]: ID

[OUT]: VE

connected to socketio
[OUT]: KI

connected to socketio
[OUT]: CA

[OUT]: RS

[OUT]: CM

[OUT]: SP1

[OUT]: ST

[OUT]: ST

[OUT]: ST

[OUT]: ST

[OUT]: ST

[OUT]: ST

[OUT]: ST

[OUT]: ST


now disabled ergoface service, put this on top of this file
run as sudo to enable bleno

pi@raspberrypi:~/kettlerUSB2BLE-master $ sudo node server.js
[KettlerBLE starting]
Kettler app listening on port 3000!
undefined  undefined
0x067b  0x2303
Kettler found on port /dev/ttyUSB0
[KettlerBLE stateChange] new state: poweredOn
[KettlerBLE advertisingStart] success
[KettlerBLE servicesSet] success
[KettlerBLE setServices] success
[OUT]: VE

[OUT]: ID

[OUT]: VE

[OUT]: KI

[OUT]: CA

[OUT]: RS

[OUT]: CM

[OUT]: SP1

[OUT]: ST

[OUT]: ST

[OUT]: ST
