const Bleno = require('@abandonware/bleno');
const config = require('config-yml');
const Logger = require('../logger');

const logger = new Logger('cycling-power-measurement-characteristic.js');

// Spec
// https://developer.bluetooth.org/gatt/characteristics/Pages/CharacteristicViewer.aspx?u=org.bluetooth.characteristic.cycling_power_measurement.xml

class CyclingPowerMeasurementCharacteristic extends Bleno.Characteristic {
  constructor () {
    super({
      uuid: '2A63',
      value: null,
      properties: ['notify'],
      descriptors: [
        new Bleno.Descriptor({
          uuid: '2901',
          value: 'Cycling Power Measurement'
        }),
        new Bleno.Descriptor({
          // Client Characteristic Configuration
          uuid: '2902',
          value: Buffer.alloc(2)
        }),
        new Bleno.Descriptor({
          // Server Characteristic Configuration
          uuid: '2903',
          value: Buffer.alloc(2)
        })
      ]
    });
    this._updateValueCallback = null;
  }

  onSubscribe (maxValueSize, updateValueCallback) {
    logger.debug('client subscribed to PM');
    this._updateValueCallback = updateValueCallback;
    return this.RESULT_SUCCESS;
  }

  onUnsubscribe () {
    logger.debug('client unsubscribed from PM');
    this._updateValueCallback = null;
    return this.RESULT_UNLIKELY_ERROR;
  }

  notify (event) {
    if (!('power' in event) && !('rpm' in event)) {
      // ignore events with no power and no crank data
      return this.RESULT_SUCCESS;
    }
    const buffer = new Buffer.alloc(8);
    // flags
    // 00000001 - 1   - 0x001 - Pedal Power Balance Present
    // 00000010 - 2   - 0x002 - Pedal Power Balance Reference
    // 00000100 - 4   - 0x004 - Accumulated Torque Present
    // 00001000 - 8   - 0x008 - Accumulated Torque Source
    // 00010000 - 16  - 0x010 - Wheel Revolution Data Present
    // 00100000 - 32  - 0x020 - Crank Revolution Data Present
    // 01000000 - 64  - 0x040 - Extreme Force Magnitudes Present
    // 10000000 - 128 - 0x080 - Extreme Torque Magnitudes Present

    buffer.writeUInt16LE(0x0000, 0);

    if ('power' in event) {
      const power = event.power;
      logger.debug('power: ' + power);
      buffer.writeInt16LE(power, 2);
    }

    if ('rpm' in event) {
      const rpm = event.rpm;
      logger.debug('rpm: ' + event.rpm);
      buffer.writeUInt16LE(rpm, 4);
    }

    if (this._updateValueCallback) {
      this._updateValueCallback(buffer);
    }
    return this.RESULT_SUCCESS;
  }
}

module.exports = CyclingPowerMeasurementCharacteristic;
