# ergoFACE
* forked from https://github.com/360manu/kettlerUSB2BLE
* adjusted to work with Daum ergobike 8008TRS

## the original project "ergoFACE concept"
* can be found here https://github.com/weinzmi/ergoFACE

## prerequisites
* RS232 to USB converter
* RS232 custom gender changer or "programing cable" like specified from DAUM
* raspberry pi zero w / 3B+ with BLE (Bluetooth low energy) onboard
* nodejs (10.xx.x LTS) installed https://nodejs.org/en/

## setup - Install on a rasperypi
* download the sources / dependencies listed in package.json
* have a look at bleno setup https://github.com/noble/bleno

```shell
npm install
```

it can take a while as bleno must be compiled from sources.

## launch
* if SIM mode is a feature you want to use, edit daumSIM.js and change the simulation variables to fit yours
```
var mRider = 80 // mass in kg of the rider
var mBike = 7 // mass in kg of the bike
```
### this data is only used for:
* calculating the power for the current speed for the current rpm and gear of Daum ergobike
apps like ZWIFT are calculating the in game speed based on the power output of Daum ergobike sent via BLE
and the in game user settings, like height and weight. so if simulation of ergoFACE is not realistic, just
switch to another gear, the power is correct and ZWIFT will react accordingly.
remember: POWER = POWER

* go to installation directory and start node server from command line
```shell
sudo node server.js
```
### you can install the server as a service, to just plug the raspberry to a power source and ride on

* copy ergoFACE.service from lib\systemd\system to your local system (this is an example for Raspbian Stretch)
```shell
sudo chmod 644 /lib/systemd/system/ergoFACE.service
```
* configure
```shell
sudo systemctl daemon-reload
sudo systemctl enable ergoFACE.service
```
* reboot
```shell
sudo reboot
```
* check status of service
```shell
sudo systemctl status ergoFACE.service
```

* plug the RS232 to USB converter in any USB port
* start your Daum ergobike 8008 TRS
* ergoFACE will lookup for the cockpit adress and start receiving data
* start an app like ZWIFT and your Daum bike will appear as "DAUM Ergobike 8008 TRS" device with two services (power & FTMS)

## website / server
* start your browser and enter "pi-adress:3000" (try to get fixed IP address for you raspberry on your router before)
you can follow the ergoFACE activity on a this website.
It will display the current power, rpm, speed
the current gear and program your Daum is running and the socket messages.
This site is used to toggle between ERG and SIM mode and toggle between switching gears or just power
### you can use the server to:
* see current data from Daum Ergobike
* see power calculation (simulation), grade (slope), Cw (aerodynamic drag coefficient)
* see current program & gear
* stop / restart RS232 interface via server
* select gears
* select program
* toggle ERG / SIM Mode
* toggle set Power / switch gears
* toggle socket messages - key / raw / error

## current features 0.5.6 beta
* advanced webserver with dashboard and log messages based on Bootstrap v4.1.3
* apps recognize BLE (Bluetooth low energy) GATT FTM (Fitness machine) and CPC (Cycling power and cadence) service
### in apps like ZWIFT / FULL GAZ
* ERG mode is fully implemented (FTMS control point)
* SIM mode is fully implemented (FTMS control point & physics simulation)
* use virtual gearbox of Daum bike to ride in SIM mode
* use gpios (see gpio.js) to add hardware switches for more realistic ride and shifting experience, if not, use the jogwheel or +/- buttons on Daum ergobike 8008 TRS

### tested apps
* FULL GAZ - SIM mode working; no rpm
* ZWIFT - ERG mode working; SIM mode working; all signals working

# outlook / features to be developed
* start nodejs server and raspberry in accesspoint / hotspot mode to connect via mobile device and scan for your local WiFi and enter credentials
* scan for updates via server and select ergoFACE versions, download and reboot
