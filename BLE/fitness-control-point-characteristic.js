const Bleno = require('@abandonware/bleno');
const Logger = require('../logger');

const logger = new Logger('fitness-control-point-characteristic.js');

// Spec
// Control point op code
const ControlPointOpCode = {
  requestControl: 0x00,
  resetControl: 0x01,
  setTargetSpeed: 0x02,
  setTargetInclination: 0x03,
  setTargetResistanceLevel: 0x04,
  setTargetPower: 0x05,
  setTargetHeartRate: 0x06,
  startOrResume: 0x07,
  stopOrPause: 0x08,
  setTargetedExpendedEnergy: 0x09,
  setTargetedNumberOfSteps: 0x0A,
  setTargetedNumberOfStrides: 0x0B,
  setTargetedDistance: 0x0C,
  setTargetedTrainingTime: 0x0D,
  setTargetedTimeInTwoHeartRateZones: 0x0E,
  setTargetedTimeInThreeHeartRateZones: 0x0F,
  setTargetedTimeInFiveHeartRateZones: 0x10,
  setIndoorBikeSimulationParameters: 0x11,
  setWheelCircumference: 0x12,
  spinDownControl: 0x13,
  setTargetedCadence: 0x14,
  responseCode: 0x80
};

const ResultCode = {
  reserved: 0x00,
  success: 0x01,
  opCodeNotSupported: 0x02,
  invalidParameter: 0x03,
  operationFailed: 0x04,
  controlNotPermitted: 0x05
};

class FitnessControlPoint extends Bleno.Characteristic {
  constructor (callback) {
    super({
      uuid: '2AD9',
      value: null,
      properties: ['write'],
      descriptors: [
        new Bleno.Descriptor({
          // Client Characteristic Configuration
          uuid: '2902',
          value: Buffer.alloc(2)
        })
      ]
    });

    this.underControl = false;
    if (!callback) {
      throw 'callback cant be null'
    }
    this.serverCallback = callback
  }

  // Follow Control Point instruction from the client
  onWriteRequest (data, offset, withoutResponse, callback) {
    const state = data.readUInt8(0);
    switch (state) {
      case ControlPointOpCode.requestControl:
        logger.debug('ControlPointOpCode.requestControl.');

        if (!this.underControl) {
          if (this.serverCallback('control')) {
            logger.debug('control succeed.');
            this.underControl = true;
            callback(this.buildResponse(state, ResultCode.success)); // ok
          } else {
            logger.debug('control aborted.');
            callback(this.buildResponse(state, ResultCode.operationFailed))
          }
        } else {
          logger.debug('already controlled.');
          callback(this.buildResponse(state, ResultCode.controlNotPermitted))
        }
        break;

      case ControlPointOpCode.resetControl:
        logger.debug('ControlPointOpCode.resetControl.');

        if (this.underControl) {
          // reset the bike
          if (this.serverCallback('[fitness-control-point-characteristic.js] - reset')) {
            this.underControl = false;
            callback(this.buildResponse(state, ResultCode.success)) // ok
          } else {
            logger.debug('control reset controlled.');
            callback(this.buildResponse(state, ResultCode.operationFailed))
          }
        } else {
          logger.debug('reset without control.');
          callback(this.buildResponse(state, ResultCode.controlNotPermitted))
        }
        break;

      case ControlPointOpCode.setTargetPower:           // this is ERG MODE
        global.globalmode = 'ERG';                      // this is overriding the toggles from webserver
        global.globalswitch = 'Power';                  // this is overriding the toggles from webserver
        logger.debug('ControlPointOpCode.setTargetPower.');

        if (this.underControl) {
          const watt = data.readUInt16LE(1);
          logger.debug('Target Power set to: ' + watt);

          if (this.serverCallback('power', watt)) {
            callback(this.buildResponse(state, ResultCode.success)) // ok
            // } else {
            // logger.debug('setTarget failed');
            // callback(this.buildResponse(state, ResultCode.operationFailed));
          }
        } else {
          logger.debug('setTargetPower without control.');
          callback(this.buildResponse(state, ResultCode.controlNotPermitted));
        }
        break;

      case ControlPointOpCode.startOrResume:
        logger.debug('ControlPointOpCode.startOrResume');
        callback(this.buildResponse(state, ResultCode.success));
        break;

      case ControlPointOpCode.stopOrPause:
        logger.debug('ControlPointOpCode.stopOrPause');
        callback(this.buildResponse(state, ResultCode.success));
        break;

      case ControlPointOpCode.setIndoorBikeSimulationParameters:  // this is SIM MODE
        global.globalmode = 'SIM';                                // this is overriding the toggles from webserver
        global.globalswitch = 'Gear';                             // this is overriding the toggles from webserver
        logger.debug('ControlPointOpCode.setIndoorBikeSimulationParameters');

        const windspeed = data.readInt16LE(1) * 0.001;
        const grade = data.readInt16LE(3) * 0.01;
        const crr = data.readUInt8(5) * 0.0001;
        const cw = data.readUInt8(6) * 0.01;

        logger.debug('setIndoorBikeSimulationParameters - windspeed: ', windspeed);
        logger.debug('setIndoorBikeSimulationParameters - grade: ', grade);
        logger.debug('setIndoorBikeSimulationParameters - crr: ', crr);
        logger.debug('setIndoorBikeSimulationParameters - cw: ', cw);

        if (this.serverCallback('simulation', windspeed, grade, crr, cw)) {
          callback(this.buildResponse(state, ResultCode.success))
        } else {
          logger.debug('simulation failed');
          callback(this.buildResponse(state, ResultCode.operationFailed))
        }
        break;

      default: // anything else : not yet implemented
        logger.debug('State is not supported ' + state + '.');
        callback(this.buildResponse(state, ResultCode.opCodeNotSupported));
        break;
    }
  };

  // Return the result message
  buildResponse (opCode, resultCode) {
    const buffer = new Buffer.alloc(3);
    buffer.writeUInt8(0x80, 0);
    buffer.writeUInt8(opCode, 1);
    buffer.writeUInt8(resultCode, 2);
    return buffer;
  }
}

module.exports = FitnessControlPoint;
