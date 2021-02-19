const EventEmitter = require('events').EventEmitter;
const com = require('serialport');
const DaumSIM = require('./daumSIM');
const config = require('config-yml');

const daumSIM = new DaumSIM();  // instantiation

function log (msg) {
  if (config.DEBUG.daumUSB) {
    console.log(msg);
  }
}

function daumUSB () {
  const self = this;
  self.port = null;
  self.pending = [];                                    // buffer for pushing pending commands to the port
  self.writer = null;                                   // used for flushing next pending data
  self.reader = null;                                   // used for 'runData' command
  self.readeradress = null;                             // used for 'getAdress' command
  self.emitter = new EventEmitter();

  // this script is looking for the address, this is working, for default, I'll set this to 00
  let daumCockpitAdress = config.daumCockpit.adress;
  // false by default to scan for cockpit address; if address cannot be retrieved, there will be no interaction with daum.
  let gotAdressSuccess = config.daumCockpit.gotAdressSuccess;

  // push data in queue before flushNext is writing it to port
  this.write = function (string) {
    self.pending.push(string);
    log('[daumUSB.js] - this.write - [OUT]: ', string);
  };

  // send (flush) pending messages to port (sequencial)
  this.flushNext = function () {
    if (self.pending.length === 0) {
      // log('[daumUSB.js] - this.flushNext - nothing pending');
      return;
    }
    const string = self.pending.shift();
    if (self.port) {
      const buffer = new Buffer.from(string);
      log('[daumUSB.js] - flushNext - [OUT]: ', buffer);
      self.port.write(buffer);
    } else {
      log('[daumUSB.js] - flushNext - Communication port is not open - not sending data: ' + string);
    }
  };

  // used when port open to get data stream from buffer and grab the values, e.g. speed, rpm,...
  this.readAndDispatch = function (numbers) {
    log('[daumUSB.js] - readAndDispatch - [IN]: ', numbers);
    self.emitter.emit('raw', numbers);
    const states = numbers;
    const statesLen = states.length;
    const data = {};
    let index = 0;

    if (gotAdressSuccess === false) {
      // this loop is for parsing the cockpit address
      for (let i = 0; i < statesLen; i++) {
        log('[daumUSB.js] - getAdress - [Index]: ', i, ' ', states[i]);

        // search for getAdress prefix
        if (states[i].toString(16) === config.daumCommands.get_Adress) {
          index = i;
          log('[daumUSB.js] - getAdress - [Index]: ', index);

          // get the adress from the stream by using the index
          daumCockpitAdress = (states[1 + index]).toString();
          log('[daumUSB.js] - getAdress - [Adress]: ', daumCockpitAdress);
          self.emitter.emit('key', '[daumUSB.js] - getAdress - [Adress]: ' + daumCockpitAdress);

          // stop looking for adress
          clearInterval(self.readeradress);

          // clear pending array
          self.pending = [];

          // address is retrieved, lets set this to true to inform other functions that they can proceed now
          gotAdressSuccess = true;

          // timeout is neccesarry to changes gears back to 1;
          // there is an invalid value send, that sets gear 17 = 0x11,
          // this should be filtered before data is read, but does not work
          setTimeout(self.start, config.timeouts.start);
          log('[daumUSB.js] - getAdress - [gotAdressSuccess]: ', gotAdressSuccess);

          // stop if prefix found and break
          break;
        }
      }
    } else {
      for (let i = 0; i < (statesLen - 2); i++) {
        // this loop is for parsing the datastream after gotAddressSuccess is true and we can use the address for commands
        // and search for the runData and daumCockpitAdress and manual watt program prefix
        if (states[i].toString(16) === config.daumCommands.run_Data && states[i + 1].toString(16) === daumCockpitAdress && states[i + 2] === 0) {
          index = i;
          log('[daumUSB.js] - runData - [Index]: ', index.toString());

          // stop if prefix found and break
          break;
        }

        if (i === statesLen - 3) {
          log('[daumUSB.js] - runData - [Index]: WRONG PROGRAM SET - SET MANUAL WATTPROGRAM 00');
          self.emitter.emit('error', '[daumUSB.js] - runData - [Index]: WRONG PROGRAM SET - SET MANUAL WATTPROGRAM 00');
        }
      }
    }

    // gotAdressSuccess check to avoid invalid values 0x11 = 17 at startup;
    // just check if stream is more than value, this is obsolete, because of custom parser that is parsing 40 bytes
    if (states.length >= 19 && gotAdressSuccess === true) {
      let failure = false;
      // const cadence = (states[6 + index])
      // if (!isNaN(cadence) && (cadence >= config.daumRanges.min_rpm && cadence <= config.daumRanges.max_rpm)) {
      //   data.cadence = cadence
      // }
      // const hr = 99 // !!! can be deleted - have to check BLE code on dependencies
      // if (!isNaN(hr)) { data.hr = hr } // !!! can be deleted - have to check BLE code on dependencies
      const rpm = (states[6 + index]);
      if (!isNaN(rpm) && (rpm >= config.daumRanges.min_rpm && rpm <= config.daumRanges.max_rpm)) {
        if (rpm - global.globalrpm_daum >= config.daumRanges.rpm_threshold) {
          log('[daumUSB.js] - rpm_threshold overflow');
          failure = true;
        } else {
          data.rpm = rpm;
          global.globalrpm_daum = data.rpm // global variables used, because I cannot code ;)
        }
      }

      let gear = (states[16 + index]);
      if (!isNaN(gear) && (gear >= config.daumRanges.min_gear && gear <= config.daumRanges.max_gear)) {
        if (failure) {
          data.gear = global.globalgear_daum;
        } else {
          // because Daum has by default 28 gears, check and overwrite if gpio maxGear is lower
          if (gear > config.gpio.maxGear) {
            // ceiling the maxGear with parameter
            gear = config.gpio.maxGear;
            // overwrite gear to Daum
            self.setGear(gear);
          }
          data.gear = gear;
          global.globalgear_daum = data.gear; // global variables used, because I cannot code ;)
        }
      }

      const program = (states[2 + index]);
      if (!failure && !isNaN(program) && (program >= config.daumRanges.min_program && program <= config.daumRanges.max_program)) {
        data.program = program;
      }

      let power = 0;
      // power - 25 watt will always be transmitted by daum;
      // set to 0 if rpm is 0 to avoid rolling if stand still in applications like zwift or fullgaz
      if (rpm === 0) {
        data.power = power;
      } else {
        power = (states[5 + index]);
        if (!isNaN(power) && (power >= config.daumRanges.min_power && power <= config.daumRanges.max_power)) {
          if (failure || power >= config.daumRanges.power_threshold) {
            log('[daumUSB.js] - power_threshold overflow');
            data.power = global.globalpower_daum;  // let's take the last known value
          } else {
            // multiply with factor 5, see Daum spec
            data.power = power * config.daumRanges.power_factor;
            global.globalpower_daum = data.power;
          }
        }
      }

      // calculating the speed based on the RPM to gain some accuracy; speed signal is only integer
      // as long as the gearRatio is the same as in the spec of DAUM,
      // the actual speed on the display and the calculated one will be the same
      // DAUM: the ratio starts from 42:24 and ends at 53:12; see TRS_8008 Manual page 16
      // const gearRatio = config.gears.ratioLow + (data.gear - 1) * config.gears.ratioHigh
      const gearRatio = config.gearbox['g' + data.gear];                      // 1,75 + ( gl_Gang -1 )* 0.098767
      const distance = gearRatio * config.gears.circumference;                // distance in cm per rotation
      const speed = data.rpm * distance * config.gears.speedConversion;       // speed in km/h
      // const speed = (states[7 + index])

      if (!isNaN(speed) && (speed >= config.daumRanges.min_speed && speed <= config.daumRanges.max_speed)) {
        // reduce number of decimals after calculation to 1
        data.speed = Number(speed).toFixed(1);
        global.globalspeed_daum = data.speed; // global variables used, because I cannot code ;)

        // run power simulation here in parallel to server.js to enhance resolution of resistance,
        // e.g.: ble only triggers sim once per second, but if you pedal faster, this needs to be here.
        if (global.globalmode === 'SIM') {
          daumSIM.physics(global.globalwindspeed_ble, global.globalgrade_ble, global.globalcrr_ble, global.globalcw_ble, global.globalrpm_daum, global.globalspeed_daum, global.globalgear_daum);
          self.setPower(Number(global.globalsimpower_daum).toFixed(0));
        }
      }

      // emit data for further use
      if (Object.keys(data).length > 0) {
        self.emitter.emit('data', data);
      }
    } else {
      // is obsolete, because of custom parser that parses 40 bytes - but just in case to have some error handling
      self.unknownHandler(numbers);
    }
  };

  // unknown handlers start
  this.unknownHandler = function (numbers) {
    log('[daumUSB.js] - unknownHandler - Unrecognized packet: ', numbers);
    self.emitter.emit('error', '[daumUSB.js] - unknownHandler: ' + numbers);
  };

  // open port as specified by daum
  this.open = function () {
    com.list(function (err, ports) {
      if (err) {
        self.emitter.emit('error', '[daumUSB.js] - open: ' + err);
        throw err;
      }
      ports.forEach(function (p) {
        // ??? don't know if this is the ID of ergobike, or the serial adapter, this has to be configured for every bike, so I might skip it
        if (p.vendorId && p.productId) {
          log('[daumUSB.js] - open:' + p.vendorId + '  ' + p.productId); // RS232 converter Ids
          log('[daumUSB.js] - open - Ergobike found on port ' + p.comName);
          self.emitter.emit('key', '[daumUSB.js] - Ergobike found on port ' + p.comName);

          // custom parser set to byte length that is more than the actual response message of ergobike,
          // but no other way possible right now that's why the index loops in 'readAndDispatch' are used to
          // get the prefix of each command
          const port = new com.SerialPort(p.comName, {
            baudrate: config.port.baudrate,
            dataBits: config.port.dataBits,
            parity: config.port.parity,
            stopBits: config.port.stopBits,
            flowControl: config.port.flowControl,
            parser: com.parsers.byteLength(config.port.parserLength)
          }, false);

          port.open(function () {
            self.port = port;
            port.on('data', self.readAndDispatch);
            // this is writing the data to the port;
            // i've put here the timeout of DAUM interface spec; 50ms
            self.writer = setInterval(self.flushNext, config.intervals.flushNext);

            // check, otherwise after a restart via webserver, this will run again
            if (gotAdressSuccess === false) {
              log('[daumUSB.js] - looking for cockpit adress');
              self.emitter.emit('key', '[daumUSB.js] - looking for cockpit adress');
              // continiously get adress from ergobike, the interval is canceled if gotAdressSuccess is true
              self.readeradress = setInterval(self.getAdress, config.intervals.getAdress);
            }

            log('[daumUSB.js] - runData');
            self.emitter.emit('key', '[daumUSB.js] - runData');
            // continiously get 'run_Data' from ergobike; 500ms means, every 1000ms a buffer
            self.reader = setInterval(self.runData, config.intervals.runData);
          })
        }
      })
    });
    return self.emitter;
  };

  // restart port
  this.restart = function () {
    log('[daumUSB.js] - Daum restart');
    if (self.port.isOpen) {
      self.stop();
      self.port.close();
    }
    setTimeout(self.open, config.timeouts.open);
    setTimeout(self.start, config.timeouts.start);
  };

  // start sequence - this is just a dummy, because getAdress is used during port initialization
  // set gear as second, to enable switching gears with jog wheel or buttons in cockpit by default
  this.start = function () {
    // reset to program 0
    self.setProgram(0);
    self.emitter.emit('key', '[daumUSB.js] - setProgram to 0');

    // reset the gears
    // this forces daum cockpit to change gears instead of power when using the buttons or the jog wheel
    self.setGear(config.daumRanges.min_gear);
    self.emitter.emit('key', '[daumUSB.js] - setGear to minimum gear');
  };

  // stop port - no start function, use restart after stop
  this.stop = function () {
    // overwrite pending array - like flush
    self.pending = [];
    if (self.writer) {
      // stop writing to port
      clearInterval(self.writer);
    }
    if (self.reader) {
      // stop reading 'run_data' from port
      clearInterval(self.reader);
    }
    if (self.readeradress) {
      // stop reading address from port
      // this is canceled as soon as gotAddressSuccess is true, but in case stop happens before this event.
      clearInterval(self.readeradress);
    }
  };

  // set daum command function - general function for sending data - still testing
  this.setDaumCommand = function (command, adress, sendData) {
    if (command !== config.daumCommands.get_Adress) {
      if (gotAdressSuccess === true) {
        log('[daumUSB.js] - set command [0x' + command + ']: ' + sendData);

        if (sendData === 'none') {
          // this is for commands that just have command and address - no data
          const datas = Buffer.from(command + ('00' + (adress).toString()).slice(-2), 'hex');
          self.write(datas);
        } else {
          // this is for commands that have command, address and data
          const datas = Buffer.from(command + ('00' + (adress).toString()).slice(-2) + ('00' + (sendData).toString(16)).slice(-2), 'hex');
          self.write(datas);
        }

      } else {
        // if no cockpit adress found, just post the message and not execute the command
        log('[daumUSB.js] - cannot set command [0x' + command + '] - no cockpit adress');
        self.emitter.emit('error', '[daumUSB.js] - cannot set command [0x' + command + '] - no cockpit adress');
      }
    } else {
      // this is just for get address
      datas = Buffer.from(command, 'hex');
      self.write(datas);
    }
  };

  // get cockpit adress - simplified by using setDaumCommand function
  this.getAdress = function () {
    self.setDaumCommand(config.daumCommands.get_Adress, 'none', 'none');
  };

  // get person data 1
  this.getPersonData = function () {
    self.setDaumCommand(config.daumCommands.get_PersonData, daumCockpitAdress, 'none');
  };

  // get 'run_Data' from ergobike
  this.runData = function () {
    self.setDaumCommand(config.daumCommands.run_Data, daumCockpitAdress, 'none');
  };

  // set the power resistance
  this.setPower = function (power) {
    // power validation is done here to don't loose quality in other functions
    if (power < config.daumRanges.min_power * config.daumRanges.power_factor) {
      // cut negative or too low power values from simulation
      power = config.daumRanges.min_power * config.daumRanges.power_factor;
    }

    if (power > config.daumRanges.max_power * config.daumRanges.power_factor) {
      // cut too high power calculations
      power = config.daumRanges.max_power * config.daumRanges.power_factor;
    }
    // round up and to step of 5 to match daum spec and devide by 5
    const ergopower = Math.round(power / config.daumRanges.power_factor);
    self.setDaumCommand(config.daumCommands.set_Watt, daumCockpitAdress, ergopower);
  };

  // set a program
  this.setProgram = function (programID) {
    self.setDaumCommand(config.daumCommands.set_Prog, daumCockpitAdress, programID);
  };

  // set watt profile / increment or decrement 5 watt
  this.setWattProfile = function (profile) {
    self.setDaumCommand(config.daumCommands.set_WattProfile, daumCockpitAdress, profile);
  };

  // set a gear
  this.setGear = function (gear) {
    self.setDaumCommand(config.daumCommands.set_Gear, daumCockpitAdress, gear);
  };
  // to string ????????? - self.toString is not used here
  this.toString = function () {
    return 'Daum on ' + self.port.comName;
  }
}

module.exports = daumUSB;
