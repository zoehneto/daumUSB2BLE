const EventEmitter = require('events').EventEmitter;
const config = require('config-yml');

function log (msg) {
  if (config.DEBUG.daumUSB) {
    console.log('MOCK: ' + msg);
  }
}

function daumUSB () {
  const self = this;
  self.reader = null;                                   // used for 'runData' command
  self.emitter = new EventEmitter();

  // this script is looking for the address, this is working, for default, I'll set this to 00
  let daumCockpitAdress = config.daumCockpit.adress;

  // push data in queue before flushNext is writing it to port
  this.write = function (string) {
    log('[daumUSB.js] - this.write - [OUT]: ', string);
  };

  // send (flush) pending messages to port (sequencial)
  this.flushNext = function () {
  };

  // used when port open to get data stream from buffer and grab the values, e.g. speed, rpm,...
  this.readAndDispatch = function (numbers) {
    log('[daumUSB.js] - readAndDispatch - [IN]: ', numbers);
    self.emitter.emit('raw', numbers);

    // let's initialize the new data object with the last known values
    const data = {program: 0, rpm: global.globalrpm_daum, gear: global.globalgear_daum, power: global.globalpower_daum, speed: global.globalspeed_daum};

    // emit data for further use
    if (Object.keys(data).length > 0) {
      self.emitter.emit('data', data);
    }
  };

  // unknown handlers start
  this.unknownHandler = function (numbers) {
    log('[daumUSB.js] - unknownHandler - Unrecognized packet: ', numbers);
    self.emitter.emit('error', '[daumUSB.js] - unknownHandler: ' + numbers);
  };

  // open port as specified by daum
  this.open = function () {
    self.readAndDispatch('');
    log('[daumUSB.js] - runData');
    self.emitter.emit('key', '[daumUSB.js] - runData');
    // continiously get 'run_Data' from ergobike; 500ms means, every 1000ms a buffer
    self.reader = setInterval(self.runData, config.intervals.runData);
    return self.emitter;
  };

  // restart port
  this.restart = function () {
    log('[daumUSB.js] - Daum restart');
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
    if (self.reader) {
      // stop reading 'run_data' from port
      clearInterval(self.reader);
    }
  };

  // set daum command function - general function for sending data - still testing
  this.setDaumCommand = function (command, adress, sendData) {
    log('[daumUSB.js] - set command [0x' + command + ']: ' + sendData);
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
