const EventEmitter = require('events').EventEmitter;
const {SerialPort, InterByteTimeoutParser} = require('serialport');
const DaumSIM = require('../daumSIM');
const Logger = require('../logger');
const fs = require('fs');
const config = require('yaml').parse(fs.readFileSync('config.yml', 'utf8'));

// instantiation
const daumSIM = new DaumSIM();
const logger = new Logger('daumUSB.js');

const priorityLevel = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
};

class daumUSB {
  constructor() {
    this.port = null;
    this.parser = null;
    this.emitter = new EventEmitter();
    this.failures = 0;
    this.startUpComplete = false;
    this.getRunDataInterval = null;
    this.queueProcessor = null;
    this.lastCommandId = null;
    this.queue = [];

    // this script is looking for the address, this is working, for default, I'll set this to 00
    this.daumCockpitAdress = config.daumCockpit.adress;
    // false by default to scan for cockpit address; if address cannot be retrieved, there will be no interaction with daum.
    this.gotAdressSuccess = config.mock.daumUSB ? true : config.daumCockpit.gotAdressSuccess;
  }

  /**
   * Filters port used by Daum ergobike and initiates start sequence
   */
  open() {
    if (config.mock.daumUSB) {
      this.openPort('/dev/ROBOT', 'MOCK_VENDOR', 'MOCK_PRODUCT');
    } else {
      SerialPort.list().then((ports) => {
        ports.forEach((p) => {
          // Some adapters don't specify vendor / product id, so we let users specify the
          // appropriate adapter by device path
          if (p.path === config.daumCockpit.serialPath) {
            this.openPort(p.path, p.vendorId, p.productId);
          }
        })
      }, (err) => {
        this.emitter.emit('error', '[daumUSB.js] - open: ' + err);
        throw err;
      });
    }

    return this.emitter;
  };

  /**
   * Handles port to Daum ergobike
   */
  openPort(path, vendorId, productId) {
    logger.debug('openPort - ' + vendorId + '  ' + productId); // RS232 converter Ids
    logger.info('openPort - Ergobike found on port ' + path);
    this.emitter.emit('key', '[daumUSB.js] - Ergobike found on port ' + path);

    if (config.mock.daumUSB) {
      const {MockBinding} = require('@serialport/binding-mock');
      const {SerialPortStream} = require('@serialport/stream')

      // Create a port and enable the echo and recording.
      MockBinding.createPort(path, {echo: true, record: true});
      this.port = new SerialPortStream({binding: MockBinding, path, baudRate: config.port.baudrate, autoOpen: false})
    } else {
      this.port = new SerialPort({
        path,
        autoOpen: false,
        baudRate: config.port.baudrate,
        dataBits: config.port.dataBits,
        parity: config.port.parity,
        stopBits: config.port.stopBits,
        rtscts: config.port.flowControl,
      });
    }

    this.parser = this.port.pipe(new InterByteTimeoutParser({interval: config.port.interval}));

    // try open
    this.internalOpen();

    this.port.on('open', () => {
      logger.debug('openPort - the serialport has been opened!');
      this.parser.on('data', (data) => this.readAndDispatch(data));
      this.port.drain();
      this.queueProcessor = setInterval(() => this.processQueue(), config.intervals.flushNext); // this is writing the data to the port

      if (this.gotAdressSuccess === false) {
        // check, otherwise after a restart via webserver, this will run again
        logger.debug('openPort - looking for cockpit address');
        this.emitter.emit('key', '[daumUSB.js] - looking for cockpit address');

        // get address from ergobike
        this.getAdress();
      }
    });

    this.port.on('close', () => {
      logger.debug('openPort - the serialport has been closed!')
    });
  };

