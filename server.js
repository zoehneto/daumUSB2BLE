#!/usr/bin/env node
var express = require('express')
var app = require('express')()
var server = require('http').createServer(app) // for getting IP dynamicaly in index.ejs
var io = require('socket.io')(server) // for getting IP dynamicaly in index.ejs
var path = require('path')
var DaumUSB = require('./daumUSB')
var DaumSIM = require('./daumSIM')
var DaumBLE = require('./BLE/daumBLE')
var Gpio = require('onoff').Gpio
var shiftUp = new Gpio(4, 'in', 'rising', { debounceTimeout: 10 }) // hardware switch for shifting up gears
var shiftDown = new Gpio(17, 'in', 'rising', { debounceTimeout: 10 }) // hardware switch for shifting down gears
var DEBUG = false // turn this on for debug information in consol
const { version } = require('./package.json') // get version number from package.json
// ////////////////////////////////////////////////////////////////////////
// used global variables, because I cannot code ;)
// ////////////////////////////////////////////////////////////////////////
global.globalspeed_daum = 0
global.globalrpm_daum = 0
global.globalgear_daum = 0
global.globalsimpower_daum = 0
global.globalmode = 'SIM' // set this as default start mode here; in this mode ,ergoFACE is going to startup
global.globalswitch = 'Gear' // set this as default start mode here; in this mode ,ergoFACE is going to startup
// /////////////////////////////////////////////////////////////////////////
// server path specification
// /////////////////////////////////////////////////////////////////////////
app.use('/public/css', express.static(path.join(__dirname, 'public/css')))
app.use('/public', express.static(path.join(__dirname, 'public')))
app.use('/lib', express.static(path.join(__dirname, 'lib')))
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')
app.get('/', function (req, res) {
  res.render('index')
})
// /////////////////////////////////////////////////////////////////////////
// server start listening to port 3000
// /////////////////////////////////////////////////////////////////////////
server.listen(process.env.PORT || 3000, function () { // for getting IP dynamicaly in index.ejs and not to enter it manually
  if (DEBUG) console.log('[server.js] - listening on port 3000!')
})
// /////////////////////////////////////////////////////////////////////////
// instantiation
// /////////////////////////////////////////////////////////////////////////
var daumUSB = new DaumUSB()
var daumSIM = new DaumSIM()
var daumBLE = new DaumBLE(serverCallback)
var daumObs = daumUSB.open()
// /////////////////////////////////////////////////////////////////////////
// Web server callback, listen for actions taken at the server GUI, not from Daum or BLE
// /////////////////////////////////////////////////////////////////////////
io.on('connection', socket => {
  if (DEBUG) console.log('[server.js] - connected to socketio')
  socket.on('reset', function (data) {
    io.emit('key', '[server.js] - ergoFACE Server started')
  })
  socket.on('restart', function (data) {
    if (DEBUG) console.log('[server.js] - restart')
    geargpio = 1
    daumUSB.setGear(geargpio)
    setTimeout(daumUSB.restart, 1000)
    io.emit('key', '[server.js] - restart')
  })
  socket.on('stop', function (data) {
    if (DEBUG) console.log('[server.js] - stop')
    daumUSB.stop()
    io.emit('key', '[server.js] - stop')
  })
  socket.on('setProgram', function (data) {
    if (DEBUG) console.log('[server.js] - set Program')
    var programID = data
    daumUSB.setProgram(programID)
    io.emit('key', '[server.js] - set Program ID: ' + programID)
  })
  socket.on('setGear', function (data) { // via webserver - set gears - !!!this is in conflict with gpio gear changing, because no read of gears when using gpios
    if (DEBUG) console.log('[server.js] - set Gear')
    var gear = data
    daumUSB.setGear(gear)
    io.emit('raw', '[server.js] - set Gear: ' + gear)
  })
  socket.on('mode', function (data) { // via webserver - switch mode ERG / SIM
    if (DEBUG) console.log('[server.js] - switch mode')
    global.globalmode = data
    var mode = data
    io.emit('key', '[server.js] - switch mode: ' + mode)
  })
  socket.on('switch', function (data) { // via webserver - switch Power / Gear shifting
    if (DEBUG) console.log('[server.js] - switch')
    global.globalswitch = data
    // var switchpg = data
    io.emit('key', '[server.js] - switch: ' + global.globalswitch)
  })
})
// /////////////////////////////////////////////////////////////////////////
// shifting gears or power via gpio + hardware switches
// /////////////////////////////////////////////////////////////////////////
var geargpio = 1 // initialize to start from first gear
var ratio = 1 // set ratio, to shift multiple gears with the press of a button.
var minGear = 1 // lowest gear
var maxGear = 28 // highest gear
shiftUp.watch((err, value) => {
  if (err) {
    io.emit('error', '[server.js] - gpio shift up: ' + err)
    throw err
  }
  if (value) {
    if (global.globalswitch === 'Power') { // if mode is set to 'power', we increment watt
      daumUSB.setWattProfile(0) // increment power
      if (DEBUG) console.log('[server.js] - increment Power')
      io.emit('raw', '[server.js] - increment Power')
    } else { // if mode is set to 'gear', we increment gears
      if (geargpio < maxGear) {
        geargpio = geargpio + ratio // shift n gears at a time, to avoid too much shifting
        daumUSB.setGear(geargpio)
        if (DEBUG) console.log('[server.js] - Shift to Gear: ' + geargpio)
        io.emit('raw', '[server.js] - Shift to Gear: ' + geargpio)
      }
    }
  }
})
process.on('SIGINT', () => {
  shiftUp.unexport()
})
shiftDown.watch((err, value) => {
  if (err) {
    io.emit('error', '[server.js] - gpio shift down: ' + err)
    throw err
  }
  if (value) {
    if (global.globalswitch === 'Power') { // if mode is set to 'power', we decrement watt
      daumUSB.setWattProfile(1) // decrement power
      if (DEBUG) console.log('[server.js] - decrement Power')
      io.emit('raw', '[server.js] - decrement Power')
    } else { // if mode is set to 'gear', we degrement gears
      if (geargpio > minGear) {
        geargpio = geargpio - ratio // sift n gears at a time, to avoid too much shifting
        daumUSB.setGear(geargpio)
        if (DEBUG) console.log('[server.js] - Shift to Gear: ' + geargpio)
        io.emit('raw', '[server.js] - Shift to Gear: ' + geargpio)
      }
    }
  }
})
process.on('SIGINT', () => {
  shiftDown.unexport()
})
// /////////////////////////////////////////////////////////////////////////
// Bike information transfer to BLE & Webserver
// /////////////////////////////////////////////////////////////////////////
daumBLE.on('key', string => {
  if (DEBUG) console.log('[server.js] - error: ' + string)
  io.emit('key', '[server.js] - ' + string)
})
daumBLE.on('error', string => {
  if (DEBUG) console.log('[server.js] - error: ' + string)
  io.emit('error', '[server.js] - ' + string)
})
daumObs.on('error', string => {
  if (DEBUG) console.log('[server.js] - error: ' + string)
  io.emit('error', '[server.js] - ' + string)
})
daumObs.on('key', string => {
  if (DEBUG) console.log('[server.js] - key: ' + string)
  io.emit('key', '[server.js] - ' + string)
})
daumObs.on('raw', string => {
  if (DEBUG) console.log('[server.js] - raw: ', string)
  io.emit('raw', string.toString('hex'))
  io.emit('version', version) // emit version number to webserver
})
daumObs.on('data', data => { // get runData from daumUSB
  if (DEBUG) console.log('[server.js] - data:' + JSON.stringify(data))
  if ('speed' in data) io.emit('speed', data.speed)
  if ('power' in data) io.emit('power', data.power)
  if ('rpm' in data) io.emit('rpm', data.rpm)
  if ('gear' in data) io.emit('gear', data.gear)
  if ('program' in data) io.emit('program', data.program)
  daumBLE.notifyFTMS(data)
})
// /////////////////////////////////////////////////////////////////////////
/* BLE callback section */
// /////////////////////////////////////////////////////////////////////////
function serverCallback (message, ...args) {
  var success = false
  switch (message) {
    case 'reset':
      if (DEBUG) console.log('[server.js] - USB Reset triggered via BLE')
      io.emit('key', '[server.js] - Reset triggered via BLE')
      daumUSB.restart()
      success = true
      break
    case 'control': // do nothing special
      if (DEBUG) console.log('[server.js] - Bike under control via BLE')
      io.emit('key', '[server.js] - Bike under control via BLE')
      io.emit('control', 'BIKE CONTROLLED')
      success = true
      break
    case 'power': // ERG Mode - receive control point value via BLE from zwift or other app
      if (DEBUG) console.log('[server.js] - Bike ERG Mode')
      if (args.length > 0) {
        var watt = args[0]
        daumUSB.setPower(watt)
        if (DEBUG) console.log('[server.js] - Bike in ERG Mode - set Power to: ', watt)
        io.emit('raw', '[server.js] - Bike in ERG Mode - set Power to: ' + watt)
        success = true
      }
      break
    case 'simulation': // SIM Mode - calculate power based on physics
      if (DEBUG) console.log('[server.js] - Bike in SIM Mode')
      var windspeed = Number(args[0]).toFixed(1)
      var grade = Number(args[1]).toFixed(1)
      var crr = Number(args[2]).toFixed(4)
      var cw = Number(args[3]).toFixed(2)
      var power = Number(global.globalsimpower_daum).toFixed(0)
      io.emit('raw', '[server.js] - Bike SIM Mode - [wind]: ' + windspeed + ' [grade]: ' + grade + ' [crr]: ' + crr + ' [cw]: ' + cw)
      io.emit('windspeed', windspeed)
      io.emit('grade', grade)
      io.emit('crr', crr)
      io.emit('cw', cw)
      daumSIM.physics(windspeed, grade, crr, cw, global.globalrpm_daum, global.globalspeed_daum, global.globalgear_daum)
      daumUSB.setPower(power)
      io.emit('raw', '[server.js] - Bike in SIM Mode - set Power to : ' + power)
      io.emit('simpower', power)
      success = true
      break
  }
  return success
}
