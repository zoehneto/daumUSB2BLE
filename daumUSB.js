var EventEmitter = require('events').EventEmitter
var com = require('serialport')
var DEBUG = true // turn this on for debug information in consol

function daumUSB () {
  var self = this
  self.port = null
  self.pending = [] // buffer for pushing pending commands to the port
  self.writer = null // used for flushing next pending data
  self.reader = null // used for 'runData' command
  self.readeradress = null // used for 'getAdress' command
  self.emitter = new EventEmitter()

  var daumCockpitAdress = '00' // this script is looking for the adress, this is working, for default, I'll set this to 00
  var gotAdressSuccess = false // false by default to scan for cockpit adress; if adress cannot be retrieved, there will be no interaction with daum.
  var daumCommands = { // Daum RS232 commands
    check_Cockpit: '10',
    get_Adress: '11',
    reset_Device: '12',
    start_Prog: '21',
    stop_Prog: '22',
    set_Prog: '23',
    ser_Person: '24',
    start_Relax: '25',
    wakeup: '30',
    sleep: '31',
    get_Temperature: '32',
    run_Data: '40',
    relax_Data: '42',
    set_Watt: '51',
    set_Pulse: '52',
    set_Gear: '53',
    set_Speed: '54',
    set_Language: '60',
    get_Language: '61',
    set_Timer: '62',
    get_Timer: '63',
    set_Date: '64',
    get_Data: '65',
    get_Prog: '66',
    get_Person: '67',
    set_WattProfile: '68',
    del_Person: '70',
    del_IProg: '71',
    get_Version: '73',
    get_PersonData: '74',
    get_PersonData1: '75',
    ctrl_Sound: 'D3'
  }
  var daumRanges = { // Daum value ranges - used for data validation
    min_speed: 0,
    max_speed: 99,
    min_rpm: 0,
    max_rpm: 199,
    min_gear: 1,
    max_gear: 28,
    min_program: 0,
    max_program: 79,
    min_power: 5,
    max_power: 160
  }
  // //////////////////////////////////////////////////////////////////////////
  // push data in queue befor flushNext is writing it to port
  // //////////////////////////////////////////////////////////////////////////
  this.write = function (string) {
    self.pending.push(string)
    if (DEBUG) console.log('[daumUSB.js] - this.write - [OUT]: ', string)
  }
  // //////////////////////////////////////////////////////////////////////////
  // send (flush) pending messages to port (sequencial)
  // //////////////////////////////////////////////////////////////////////////
  this.flushNext = function () {
    if (self.pending.length === 0) {
      if (DEBUG) console.log('[daumUSB.js] - this.flushNext - nothing pending')
      return
    }
    var string = self.pending.shift()
    if (self.port) {
      var buffer = new Buffer.from(string)
      if (DEBUG) console.log('[daumUSB.js] - flushNext - [OUT]: ', buffer)
      self.port.write(buffer)
    } else {
      if (DEBUG) console.log('[daumUSB.js] - flushNext - Communication port is not open - not sending data: ' + string)
    }
  }
  // //////////////////////////////////////////////////////////////////////////
  // used when port open to get data stream from buffer and grab the values, e.g. speed, rpm,...
  // //////////////////////////////////////////////////////////////////////////
  this.readAndDispatch = function (numbers) {
    if (DEBUG) console.log('[daumUSB.js] - readAndDispatch - [IN]: ', numbers)
    self.emitter.emit('raw', numbers)
    var states = numbers
    var statesLen = states.length
    if (gotAdressSuccess === false) { // this loop is for parsing the cockpit adress
      var i
      for (i = 0; i < statesLen; i++) {
        if (DEBUG) console.log('[daumUSB.js] - getAdress - [Index]: ', i, ' ', states[i])
        if (states[i].toString(16) === daumCommands.get_Adress) { // search for getAdress prefix
          var index = i
          if (DEBUG) console.log('[daumUSB.js] - getAdress - [Index]: ', index)
          daumCockpitAdress = (states[1 + index]).toString() // get the adress from the stream by using the index
          if (DEBUG) console.log('[daumUSB.js] - getAdress - [Adress]: ', daumCockpitAdress)
          self.emitter.emit('key', '[daumUSB.js] - getAdress - [Adress]: ' + daumCockpitAdress)
          gotAdressSuccess = true // adress is retrieved, lets set this to true to inform other functions that they can proceed now
          self.start() // as soon as we have the adress, we set the gears and cockpit to default
          if (DEBUG) console.log('[daumUSB.js] - getAdress - [gotAdressSuccess]: ', gotAdressSuccess)
          clearInterval(self.readeradress) // stop looking for adress
          break // stop if prefix found and break
        }
      }
    } else {
      for (i = 0; i < (statesLen - 2); i++) { // this loop is for parsing the datastream after gotAdressSuccess is true and we can use the adress for commands
        if (states[i].toString(16) === daumCommands.run_Data && states[i + 1].toString(16) === daumCockpitAdress && states[i + 2] === 0) { // and search for the runData and daumCockpitAdress and manuall watt program prefix
          index = i
          if (DEBUG) console.log('[daumUSB.js] - runData - [Index]: ', index)
          break // stop if prefix found and break
        }
        if (i === statesLen - 3) {
          if (DEBUG) console.log('[daumUSB.js] - runData - [Index]: WRONG PROGRAM SET - SET MANUAL WATTPROGRAM 00')
          self.emitter.emit('error', '[daumUSB.js] - runData - [Index]: WRONG PROGRAM SET - SET MANUAL WATTPROGRAM 00')
        }
      }
    }
    var data = {}
    if (states.length >= 19) { // just check if stream is more than value, this is obsulete, because of custom parser that is parsing 40 bytes
      var speed = (states[7 + index])
      if (!isNaN(speed) && (speed >= daumRanges.min_speed && speed <= daumRanges.max_speed)) {
        data.speed = speed
      }
      var cadence = (states[6 + index])
      if (!isNaN(cadence) && (cadence >= daumRanges.min_rpm && cadence <= daumRanges.max_rpm)) {
        data.cadence = cadence
      }
      var hr = 111 // !!! can be deleted - have to check BLE code on dependencies
      if (!isNaN(hr)) { data.hr = hr } // !!! can be deleted - have to check BLE code on dependencies

      var rpm = (states[6 + index])
      if (!isNaN(rpm) && (rpm >= daumRanges.min_rpm && rpm <= daumRanges.max_rpm)) {
        data.rpm = rpm
      }
      var gear = (states[16 + index])
      if (!isNaN(gear) && (gear >= daumRanges.min_gear && gear <= daumRanges.max_gear)) {
        data.gear = gear
      }
      var program = (states[2 + index])
      if (!isNaN(program) && (program >= daumRanges.min_program && program <= daumRanges.max_program)) {
        data.program = program
      }
      if (rpm === 0) { // power -  25 watt will allways be transmitted by daum; set to 0 if rpm is 0 to avoid rolling if stand still in applications like zwift or fullgaz
        var power = 0
        data.power = power
      } else {
        power = (states[5 + index])
        if (!isNaN(power) && (power >= daumRanges.min_power && power <= daumRanges.max_power)) {
          data.power = power * 5 // multiply with factor 5, see Daum spec
        }
      }
      global.globalspeed_daum = data.speed // global variables used, because I cannot code ;)
      global.globalrpm_daum = data.rpm
      if (Object.keys(data).length > 0) self.emitter.emit('data', data) // emit data to server for further use
    } else {
      self.unknownHandler(numbers) // is obsolete, becasuse of custom parser that parses 40 bytes - but just in case to have some error handling
    }
  }
  // //////////////////////////////////////////////////////////////////////////
  // unknown handlers start
  // //////////////////////////////////////////////////////////////////////////
  this.unknownHandler = function (numbers) {
    if (DEBUG) console.log('[daumUSB.js] - unknownHandler - Unrecognized packet: ', numbers)
    self.emitter.emit('error', '[daumUSB.js] - unknownHandler: ' + numbers)
  }
  // //////////////////////////////////////////////////////////////////////////
  // open port as specified by daum
  // /////////////////////////////////////////////////////////////////////////
  this.open = function () {
    com.list(function (err, ports) {
      if (err) {
        self.emitter.emit('error', '[daumUSB.js] - open: ' + err)
        throw err
      }
      ports.forEach(function (p) {
        if (p.vendorId && p.productId) { // ??? don't know if this is the ID of ergobike, or the serial adapter, this has to be configured for every bike, so I might skip it
          if (DEBUG) console.log('[daumUSB.js] - open:' + p.vendorId + '  ' + p.productId) // RS232 converter Ids
          if (DEBUG) console.log('[daumUSB.js] - open - Ergobike found on port ' + p.comName)
          self.emitter.emit('key', '[daumUSB.js] - Ergobike found on port ' + p.comName)
          var port = new com.SerialPort(p.comName, {
            baudrate: 9600,
            dataBits: 8,
            parity: 'none',
            stopBits: 1,
            flowControl: false,
            parser: com.parsers.byteLength(40) // custom parser set to byte length that is more than the actual response message of ergobike, but no other way possible right know
          }, false) // thats why the index loops in 'readAndDispatch' are used to get the prefix of each command
          port.open(function () {
            self.port = port
            port.on('data', self.readAndDispatch)
            self.writer = setInterval(self.flushNext, 50) // this is writing the data to the port; i've put here the timeout of DAUM interface spec; 50ms
            if (gotAdressSuccess === false) { // check, otherwise after a restart via webserver, this will run again
              if (DEBUG) console.log('[daumUSB.js] - looking for cockpit adress')
              self.emitter.emit('key', '[daumUSB.js] - looking for cockpit adress')
              self.readeradress = setInterval(self.getAdress, 100) // continiously get adress from ergobike, the interval is canceled if gotAdressSuccess is true
            }
            if (DEBUG) console.log('[daumUSB.js] - runData')
            self.emitter.emit('key', '[daumUSB.js] - runData')
            self.reader = setInterval(self.runData, 500) // continiously get 'run_Data' from ergobike; 500ms means, every 1000ms a buffer
          })
        }
      })
    })
    return self.emitter
  }
  // //////////////////////////////////////////////////////////////////////////
  // restart port
  // //////////////////////////////////////////////////////////////////////////
  this.restart = function () {
    if (DEBUG) console.log('[daumUSB.js] - Daum restart')
    if (self.port.isOpen) {
      self.stop()
      self.port.close()
    }
    setTimeout(self.open, 2000)
    setTimeout(self.start, 2000)
  }
  // //////////////////////////////////////////////////////////////////////////
  // start sequence - this is just a dummy, because getAdress is used during port initialization
  // //////////////////////////////////////////////////////////////////////////
  this.start = function () {
    self.setGear(1) // reset the gears, because i dont read the gears from daum, just write them
    self.emitter.emit('key', '[daumUSB.js] - setGear to 0')
    self.setProgram(0) // reset to program 0
    self.emitter.emit('key', '[daumUSB.js] - setProgram to 0')
  }
  // //////////////////////////////////////////////////////////////////////////
  // stop port - no start function, use restart after stop
  // //////////////////////////////////////////////////////////////////////////
  this.stop = function () {
    self.pending = [] // overwrite pending array - like flush
    if (self.writer) {
      clearInterval(self.writer) // stop writing to port
    }
    if (self.reader) {
      clearInterval(self.reader) // reading 'run_data' from port
    }
    if (self.readeradress) {
      clearInterval(self.readeradress) // stop getting adress from port - this is canceled as soon as gotAdressSuccess is true, but in case stop happens before this event.
    }
  }
  // //////////////////////////////////////////////////////////////////////////
  // set daum command function - general function for sending data - still testing
  // //////////////////////////////////////////////////////////////////////////
  this.setDaumCommand = function (command, adress, sendData) {
    if (command !== daumCommands.get_Adress) {
      if (gotAdressSuccess === true) {
        if (DEBUG) console.log('[daumUSB.js] - set command [0x' + command + ']: ' + sendData)
        if (sendData === 'none') { // this is for commands that just have command and adress - no data
          var datas = Buffer.from(command + ('00' + (adress).toString()).slice(-2), 'hex')
        } else { // this is for commands that have command, adress and data
          datas = Buffer.from(command + ('00' + (adress).toString()).slice(-2) + ('00' + (sendData).toString(16)).slice(-2), 'hex')
        }
        self.write(datas)
      } else { // if no cockpit adress found, just post the message and not execute the command
        if (DEBUG) console.log('[daumUSB.js] - cannot set command [0x' + command + '] - no cockpit adress')
      }
    } else { // this is just for get adress
      datas = Buffer.from(command, 'hex')
      self.write(datas)
    }
  }
  // //////////////////////////////////////////////////////////////////////////
  // get cockpit adress - simplified by using setDaumCommand function
  // //////////////////////////////////////////////////////////////////////////
  this.getAdress = function () {
    self.setDaumCommand(daumCommands.get_Adress, 'none', 'none')
  }
  // //////////////////////////////////////////////////////////////////////////
  // get person data 1
  // //////////////////////////////////////////////////////////////////////////
  this.getPersonData = function () {
    self.setDaumCommand(daumCommands.get_PersonData, daumCockpitAdress, 'none')
  }
  // //////////////////////////////////////////////////////////////////////////
  // get 'run_Data' from ergobike
  // //////////////////////////////////////////////////////////////////////////
  this.runData = function () {
    self.setDaumCommand(daumCommands.run_Data, daumCockpitAdress, 'none')
  }
  // //////////////////////////////////////////////////////////////////////////
  // set the power resistance
  // //////////////////////////////////////////////////////////////////////////
  this.setPower = function (power) { // power validation is done here to dont loose quality in other functions
    if (power < 0) power = 0 // cut negative power values from simulation
    if (power > 800) power = 800 // cut too high power calculations
    var ergopower = (Math.ceil(power / 5) * 5) / 5 // round up and to step of 5 to match daum spec and devide by 5
    self.setDaumCommand(daumCommands.set_Watt, daumCockpitAdress, ergopower)
  }
  // //////////////////////////////////////////////////////////////////////////
  // set a program
  // //////////////////////////////////////////////////////////////////////////
  this.setProgram = function (programID) {
    self.setDaumCommand(daumCommands.set_Prog, daumCockpitAdress, programID)
  }
  // //////////////////////////////////////////////////////////////////////////
  // set watt profile / increment or decrement 5 watt
  // //////////////////////////////////////////////////////////////////////////
  this.setWattProfile = function (profile) {
    self.setDaumCommand(daumCommands.set_WattProfile, daumCockpitAdress, profile)
  }
  // //////////////////////////////////////////////////////////////////////////
  // set a gear
  // //////////////////////////////////////////////////////////////////////////
  this.setGear = function (gear) {
    self.setDaumCommand(daumCommands.set_Gear, daumCockpitAdress, gear)
  }
  // //////////////////////////////////////////////////////////////////////////
  // to string ????????? - self.toString is not used here
  // //////////////////////////////////////////////////////////////////////////
  this.toString = function () {
    return 'Daum on ' + self.port.comName
  }
}
module.exports = daumUSB // export for use in other scripts, e.g.: server.js