  /**
   * Opens port and retries if necessary
   */
  internalOpen() {
    this.port.open((err) => {
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
  start() {
    if (config.mock.daumUSB) {
      // skip start up sequence
      setTimeout(() => this.getRunData(), config.timeouts.start);
    } else {
      setTimeout(() => {
        // reset to program 0
        this.emitter.emit('key', '[daumUSB.js] - setProgram to 0');
        this.setProgram(config.daumRanges.manual_program);

        setTimeout(() => {
          // reset the gears
          // this forces daum cockpit to change gears instead of power when using the buttons or the jog wheel
          this.setGear(config.daumRanges.min_gear);
          this.emitter.emit('key', '[daumUSB.js] - setGear to minimum gear');

          logger.info('start up complete');
          // get run data after successful start up sequence
          setTimeout(() => this.getRunData(), config.timeouts.start);
        }, config.timeouts.start);
      }, config.timeouts.start);
    }
  };

  /**
   * Closes port to Daum ergobike and clears intervals
   */
  stop() {
    if (this.getRunDataInterval) {
      clearInterval(this.getRunDataInterval);
    }

    if (this.queueProcessor) {
      this.queue = [];
      this.lastCommandId = null;
      clearInterval(this.queueProcessor);
    }

    if (this.port.isOpen) {
      this.port.close();
    }
  };

  /**
   * Reopens connection to Daum ergobike
   */
  restart() {
    logger.debug('Daum restart');
    this.failures = 0;

    this.stop();

    setTimeout(() => this.open(), config.timeouts.open);
    setTimeout(() => this.start(), config.timeouts.start);
  };

  /**
   * Used to get data stream from buffer and grab the values, e.g. speed, rpm,...
   */
  readAndDispatch(numbers) {
    let states = numbers;
    const data = {
      speed: global.globalspeed_daum,
      rpm: global.globalrpm_daum,
      gear: global.globalgear_daum,
      power: global.globalpower_daum
    };
    let failure = false;

    logger.debug('[IN]: ' + numbers.toString('hex'));
    this.emitter.emit('raw', numbers);

    if (this.gotAdressSuccess === false) {
      if (checkAdressResponse(numbers)) {
        this.acknowledgeCommand(config.daumCommands.get_Adress);
        // get the address from the stream by using the index
        this.daumCockpitAdress = this.prepareCockpitAddress(states);
        logger.info('getAdress - [Adress]: ' + this.daumCockpitAdress);
        this.emitter.emit('key', '[daumUSB.js] - getAdress - [Adress]: ' + this.daumCockpitAdress);

        // address is retrieved, lets set this to true to inform other functions that they can proceed now
        this.gotAdressSuccess = true;
        logger.info('getAdress - [gotAdressSuccess]: ' + this.gotAdressSuccess);

        // inititate start up sequence
        setTimeout(() => this.start(), config.timeouts.start);

      } else {
        logger.debug('no address found. retrying command to get address...');
        setTimeout(() => this.getAdress(), config.intervals.getAdress);
      }
    } else {
      // Check first two bytes to assign response data to previously sent command
      switch (this.getResponseHeader(numbers)) {
        case config.daumCommands.get_Adress + this.daumCockpitAdress:
          this.acknowledgeCommand(config.daumCommands.get_Adress + this.daumCockpitAdress);
          logger.debug('get cockpit address response detected');
          break;

        case config.daumCommands.check_Cockpit + this.daumCockpitAdress:
          this.acknowledgeCommand(config.daumCommands.check_Cockpit + this.daumCockpitAdress);
          logger.debug('check cockpit response detected');
          break;

        case config.daumCommands.set_Gear + this.daumCockpitAdress:
          this.acknowledgeCommand(config.daumCommands.set_Gear + this.daumCockpitAdress);
          logger.debug('set gear response detected');
          break;

        case config.daumCommands.set_Watt + this.daumCockpitAdress:
          this.acknowledgeCommand(config.daumCommands.set_Watt + this.daumCockpitAdress);
          logger.debug('set power response detected');
          break;

        case config.daumCommands.set_Prog + this.daumCockpitAdress:
          this.acknowledgeCommand(config.daumCommands.set_Prog + this.daumCockpitAdress);
          logger.debug('set program response detected');
          break;

        case config.daumCommands.run_Data + this.daumCockpitAdress:
          this.acknowledgeCommand(config.daumCommands.run_Data + this.daumCockpitAdress);
          this.startUpComplete = true;

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
                  this.setGear(gear);
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
                const simpower = daumSIM.physics(global.globalwindspeed_ble, global.globalgrade_ble, global.globalcrr_ble, global.globalcw_ble, global.globalspeed_daum);
                this.setPower(simpower.toFixed(0));
              }
            }

            // emit data for further use
            if (Object.keys(data).length > 0) {
              this.emitter.emit('data', data);
            }
          } else {
            logger.warn('the run data response is not valid');
          }
          break;

        default:
          this.acknowledgeCommand(config.daumCommands.run_Data + this.daumCockpitAdress);  // ack run data command anyway
          this.failures++;
          logger.error('Unrecognized packet: ' + numbers.toString('hex') + ' - retrying last command');
          this.emitter.emit('error', '[daumUSB.js] - Unrecognized packet: ' + numbers.toString('hex'));
          logger.debug('Failures: ' + this.failures);

          if (!this.startUpComplete && config.mock.daumUSB) {
            logger.warn('no valid response found and start up sequence not complete. retrying to start up...');
            this.start();
          }
      }
    }
  };

  /**
   * Sends run data command after timeout
   */
  getRunData() {
    this.getRunDataInterval = setInterval(() => {
      // push run data command if it is not already in the queue
      const runDataCommands = this.queue.filter((element) => {
        return this.getResponseHeader(element.command) === config.daumCommands.run_Data + this.daumCockpitAdress;
      });

      if (runDataCommands.length === 0) {
        this.runData();
      }
    }, config.intervals.runData);
  };

  /**
   * Writes command to port
   */
  write(command, priority = priorityLevel.LOW) {
    this.queue.push({
      id: Math.floor(Math.random() * 1000) + 1,
      command: command,
      priority: priority,
      retries: 0,
      ack: false
    });
  };

