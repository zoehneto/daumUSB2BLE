const Bleno = require('bleno');
const config = require('config-yml');
const DEBUG = config.DEBUG.BLE;

// Spec
// Control point op code
const ControlPointOpCode = {
  requestControl: 0x00,
  resetControl: 0x01,
  setTargetSpeed: 0x02,
  setTargetInclincation: 0x03,
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
        log('[fitness-control-point-characteristic.js] - ControlPointOpCode.requestControl.');

        if (!this.underControl) {
          if (this.serverCallback('control')) {
            log('[fitness-control-point-characteristic.js] - control succeed.');
            this.underControl = true;
            callback(this.buildResponse(state, ResultCode.success)); // ok
          } else {
            log('[fitness-control-point-characteristic.js] - control aborted.');
            callback(this.buildResponse(state, ResultCode.operationFailed))
          }
        } else {
          log('[fitness-control-point-characteristic.js] - already controlled.');
          callback(this.buildResponse(state, ResultCode.controlNotPermitted))
        }
        break;

      case ControlPointOpCode.resetControl:
        log('[fitness-control-point-characteristic.js] - ControlPointOpCode.resetControl.');

        if (this.underControl) {
          // reset the bike
          if (this.serverCallback('[fitness-control-point-characteristic.js] - reset')) {
            this.underControl = false;
            callback(this.buildResponse(state, ResultCode.success)) // ok
          } else {
            log('[fitness-control-point-characteristic.js] - control reset controlled.');
            callback(this.buildResponse(state, ResultCode.operationFailed))
          }
        } else {
          log('[fitness-control-point-characteristic.js] - reset without control.');
          callback(this.buildResponse(state, ResultCode.controlNotPermitted))
        }
        break;

      case ControlPointOpCode.setTargetPower:           // this is ERG MODE
        global.globalmode = 'ERG';                      // this is overriding the toggles from webserver
        global.globalswitch = 'Power';                  // this is overriding the toggles from webserver
        log('[fitness-control-point-characteristic.js] - ControlPointOpCode.setTargetPower.');

        if (this.underControl) {
          const watt = data.readUInt16LE(1);
          log('[fitness-control-point-characteristic.js] - Target Power set to: ' + watt);

          if (this.serverCallback('power', watt)) {
            callback(this.buildResponse(state, ResultCode.success)) // ok
            // } else {
            // log('[fitness-control-point-characteristic.js] - setTarget failed');
            // callback(this.buildResponse(state, ResultCode.operationFailed));
          }
        } else {
          log('[fitness-control-point-characteristic.js] - setTargetPower without control.');
          callback(this.buildResponse(state, ResultCode.controlNotPermitted));
        }
        break;

      case ControlPointOpCode.startOrResume:
        log('[fitness-control-point-characteristic.js] - ControlPointOpCode.startOrResume');
        callback(this.buildResponse(state, ResultCode.success));
        break;

      case ControlPointOpCode.stopOrPause:
        log('[fitness-control-point-characteristic.js] - ControlPointOpCode.stopOrPause');
        callback(this.buildResponse(state, ResultCode.success));
        break;

      case ControlPointOpCode.setIndoorBikeSimulationParameters:  // this is SIM MODE
        global.globalmode = 'SIM';                                // this is overriding the toggles from webserver
        global.globalswitch = 'Gear';                             // this is overriding the toggles from webserver
        log('[fitness-control-point-characteristic.js] - ControlPointOpCode.setIndoorBikeSimulationParameters');

        const windspeed = data.readInt16LE(1) * 0.001;
        const grade = data.readInt16LE(3) * 0.01;
        const crr = data.readUInt8(5) * 0.0001;
        const cw = data.readUInt8(6) * 0.01;

        log('[fitness-control-point-characteristic.js] - setIndoorBikeSimulationParameters - windspeed: ', windspeed);
        log('[fitness-control-point-characteristic.js] - setIndoorBikeSimulationParameters - grade: ', grade);
        log('[fitness-control-point-characteristic.js] - setIndoorBikeSimulationParameters - crr: ', crr);
        log('[fitness-control-point-characteristic.js] - setIndoorBikeSimulationParameters - cw: ', cw);

        if (this.serverCallback('simulation', windspeed, grade, crr, cw)) {
          callback(this.buildResponse(state, ResultCode.success))
        } else {
          log('[fitness-control-point-characteristic.js] - simulation failed');
          callback(this.buildResponse(state, ResultCode.operationFailed))
        }
        break;

      default: // anything else : not yet implemented
        log('[fitness-control-point-characteristic.js] - State is not supported ' + state + '.');
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
