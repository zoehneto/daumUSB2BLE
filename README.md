# ergoFACE
* forked from https://github.com/weinzmi/daumUSB2BLE
* adjusted to work with Daum ergobike 8008TRS PRO

## the original project "ergoFACE concept"
* can be found here https://github.com/weinzmi/ergoFACE

## prerequisites
* RS232 to USB converter
* RS232 custom gender changer or "programing cable" like specified from DAUM
* raspberry pi 3 Mod. A+ with BLE (Bluetooth low energy) onboard
* nodejs
  * see https://nodejs.org/en/
  * version 9.11.2 works for me (NOTE: this version is pretty old and should be updated)


## setup - Install on a rasperypi
* download the sources / dependencies listed in package.json
* have a look at bleno setup https://github.com/noble/bleno

```shell
npm install
```

it can take a while as bleno must be compiled from sources.

## launch
* if SIM mode is a feature you want to use, edit the parameters in config.yml to fit yours
```
simulation:
    maxGrade: 16 // maximum grade, higher than this, will be cut
    mRider: 78 // weight of you, the rider
    mBike: 9 // weight of your bike

gearbox: // this are the gear ratios used for each gear
    g1: 1.36
    g2: 1.48
    g3: 1.62
    g4: 1.79
    g5: 2.00
    g6: 2.17
    g7: 2.38
    g8: 2.63
    g9: 2.94
    g10: 3.33
    g11: 3.57
    g12: 3.85
    g13: 4.17
    g14: 4.55
```

## GPIOs for shifting gears
* if you want to use 2 external buttons for shifting gears, edit the parameters in config.yml to fit yours
```
gpio:
    geargpio: 1 // start gear for initializing
    ratio: 1 // how many gears are shifted with one push of a button
    minGear: 1 // lowest gear possible
    maxGear: 14 // highest gear possible; has to match gearbox
    debounceTimeout: 10
    shiftUpPin: 4 // GPIO pin for shift up
    shiftDownPin: 17 // GPIO pin for shift down
```

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
* ergoFACE will lookup for the cockpit address and start receiving data
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
* toggle set Power / switch gears
* toggle socket messages - key / raw / error

## current features 0.6.4 BETA
### common
* advanced webserver with dashboard and log messages based on Bootstrap v4.1.3
* apps recognize BLE (Bluetooth low energy) GATT FTM (Fitness machine) and CPC (Cycling power and cadence) service
### in ZWIFT
* ERG mode is fully implemented (FTMS control point), can be switched in workouts via ZWIFT app.
* SIM mode is fully implemented (FTMS control point) and physics simulation based on parameters send from ZWIFT and parameters input by the user - see section "launch"
* use virtual gearbox and use Daum buttons and jog wheel to switch gears
* use gpios to add hardware switches for more realistic ride and shifting experience, if not, use the jog wheel or +/- buttons on Daum ergobike 8008 TRS

### tested apps
* FULL GAZ - SIM mode working; no rpm
* ZWIFT - ERG mode working; SIM mode working; all signals working

# outlook / features to be developed
* start NodeJS server and raspberry in access point / hotspot mode to connect via mobile device and scan for your local Wi-Fi and enter credentials
* scan for updates via server and select ergoFACE versions, download and reboot