  processQueue() {
    let element = this.queue.length > 0 ? this.queue[0] : null;

    if (element && element.ack) {
      // skip acknowledged element
      this.queue.shift();
      element = this.queue.length > 0 ? this.queue[0] : null;
    }

    if (element) {
      logger.debug(`processing first of ${this.queue.length} element(s) in queue`);
      if (element.id === this.lastCommandId) {
        logger.warn('last command has not been acknowledged. retrying...');

        element.retries += element.priority === priorityLevel.LOW ? config.queue.max_retries : 1;
        this.queue[0] = {...this.queue[0], retries: element.retries};

        if (element.retries > config.queue.max_retries) {
          if (this.getResponseHeader(this.queue[0].command) === (config.daumCommands.get_Adress + this.daumCockpitAdress)) {
            logger.warn('cannot retrieve cockpit address. there is a problem with the connection to the cockpit')
          }
          logger.warn('there will be the last retry');
          this.acknowledgeCommand(this.getResponseHeader(this.queue[0].command));
        }
      } else {
        this.lastCommandId = element.id;
      }

      if (this.port) {
        logger.debug('[OUT]: ' + element.command.toString('hex'));
        const buffer = new Buffer.from(element.command);

        this.port.write(buffer);
      } else {
        logger.warn('[OUT]: Communication port is not open - not sending data: ' + element.command);
      }
    } else {
      logger.debug('there is nothing in the queue.');
      // TODO: get run data, because we have some time
      // this.runData();
    }

    if (this.queue.length >= config.queue.max_commands) {
      logger.warn('maximum queue size reached. we have to remove some commands');
      this.queue.shift();
    }
  };

  acknowledgeCommand(command) {
    if (this.queue.length > 0) {
      // acknowledge the right commands...
      const idx = this.queue.findIndex((element) => {
        return this.getResponseHeader(element.command) === command;
      });

      if (idx >= 0) {
        logger.debug(`ack received - set ${idx + 1}. '${command}' command from queue as done`);
        this.queue[idx] = {...this.queue[idx], ack: true};
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
  setDaumCommand(command, adress, sendData, priority = priorityLevel.LOW) {
    if (command !== config.daumCommands.get_Adress) {
      if (this.gotAdressSuccess === true) {
        logger.debug('set command [0x' + command + ']: ' + sendData);

        if (sendData === 'none') {
          // this is for commands that just have command and address - no data
          const datas = Buffer.from(command + ('00' + (adress).toString()).slice(-2), 'hex');
          this.write(datas, priority);
        } else {
          // this is for commands that have command, address and data
          const datas = Buffer.from(command + ('00' + (adress).toString()).slice(-2) + ('00' + (sendData).toString(16)).slice(-2), 'hex');
          this.write(datas, priority);
        }
      } else {
        // if no cockpit address found, just post the message and not execute the command
        logger.debug('cannot set command [0x' + command + '] - no cockpit address');
        this.emitter.emit('error', '[daumUSB.js] - cannot set command [0x' + command + '] - no cockpit address');
      }
    } else {
      // this is just for get address
      const datas = Buffer.from(command, 'hex');
      this.write(datas, priority);
    }
  };

  /**
   * Get cockpit adress
   */
  getAdress() {
    logger.info('get cockpit address');
    this.emitter.emit('key', '[daumUSB.js] - getAdress');

    this.setDaumCommand(config.daumCommands.get_Adress, 'none', 'none', priorityLevel.HIGH);
  };

  /**
   * Get person data
   */
  getPersonData() {
    this.setDaumCommand(config.daumCommands.get_PersonData, this.daumCockpitAdress, 'none', priorityLevel.MEDIUM);
  };

  /**
   * Get run data from ergobike
   */
  runData() {
    logger.info('get run data');
    this.emitter.emit('key', '[daumUSB.js] - runData');

    this.setDaumCommand(config.mock.daumUSB ?
      mockRunData() :
      config.daumCommands.run_Data, this.daumCockpitAdress, 'none', priorityLevel.LOW);
  };

  /**
   * Set the power resistance
   */
  setPower(power) {
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

    this.setDaumCommand(config.daumCommands.set_Watt, this.daumCockpitAdress, ergopower, priorityLevel.HIGH);
  };

  /**
   * Set a program
   */
  setProgram(programID) {
    this.setDaumCommand(config.daumCommands.set_Prog, this.daumCockpitAdress, programID, priorityLevel.HIGH);
  };

  /**
   * Set watt profile / increment or decrement 5 watt
   */
  setWattProfile(profile) {
    this.setDaumCommand(config.daumCommands.set_WattProfile, this.daumCockpitAdress, profile, priorityLevel.HIGH);
  };

  /**
   * Set a gear
   */
  setGear(gear) {
    this.setDaumCommand(config.daumCommands.set_Gear, this.daumCockpitAdress, gear, priorityLevel.HIGH);
  };


  /**
   * Prepares Cockpit-Address for further use
   */
  prepareCockpitAddress(data) {
    let address = this.daumCockpitAdress;

    if (data.length > 1) {
      address = data[1].toString(16);
      if (address.length === 1) {
        address = '0' + address;
      }
    } else {
      logger.warn(`preparation of cockpit address failed. using ${this.gotAdressSuccess} for it.`);
    }

    return address;
  };

  /**
   * Gets header of response data (1. Byte: Command; 2. Byte: Cockpit-Address)
   */
  getResponseHeader(data) {
    return data[0].toString(16) + this.prepareCockpitAddress(data);
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
