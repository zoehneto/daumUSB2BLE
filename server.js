#!/usr/bin/env node
const express = require('express');
const app = require('express')();
const server = require('http').createServer(app);                         // for getting IP dynamicaly in index.ejs
const io = require('socket.io')(server);                                  // for getting IP dynamicaly in index.ejs
const path = require('path');
const config = require('config-yml');                  // Use config for yaml config files in Node.js projects
const DaumUSB = require('./daumUSB');
const DaumSIM = require('./daumSIM');
const DaumBLE = require('./BLE/daumBLE');
const Gpio = require('onoff').Gpio;
const shiftUp = new Gpio(4, 'in', 'rising', { debounceTimeout: 10 });     // hardware switch for shifting up gears
const shiftDown = new Gpio(17, 'in', 'rising', { debounceTimeout: 10 });  // hardware switch for shifting down gears
const { version } = require('./package.json');                            // get version number from package.json

function log (msg) {
  if (config.DEBUG.server) {
    console.log(msg);
  }
}

// ////////////////////////////////////////////////////////////////////////
// used global variables, because I cannot code ;)
// ////////////////////////////////////////////////////////////////////////
global.globalspeed_daum = 0;
global.globalrpm_daum = 0;
global.globalgear_daum = 1;
global.globalsimpower_daum = 0;
global.globalwindspeed_ble = 0;
global.globalgrade_ble = 0;
global.globalcrr_ble = 0.0040;      // set once to have simulation available without BLE connected to apps
global.globalcw_ble = 0.51;         // set once to have simulation available without BLE connected to apps
global.globalmode = 'SIM';          // set this as default start mode here; in this mode ,ergoFACE is going to startup
global.globalswitch = 'Gear';       // set this as default start mode here; in this mode ,ergoFACE is going to startup

// /////////////////////////////////////////////////////////////////////////
// server path specifications
// /////////////////////////////////////////////////////////////////////////
app.use('/public/css', express.static(path.join(__dirname, 'public/css')));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/lib', express.static(path.join(__dirname, 'lib')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.get('/', function (req, res) {
  res.render('index')
});

// /////////////////////////////////////////////////////////////////////////
// server start listening to port 3000
// /////////////////////////////////////////////////////////////////////////
server.listen(process.env.PORT || 3000, function () {
  // for getting IP dynamicaly in index.ejs and not to enter it manually
  log('[server.js] - listening on port 3000!');
});

// /////////////////////////////////////////////////////////////////////////
// instantiation
// /////////////////////////////////////////////////////////////////////////
const daumUSB = new DaumUSB();
const daumSIM = new DaumSIM();
const daumBLE = new DaumBLE(serverCallback);
const daumObs = daumUSB.open();

// /////////////////////////////////////////////////////////////////////////
// Web server callback, listen for actions taken at the server GUI, not from Daum or BLE
// /////////////////////////////////////////////////////////////////////////
io.on('connection', socket => {
  log('[server.js] - connected to socketio');

  socket.on('reset', function (data) {
    io.emit('key', '[server.js] - ergoFACE Server started');
  });

  socket.on('restart', function (data) {
    log('[server.js] - restart');
    geargpio = 1;
    daumUSB.setGear(geargpio);
    setTimeout(daumUSB.restart, 1000);
    io.emit('key', '[server.js] - restart');
  });

  socket.on('stop', function (data) {
    log('[server.js] - stop');
    daumUSB.stop();
    io.emit('key', '[server.js] - stop');
  });

  socket.on('setProgram', function (data) {
    log('[server.js] - set Program');
    const programID = data;
    daumUSB.setProgram(programID);
    io.emit('key', '[server.js] - set Program ID: ' + programID);
  });

  socket.on('setGear', function (data) { 
    // via webserver - set gears - !!!this is in conflict with gpio gear changing, because no read of gears when using gpios
    log('[server.js] - set Gear');
    const gear = data;
    daumUSB.setGear(gear);
    io.emit('raw', '[server.js] - set Gear: ' + gear);
  });

  socket.on('mode', function (data) { 
    // via webserver - switch mode ERG / SIM
    log('[server.js] - switch mode');
    global.globalmode = data;
    const mode = data;
    io.emit('key', '[server.js] - switch mode: ' + mode);
  });
  
  socket.on('switch', function (data) { 
    // via webserver - switch Power / Gear shifting
    log('[server.js] - switch');
    global.globalswitch = data;
    // const switchpg = data
    io.emit('key', '[server.js] - switch: ' + global.globalswitch);
  });
});

// /////////////////////////////////////////////////////////////////////////
// shifting gears or power via gpio + hardware switches
// /////////////////////////////////////////////////////////////////////////
let geargpio = 1;                            // initialize to start from first gear
const ratio = 1;                             // set ratio, to shift multiple gears with the press of a button.
const minGear = 1;                           // lowest gear
const maxGear = 28;                          // highest gear

shiftUp.watch((err, value) => {
  if (err) {
    io.emit('error', '[server.js] - gpio shift up: ' + err);
    throw err;
  }
  if (value) {
    if (global.globalswitch === 'Power') {
      // if mode is set to 'power', we increment watt
      daumUSB.setWattProfile(0); // increment power
      log('[server.js] - increment Power');
      io.emit('raw', '[server.js] - increment Power');
    } else {
      // if mode is set to 'gear', we increment gears
      if (geargpio < maxGear) {
        // shift n gears at a time, to avoid too much shifting
        geargpio = geargpio + ratio;
        daumUSB.setGear(geargpio);
        
        log('[server.js] - Shift to Gear: ' + geargpio);
        io.emit('raw', '[server.js] - Shift to Gear: ' + geargpio);
      }
    }
  }
});

