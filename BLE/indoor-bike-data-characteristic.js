var Bleno = require('bleno')
const config = require('config-yml') // Use config for yaml config files in Node.js projects
var DEBUG = config.DEBUG.BLE

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
    })
    this._updateValueCallback = null
  }

  onSubscribe (maxValueSize, updateValueCallback) {
    if (DEBUG) console.log('[indoor-bike-data-characteristic.js] - client subscribed')
    this._updateValueCallback = updateValueCallback
    return this.RESULT_SUCCESS
  }

  onUnsubscribe () {
    if (DEBUG) console.log('[indoor-bike-data-characteristic.js] - client unsubscribed')
    this._updateValueCallback = null
    return this.RESULT_UNLIKELY_ERROR
  }

  notify (event) {
    if (!('power' in event)) {
      // ignore events with no power and no hr data
      return this.RESULT_SUCCESS
    }
    if (DEBUG) console.log('[indoor-bike-data-characteristic.js] - notify')
    var buffer = new Buffer.alloc(8) // changed buffer size from 10 to 8 because of deleting hr
    buffer.writeUInt8(0x44, 0) // 0100 0100 - rpm + power (speed is always on)
    buffer.writeUInt8(0x00, 1) // deleted hr, so all bits are 0

    var index = 2
    if ('speed' in event) {
      var speed = event.speed
      if (DEBUG) console.log('[indoor-bike-data-characteristic.js] - speed: ' + speed)
      buffer.writeUInt16LE(speed * 100, index) // index starts with 2
      // index += 2 // this might have caused the mixup with hr value in power, if one value is missing, then its shifted to the next 2 bytes
    }

    if ('rpm' in event) {
      var rpm = event.rpm
      if (DEBUG) console.log('[indoor-bike-data-characteristic.js] - rpm: ' + rpm)
      buffer.writeUInt16LE(rpm * 2, index + 2) // index is now 4
      // index += 2 // this might have caused the mixup with hr value in power, if one value is missing, then its shifted to the next 2 bytes
    }

    if ('power' in event) {
      var power = event.power
      if (DEBUG) console.log('[indoor-bike-data-characteristic.js] - power: ' + power)
      buffer.writeInt16LE(power, index + 4) // index is now 6
      // index += 2 // this might have caused the mixup with hr value in power, if one value is missing, then its shifted to the next 2 bytes
    }

    // if ('hr' in event) {
    //   var hr = event.hr
    //   if (DEBUG) console.log('[indoor-bike-data-characteristic.js] - hr : ' + hr)
    //   buffer.writeUInt8(hr, index)
    //   index += 2
    // }

    if (this._updateValueCallback) {
      this._updateValueCallback(buffer)
    } else {
      if (DEBUG) console.log('[indoor-bike-data-characteristic.js] - nobody is listening')
    }
    return this.RESULT_SUCCESS
  }
}

module.exports = IndoorBikeDataCharacteristic
