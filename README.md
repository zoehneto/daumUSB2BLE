# ergoFACE

## prerequisites
* RS232 to USB converter
* RS232 custom gender changer or "programing cable" like specified from DAUM
* raspberry pi zero w / 3B+ with BLE onboard

## setup
* Install on a rasperypi with nodejs (lts version) installed.
* download the sources
* have a look at bleno setup and https://github.com/olympum/waterrower-ble

```
npm install
```

it can take a while as bleno must be compiled from sources.

## launch
* if SIM mode is a feature you want to use, edit daumSIM.js and change the simulation variables to fit yours
```
var mRider = 80 // mass in kg of the rider
var mBike = 7 // mass in kg of the bike
```

* go to installation directory and start node server from commandline
```
sudo node server.js
```
** you can install the server as a service

*** copy ergoFACE.service from lib\systemd\system to your local system
```shell
sudo chmod 644 /lib/systemd/system/ergoFACE.service
```
*** configure
```shell
sudo systemctl daemon-reload
sudo systemctl enable ergoFACE.service
```
*** reboot
```shell
sudo reboot
```
*** check status of service
```shell
sudo systemctl status ergoFACE.service
```

* plug the RS232 to USB converter in any USB port
* start your Daum ergobike 8008 TRS
* Your Daum bike will appear as DAUM Ergobike 8008 TRS device with two services (power & FTMS) on ZWIFT or FULL GAZ

## website / server
* start your browser pi-adress:3000
you can follow the bridge activity on a simple website.
It will display the current power, rpm, speed
the current gear and program your Daum is running and the socket messages.
This site is used to toggle between ERG and SIM mode and switching gears or just power


## current features
* advanced webserver with dashboard and log messages
* Zwift can connect and read the data.
* Zwift recognize the FTMS service
* ERG mode is fully implemented (FTMS control point)
* SIM mode is fully implemented (FTMS control point & physics simulation)
* use virtual gearbox of Daum bike to ride in SIM mode
* use gpios (see gpio.js) to add hardware switches for more realistic ride and shifting experience

## tested apps
* FULL GAZ - SIM mode working; no rpm
* ZWIFT - ERG mode working; SIM mode working; all signals working
