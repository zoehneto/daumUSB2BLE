// Doc: https://www.bluetooth.com/specifications/gatt/viewer?attributeXmlFile=org.bluetooth.service.fitness_machine.xml
const Bleno = require('bleno')
const FitnessControlPoint = require('./fitness-control-point-characteristic')
const IndoorBikeDataCharacteristic = require('./indoor-bike-data-characteristic')
const StaticReadCharacteristic = require('./static-read-characteristic')
const FitnessMachineStatusCharacteristic = require('./fitness-machine-status-characteristic')

class FitnessMachineService extends Bleno.PrimaryService {
  constructor (callback) {
    let controlPoint = new FitnessControlPoint(callback)
    let indoorBikeData = new IndoorBikeDataCharacteristic()
    let fitnessMachineStatus = new FitnessMachineStatusCharacteristic()

    super({
      uuid: '1826',
      characteristics: [
        new StaticReadCharacteristic('2ACC', 'Fitness Machine Feature', [
          0x02,
          0x40,
          0x00,
          0x00,
          0x08,
          0x20,
          0x00,
          0x00
        ]), // Feature Characteristics - crazy mixup in bits and bytes
        controlPoint,
        indoorBikeData,
        fitnessMachineStatus,
        new StaticReadCharacteristic('2AD8', 'SupportedPowerRange', [
          0x19,
          0x00,
          0x20,
          0x03,
          0x05,
          0x00
        ]) // SupportedPowerRange (25 - 800 with 5watts step)
        // 00 19 03 20 00 05 - checked with nRF connect, and it displays 6400, 8195 1280 watt.
        // go to: https://www.scadacore.com/tools/programming-calculators/online-hex-converter/
        // 19 00 20 03 05 00 - this should be the correct - INT16 - Little Endian (BA)
      ]
    })

    this.indoorBikeData = indoorBikeData
  }

  /*
   * Transfer event from daum USB to the given characteristics
   */
  notify (event) {
    this.indoorBikeData.notify(event)
  }
}

module.exports = FitnessMachineService