process.on('SIGINT', () => {
  shiftUp.unexport()
});

shiftDown.watch((err, value) => {
  if (err) {
    io.emit('error', '[server.js] - gpio shift down: ' + err)
    throw err
  }
  if (value) {
    if (global.globalswitch === 'Power') { // if mode is set to 'power', we decrement watt
      daumUSB.setWattProfile(1) // decrement power
      
      log('[server.js] - decrement Power');
      io.emit('raw', '[server.js] - decrement Power')
    } else { // if mode is set to 'gear', we degrement gears
      if (geargpio > minGear) {
        geargpio = geargpio - ratio; // shift n gears at a time, to avoid too much shifting
        daumUSB.setGear(geargpio);
        
        log('[server.js] - Shift to Gear: ' + geargpio);
        io.emit('raw', '[server.js] - Shift to Gear: ' + geargpio)
      }
    }
  }
});

process.on('SIGINT', () => {
  shiftDown.unexport()
});

// /////////////////////////////////////////////////////////////////////////
// Bike information transfer to BLE & Webserver
// /////////////////////////////////////////////////////////////////////////
daumBLE.on('key', string => {
  log('[server.js] - error: ' + string);
  io.emit('key', '[server.js] - ' + string);
});

daumBLE.on('error', string => {
  log('[server.js] - error: ' + string);
  io.emit('error', '[server.js] - ' + string);
});

daumObs.on('error', string => {
  log('[server.js] - error: ' + string);
  io.emit('error', '[server.js] - ' + string);
});

daumObs.on('key', string => {
  log('[server.js] - key: ' + string);
  io.emit('key', '[server.js] - ' + string);
});

daumObs.on('raw', string => {
  log('[server.js] - raw: ', string);
  io.emit('raw', string.toString('hex'));
  
  // emit version number to webserver
  io.emit('version', version);
});

daumObs.on('data', data => {
  // get runData from daumUSB
  
  log('[server.js] - data:' + JSON.stringify(data));

  if ('speed' in data) io.emit('speed', data.speed);
  if ('power' in data) io.emit('power', data.power);
  if ('rpm' in data) io.emit('rpm', data.rpm);
  if ('gear' in data) io.emit('gear', data.gear);
  if ('program' in data) io.emit('program', data.program);

  daumBLE.notifyFTMS(data);
});

// /////////////////////////////////////////////////////////////////////////
/* BLE callback section */
// /////////////////////////////////////////////////////////////////////////
function serverCallback (message, ...args) {
  let success = false;

  switch (message) {
    case 'reset':
      log('[server.js] - USB Reset triggered via BLE');
      io.emit('key', '[server.js] - Reset triggered via BLE');
      daumUSB.restart();
      success = true;
      break;
    case 'control':
      // do nothing special
      log('[server.js] - Bike under control via BLE');
      io.emit('key', '[server.js] - Bike under control via BLE');
      io.emit('control', 'BIKE CONTROLLED');
      success = true;
      break;
    case 'power':
      // ERG Mode - receive control point value via BLE from zwift or other app
      log('[server.js] - Bike ERG Mode');

      if (args.length > 0) {
        const watt = args[0];
        daumUSB.setPower(watt);
        log('[server.js] - Bike in ERG Mode - set Power to: ', watt);
        io.emit('raw', '[server.js] - Bike in ERG Mode - set Power to: ' + watt);
        io.emit('control', 'ERG MODE');
        success = true;
      }
      break;
    case 'simulation': 
      // SIM Mode - calculate power based on physics
      log('[server.js] - Bike in SIM Mode');
      const windspeed = Number(args[0]).toFixed(1);
      const grade = Number(args[1]).toFixed(1);
      const crr = Number(args[2]).toFixed(4);
      const cw = Number(args[3]).toFixed(2);

      global.globalwindspeed_ble = windspeed;
      global.globalgrade_ble = grade;
      global.globalcrr_ble = crr;
      global.globalcw_ble = cw;

      io.emit('raw', '[server.js] - Bike SIM Mode - [wind]: ' + windspeed + ' [grade]: ' + grade + ' [crr]: ' + crr + ' [cw]: ' + cw);
      io.emit('windspeed', windspeed);
      io.emit('grade', grade);
      io.emit('crr', crr);
      io.emit('cw', cw);

      daumSIM.physics(global.globalwindspeed_ble, global.globalgrade_ble, global.globalcrr_ble, global.globalcw_ble, global.globalrpm_daum, global.globalspeed_daum, global.globalgear_daum);
      const power = Number(global.globalsimpower_daum).toFixed(0);

      // daumUSB.setPower(power) // if this is used here, then some random power is transmitted to zwift, e.g.: 111 watts / 20sec

      io.emit('raw', '[server.js] - Bike in SIM Mode - set Power to : ' + power);
      io.emit('simpower', power);
      io.emit('control', 'SIM MODE');
      success = true;
      break;
  }
  return success;
}
