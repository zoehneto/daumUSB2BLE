const EventEmitter = require('events').EventEmitter;
const { SerialPort, InterByteTimeoutParser } = require('serialport');
const DaumSIM = require('../daumSIM');
const Logger = require('../logger');
const config = require('@stefcud/configyml')();

// instantiation
const daumSIM = new DaumSIM();
const logger = new Logger('daumUSB.js');

const priorityLevel = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
};

function daumUSB () {
  const self = this;
  self.port = null;
  self.parser = null;
  self.emitter = new EventEmitter();
  self.failures = 0;
  self.startUpComplete = false;
  self.getRunDataInterval = null;
  self.queueProcessor = null;
  self.lastCommandId = null;
  self.queue = [];

  // this script is looking for the address, this is working, for default, I'll set this to 00
  let daumCockpitAdress = config.daumCockpit.adress;
  // false by default to scan for cockpit address; if address cannot be retrieved, there will be no interaction with daum.
  let gotAdressSuccess = config.mock.daumUSB ? true : config.daumCockpit.gotAdressSuccess;

  /**
   * Filters port used by Daum ergobike and initiates start sequence
   */
  this.open = function () {
    if (config.mock.daumUSB) {
      self.openPort('/dev/ROBOT', 'MOCK_VENDOR', 'MOCK_PRODUCT');
    } else {
      SerialPort.list().then((ports) => {
        ports.forEach(function (p) {
          // Some adapters don't specify vendor / product id, so we let users specify the
          // appropriate adapter by device path
          if (p.path === config.daumCockpit.serialPath) {
            self.openPort(p.path, p.vendorId, p.productId);
          }
        })
      }, (err) => {
        self.emitter.emit('error', '[daumUSB.js] - open: ' + err);
        throw err;
      });
    }

    return self.emitter;
  };

  /**
   * Handles port to Daum ergobike
   */
  this.openPort = (path, vendorId, productId) => {
    logger.debug('openPort - ' + vendorId + '  ' + productId); // RS232 converter Ids
    logger.info('openPort - Ergobike found on port ' + path);
    self.emitter.emit('key', '[daumUSB.js] - Ergobike found on port ' + path);

    if (config.mock.daumUSB) {
      const { MockBinding } = require('@serialport/binding-mock');
      const { SerialPortStream } = require('@serialport/stream')

      // Create a port and enable the echo and recording.
      MockBinding.createPort(path, {echo: true, record: true});
      self.port = new SerialPortStream({ binding: MockBinding, path, baudRate: config.port.baudrate, autoOpen: false })
    } else {
      self.port = new SerialPort({
        path,
        autoOpen: false,
        baudRate: config.port.baudrate,
        dataBits: config.port.dataBits,
        parity: config.port.parity,
        stopBits: config.port.stopBits,
        rtscts: config.port.flowControl,
      });
    }

    self.parser = self.port.pipe(new InterByteTimeoutParser({interval: config.port.interval}));

    // try open
    self.internalOpen();

    self.port.on('open', () => {
      logger.debug('openPort - the serialport has been opened!');
      self.parser.on('data', self.readAndDispatch);
      self.port.drain();
      self.queueProcessor = setInterval(self.processQueue, config.intervals.flushNext); // this is writing the data to the port

      if (gotAdressSuccess === false) {
        // check, otherwise after a restart via webserver, this will run again
        logger.debug('openPort - looking for cockpit address');
        self.emitter.emit('key', '[daumUSB.js] - looking for cockpit address');

        // get address from ergobike
        self.getAdress();
      }
    });

    self.port.on('close', () => {
      logger.debug('openPort - the serialport has been closed!')
    });
  };

  /**
   * Opens port and retries if necessary
   */
  this.internalOpen = () => {
    self.port.open((err) => {
      if (!err) {
        return;
      }
      logger.debug('port is not open, retry in 10s');
      setTimeout(() => this.internalOpen(), config.intervals.openPort);
    });
  };

  /**
   * Initiates start up sequence to set Daum ergobike to a valid state
   */
  this.start = function () {
    if (config.mock.daumUSB) {
      // skip start up sequence
      setTimeout(() => self.getRunData(), config.timeouts.start);
    } else {
      setTimeout(() => {
        // reset to program 0
        self.emitter.emit('key', '[daumUSB.js] - setProgram to 0');
        self.setProgram(config.daumRanges.manual_program);

        setTimeout(() => {
          // reset the gears
          // this forces daum cockpit to change gears instead of power when using the buttons or the jog wheel
          self.setGear(config.daumRanges.min_gear);
          self.emitter.emit('key', '[daumUSB.js] - setGear to minimum gear');

          logger.info('start up complete');
          // get run data after successful start up sequence
          setTimeout(() => self.getRunData(), config.timeouts.start);
        }, config.timeouts.start);
      }, config.timeouts.start);
    }
  };

  /**
   * Closes port to Daum ergobike and clears intervals
   */
  this.stop = function () {
    if(self.getRunDataInterval) {
      clearInterval(self.getRunDataInterval);
    }

    if(self.queueProcessor) {
      self.queue = [];
      self.lastCommandId = null;
      clearInterval(self.queueProcessor);
    }

    if(self.port.isOpen) {
      self.port.close();
    }
  };

  /**
   * Reopens connection to Daum ergobike
   */
  this.restart = function () {
    logger.debug('Daum restart');
    self.failures = 0;

    self.stop();

    setTimeout(self.open, config.timeouts.open);
    setTimeout(self.start, config.timeouts.start);
  };

  /**
   * Used to get data stream from buffer and grab the values, e.g. speed, rpm,...
   */
  this.readAndDispatch = function (numbers) {
    let states = numbers;
    const data = {speed: global.globalspeed_daum, rpm: global.globalrpm_daum, gear: global.globalgear_daum, power: global.globalpower_daum};
    let failure = false;

    logger.debug('[IN]: ' + numbers.toString('hex'));
    self.emitter.emit('raw', numbers);

    if (gotAdressSuccess === false) {
      if (checkAdressResponse(numbers)) {
        self.acknowledgeCommand(config.daumCommands.get_Adress);
        // get the address from the stream by using the index
        daumCockpitAdress = self.prepareCockpitAddress(states);
        logger.info('getAdress - [Adress]: ' + daumCockpitAdress);
        self.emitter.emit('key', '[daumUSB.js] - getAdress - [Adress]: ' + daumCockpitAdress);

        // address is retrieved, lets set this to true to inform other functions that they can proceed now
        gotAdressSuccess = true;
        logger.info('getAdress - [gotAdressSuccess]: ' + gotAdressSuccess);

        // inititate start up sequence
        setTimeout(self.start, config.timeouts.start);

      } else {
        logger.debug('no address found. retrying command to get address...');
        setTimeout(() => self.getAdress(), config.intervals.getAdress);
      }
    } else {
      // Check first two bytes to assign response data to previously sent command
      switch(self.getResponseHeader(numbers)) {
        case config.daumCommands.get_Adress + daumCockpitAdress:
          self.acknowledgeCommand(config.daumCommands.get_Adress + daumCockpitAdress);
          logger.debug('get cockpit address response detected');
          break;

        case config.daumCommands.check_Cockpit + daumCockpitAdress:
          self.acknowledgeCommand(config.daumCommands.check_Cockpit + daumCockpitAdress);
          logger.debug('check cockpit response detected');
          break;

        case config.daumCommands.set_Gear + daumCockpitAdress:
          self.acknowledgeCommand(config.daumCommands.set_Gear + daumCockpitAdress);
          logger.debug('set gear response detected');
          break;

        case config.daumCommands.set_Watt + daumCockpitAdress:
          self.acknowledgeCommand(config.daumCommands.set_Watt + daumCockpitAdress);
          logger.debug('set power response detected');
          break;

        case config.daumCommands.set_Prog + daumCockpitAdress:
          self.acknowledgeCommand(config.daumCommands.set_Prog + daumCockpitAdress);
          logger.debug('set program response detected');
          break;

        case config.daumCommands.run_Data + daumCockpitAdress:
          self.acknowledgeCommand(config.daumCommands.run_Data + daumCockpitAdress);
          self.startUpComplete = true;

          if (checkRunData(states)) {
            // const cadence = (states[6])
            // if (!isNaN(cadence) && (cadence >= config.daumRanges.min_rpm && cadence <= config.daumRanges.max_rpm)) {
            //   data.cadence = cadence
            // }
            // const hr = 99 // !!! can be deleted - have to check BLE code on dependencies
            // if (!isNaN(hr)) { data.hr = hr } // !!! can be deleted - have to check BLE code on dependencies
            // TODO: check if we have to do a parseHexToInt here
            const rpm = (states[6]);
            if (!isNaN(rpm) && (rpm >= config.daumRanges.min_rpm && rpm <= config.daumRanges.max_rpm)) {
              if (rpm - global.globalrpm_daum >= config.daumRanges.rpm_threshold) {
                logger.debug('rpm_threshold overflow');
                failure = true;
              } else {
                data.rpm = rpm;
                global.globalrpm_daum = data.rpm // global variables used, because I cannot code ;)
              }
            }

            let gear = (states[16]);
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

            const program = (states[2]);
            if (!failure && !isNaN(program) && (program >= config.daumRanges.min_program && program <= config.daumRanges.max_program)) {
              data.program = program;
            }

            let power = 0;
            // power - 25 watt will always be transmitted by daum;
            // set to 0 if rpm is 0 to avoid rolling if stand still in applications like zwift or fullgaz
            if (global.globalmode !== 'ERG' && rpm === 0) {
              data.power = power;
            } else {
              power = (states[5]);
              if (!isNaN(power) && (power >= config.daumRanges.min_power && power <= config.daumRanges.max_power)) {
                if (failure || power >= config.daumRanges.power_threshold) {
                  logger.debug('power_threshold overflow');
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
            // DAUM: the ratio starts from 42:24 and ends at 53:12; see TRS_8008 Manual page 54
            // const gearRatio = config.gears.ratioLow + (data.gear - 1) * config.gears.ratioHigh
            const gearRatio = config.gearbox['g' + data.gear];                      // 1,75 + ( gl_Gang -1 )* 0.098767
            const distance = gearRatio * config.gears.circumference;                // distance in cm per rotation
            const speed = data.rpm * distance * config.gears.speedConversion;       // speed in km/h
            // const speed = (states[7])

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
            logger.warn('the run data response is not valid');
          }
          break;

        default:
          self.acknowledgeCommand(config.daumCommands.run_Data + daumCockpitAdress);  // ack run data command anyway
          self.failures++;
          logger.error('Unrecognized packet: ' + numbers.toString('hex') + ' - retrying last command');
          self.emitter.emit('error', '[daumUSB.js] - Unrecognized packet: ' + numbers.toString('hex'));
          logger.debug('Failures: ' + self.failures);

          if (!self.startUpComplete && config.mock.daumUSB) {
            logger.warn('no valid response found and start up sequence not complete. retrying to start up...');
            self.start();
          }
      }
    }
  };

  /**
   * Sends run data command after timeout
   */
  this.getRunData = () => {
    self.getRunDataInterval = setInterval(() => {
      // push run data command if it is not already in the queue
      const runDataCommands = self.queue.filter((element) => {
        return self.getResponseHeader(element.command) === config.daumCommands.run_Data + daumCockpitAdress;
      });

      if (runDataCommands.length === 0) {
        self.runData();
      }
    }, config.intervals.runData);
  };

  /**
   * Writes command to port
   */
  this.write = function (command, priority=priorityLevel.LOW) {
    self.queue.push({
      id: Math.floor(Math.random() * 1000) + 1,
      command: command,
      priority: priority,
      retries: 0,
      ack: false
    });
  };

  this.processQueue = () => {
    let element = self.queue.length > 0 ? self.queue[0] : null;

    if (element && element.ack) {
      // skip acknowledged element
      self.queue.shift();
      element = self.queue.length > 0 ? self.queue[0] : null;
    }

    if (element) {
      logger.debug(`processing first of ${self.queue.length} element(s) in queue`);
      if (element.id === self.lastCommandId) {
        logger.warn('last command has not been acknowledged. retrying...');

        element.retries += element.priority === priorityLevel.LOW ? config.queue.max_retries : 1;
        self.queue[0] = {...self.queue[0], retries: element.retries};

        if (element.retries > config.queue.max_retries) {
          if (self.getResponseHeader(self.queue[0].command) === (config.daumCommands.get_Adress + daumCockpitAdress)) {
            logger.warn('cannot retrieve cockpit address. there is a problem with the connection to the cockpit')
          }
          logger.warn('there will be the last retry');
          self.acknowledgeCommand(self.getResponseHeader(self.queue[0].command));
        }
      } else {
        self.lastCommandId = element.id;
      }

      if (self.port) {
        logger.debug('[OUT]: ' + element.command.toString('hex'));
        const buffer = new Buffer.from(element.command);

        self.port.write(buffer);
      } else {
        logger.warn('[OUT]: Communication port is not open - not sending data: ' + element.command);
      }
    } else {
      logger.debug('there is nothing in the queue.');
      // TODO: get run data, because we have some time
      // self.runData();
    }

    if (self.queue.length >= config.queue.max_commands) {
      logger.warn('maximum queue size reached. we have to remove some commands');
      self.queue.shift();
    }
  };

  this.acknowledgeCommand = (command) => {
    if (self.queue.length > 0) {
      // acknowledge the right commands...
      const idx = self.queue.findIndex((element) => {
        return self.getResponseHeader(element.command) === command;
      });

      if (idx >= 0) {
        logger.debug(`ack received - set ${idx + 1}. '${command}' command from queue as done`);
        self.queue[idx] = { ...self.queue[idx], ack: true };
      } else {
        logger.warn(`ack received for command '${command}', but no relevant element found in queue`);
      }
    } else {
      logger.warn('there is no command to acknowledge');
    }
  };

  /**
   * Sets Daum command - general function for sending data
   */
  this.setDaumCommand = function (command, adress, sendData, priority=priorityLevel.LOW) {
    if (command !== config.daumCommands.get_Adress) {
      if (gotAdressSuccess === true) {
        logger.debug('set command [0x' + command + ']: ' + sendData);

        if (sendData === 'none') {
          // this is for commands that just have command and address - no data
          const datas = Buffer.from(command + ('00' + (adress).toString()).slice(-2), 'hex');
          self.write(datas, priority);
        } else {
          // this is for commands that have command, address and data
          const datas = Buffer.from(command + ('00' + (adress).toString()).slice(-2) + ('00' + (sendData).toString(16)).slice(-2), 'hex');
          self.write(datas, priority);
        }
      } else {
        // if no cockpit address found, just post the message and not execute the command
        logger.debug('cannot set command [0x' + command + '] - no cockpit address');
        self.emitter.emit('error', '[daumUSB.js] - cannot set command [0x' + command + '] - no cockpit address');
      }
    } else {
      // this is just for get address
      const datas = Buffer.from(command, 'hex');
      self.write(datas, priority);
    }
  };

  /**
   * Get cockpit adress
   */
  this.getAdress = function () {
    logger.info('get cockpit address');
    self.emitter.emit('key', '[daumUSB.js] - getAdress');

    self.setDaumCommand(config.daumCommands.get_Adress, 'none', 'none', priorityLevel.HIGH);
  };

  /**
   * Get person data
   */
  this.getPersonData = function () {
    self.setDaumCommand(config.daumCommands.get_PersonData, daumCockpitAdress, 'none', priorityLevel.MEDIUM);
  };

  /**
   * Get run data from ergobike
   */
  this.runData = function () {
    logger.info('get run data');
    self.emitter.emit('key', '[daumUSB.js] - runData');

    self.setDaumCommand(config.mock.daumUSB ?
      mockRunData() :
      config.daumCommands.run_Data, daumCockpitAdress, 'none', priorityLevel.LOW);
  };

  /**
   * Set the power resistance
   */
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

    self.setDaumCommand(config.daumCommands.set_Watt, daumCockpitAdress, ergopower, priorityLevel.HIGH);
  };

  /**
   * Set a program
   */
  this.setProgram = function (programID) {
    self.setDaumCommand(config.daumCommands.set_Prog, daumCockpitAdress, programID, priorityLevel.HIGH);
  };

  /**
   * Set watt profile / increment or decrement 5 watt
   */
  this.setWattProfile = function (profile) {
    self.setDaumCommand(config.daumCommands.set_WattProfile, daumCockpitAdress, profile, priorityLevel.HIGH);
  };

  /**
   * Set a gear
   */
  this.setGear = function (gear) {
    self.setDaumCommand(config.daumCommands.set_Gear, daumCockpitAdress, gear, priorityLevel.HIGH);
  };


  /**
   * Prepares Cockpit-Address for further use
   */
  this.prepareCockpitAddress = (data) => {
    let address = daumCockpitAdress;

    if (data.length > 1) {
      address = data[1].toString(16);
      if (address.length === 1) {
        address = '0' + address;
      }
    } else {
      logger.warn(`preparation of cockpit address failed. using ${daumCockpitAdress} for it.`);
    }

    return address;
  };

  /**
   * Gets header of response data (1. Byte: Command; 2. Byte: Cockpit-Address)
   */
  this.getResponseHeader = (data) => {
    return data[0].toString(16) + self.prepareCockpitAddress(data);
  };
}

/* HELPER FUNCTIONS */

/**
 * Checks getAdress response
 */
function checkAdressResponse(states) {
  return states.length === 2 && states[0].toString(16) === config.daumCommands.get_Adress;
}

/**
 * Checks runData response
 */
function checkRunData(states) {
  if (states.length < 17) {
    logger.warn('the given run data is not long enough');
    return false;
  }
  // TODO: maybe we have to be more rigorous here
  if (parseHexToInt(states[2]) === config.daumRanges.manual_program &&      // 3. Byte: Valid Program (here: manual)
    parseHexToInt(states[3]) <= config.daumRanges.max_Person &&           // 4. Byte: Valid Person
    parseHexToInt(states[5]) >= config.daumRanges.min_power &&            // 6. Byte: Valid Power Range
    parseHexToInt(states[5]) <= config.daumRanges.max_power &&
    parseHexToInt(states[6]) >= config.daumRanges.min_rpm &&              // 7. Byte: Valid RPM
    parseHexToInt(states[6]) <= config.daumRanges.max_rpm &&
    parseHexToInt(states[7]) >= config.daumRanges.min_speed &&            // 8. Byte: Valid Speed Range
    parseHexToInt(states[7]) <= config.daumRanges.max_speed &&
    parseHexToInt(states[16]) >= config.daumRanges.min_gear &&              // 17. Byte: Valid Gear Range
    parseHexToInt(states[16]) <= config.daumRanges.max_gear) {
    return true;
  }
  logger.warn('the given run data is not completely valid, but we are trying to filter it anyway');
  return true;
}

function parseHexToInt(hex) {
  return parseInt(hex.toString(16), 16);
}

/* MOCK FUNCTIONS */
function mockGetAdress() {
  return new Buffer.from('1100');
}

function mockRunData() {
  const temp = 70 + Math.floor(Math.random() * 5);
  const rpm = temp.toString(16);
  //return new Buffer.from('40000002000500000000000000000000810000');
  return new Buffer.from('400000000019' + rpm + '1D0000000000000000040000');
}

module.exports = daumUSB;
