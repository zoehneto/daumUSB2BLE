const Bleno = require('bleno');
const config = require('config-yml');

function log (msg) {
  if (config.DEBUG.BLE) {
    console.log(msg);
  }
}

class IndoorBikeDataCharacteristic extends Bleno.Characteristic {
  constructor () {
    super({
      uuid: '2AD2',
      value: null,
      properties: ['notify'],
      descriptors: [
        new Bleno.Descriptor({
          // Client Characteristic Configuration
          uuid: '2902',
          value: Buffer.alloc(2)
        })
      ]
    });
    this._updateValueCallback = null;
  }

  onSubscribe (maxValueSize, updateValueCallback) {
    log('[indoor-bike-data-characteristic.js] - client subscribed');
    this._updateValueCallback = updateValueCallback;
    return this.RESULT_SUCCESS;
  }

  onUnsubscribe () {
    log('[indoor-bike-data-characteristic.js] - client unsubscribed');
    this._updateValueCallback = null;
    return this.RESULT_UNLIKELY_ERROR;
  }

  notify (event) {
    if (!('power' in event)) {
      // ignore events with no power and no hr data
      return this.RESULT_SUCCESS;
    }
    log('[indoor-bike-data-characteristic.js] - notify');
    const buffer = new Buffer.alloc(8);                 // changed buffer size from 10 to 8 because of deleting hr
    buffer.writeUInt8(0x44, 0);            // 0100 0100 - rpm + power (speed is always on)
    buffer.writeUInt8(0x00, 1) ;           // deleted hr, so all bits are 0

    const index = 2;
    if ('speed' in event) {
      const speed = event.speed;
      log('[indoor-bike-data-characteristic.js] - speed: ' + speed);
      buffer.writeUInt16LE(speed * 100, index);          // index starts with 2

      // this might have caused the mixup with hr value in power,
      // if one value is missing, then its shifted to the next 2 bytes
      // index += 2
    }

    if ('rpm' in event) {
      const rpm = event.rpm;
      log('[indoor-bike-data-characteristic.js] - rpm: ' + rpm);
      buffer.writeUInt16LE(rpm * 2, index + 2);   // index is now 4

      // this might have caused the mixup with hr value in power,
      // if one value is missing, then its shifted to the next 2 bytes
      // index += 2
    }

    if ('power' in event) {
      const power = event.power;
      log('[indoor-bike-data-characteristic.js] - power: ' + power);
      buffer.writeInt16LE(power, index + 4);           // index is now 6

      // this might have caused the mixup with hr value in power,
      // if one value is missing, then its shifted to the next 2 bytes
      // index += 2
    }

    // if ('hr' in event) {
    //   const hr = event.hr
    //   log('[indoor-bike-data-characteristic.js] - hr : ' + hr)
    //   buffer.writeUInt8(hr, index)
    //   index += 2
    // }

    if (this._updateValueCallback) {
      this._updateValueCallback(buffer);
    } else {
      log('[indoor-bike-data-characteristic.js] - nobody is listening');
    }
    return this.RESULT_SUCCESS;
  }
}

module.exports = IndoorBikeDataCharacteristic;
