const bleno = require('bleno')
const EventEmitter = require('events')
const CyclingPowerService = require('./cycling-power-service')
const FitnessMachineService = require('./ftms-service')

class DaumBLE extends EventEmitter {
  constructor (serverCallback) {
    super()

    this.name = 'DAUM Ergobike 8008 TRS'
    process.env['BLENO_DEVICE_NAME'] = this.name

    this.csp = new CyclingPowerService()
    this.ftms = new FitnessMachineService(serverCallback)

    let self = this
    console.log(`[daumBLE.js] - ${this.name} - BLE server starting`)
    self.emit('key', this.name + ' - BLE server starting')

    bleno.on('stateChange', (state) => {
      console.log(`[daumBLE.js] - ${this.name} - new state: ${state}`)
      self.emit('key', this.name + ' - new state: ' + state)

      self.emit('stateChange', state)

      if (state === 'poweredOn') {
        bleno.startAdvertising(self.name, [self.csp.uuid, self.ftms.uuid])
      } else {
        console.log('Stopping...')
        bleno.stopAdvertising()
      }
    })

    bleno.on('advertisingStart', (error) => {
      console.log(`[daumBLE.js] - ${this.name} - advertisingStart: ${(error ? 'error ' + error : 'success')}`)
      self.emit('advertisingStart', error)
      // self.emit('error', error)

      if (!error) {
        bleno.setServices([self.csp, self.ftms],
          (error) => {
            console.log(`[daumBLE.js] - ${this.name} - setServices: ${(error ? 'error ' + error : 'success')}`)
          })
      }
    })

    bleno.on('advertisingStartError', () => {
      console.log(`[daumBLE.js] - ${this.name} - advertisingStartError - advertising stopped`)
      self.emit('advertisingStartError')
      self.emit('error', `[daumBLE.js] - ${this.name} - advertisingStartError - advertising stopped`)
    })

    bleno.on('advertisingStop', error => {
      console.log(`[daumBLE.js] - ${this.name} - advertisingStop: ${(error ? 'error ' + error : 'success')}`)
      self.emit('advertisingStop')
      self.emit('error', `[daumBLE.js] - ${this.name} - advertisingStop: ${(error ? 'error ' + error : 'success')}`)
    })

    bleno.on('servicesSet', error => {
      console.log(`[daumBLE.js] - ${this.name} - servicesSet: ${(error) ? 'error ' + error : 'success'}`)
    })

    bleno.on('accept', (clientAddress) => {
      console.log(`[daumBLE.js] - ${this.name} - accept - Client: ${clientAddress}`)
      self.emit('accept', clientAddress)
      self.emit('key', `[daumBLE.js] - ${this.name} - accept - Client: ${clientAddress}`)
      bleno.updateRssi()
    })

    bleno.on('rssiUpdate', (rssi) => {
      console.log(`[daumBLE.js] - ${this.name} - rssiUpdate: ${rssi}`)
      self.emit('key', `[daumBLE.js] - ${this.name} - rssiUpdate: ${rssi}`)
    })
  }

  // notifiy BLE services
  notifyFTMS (event) {
    this.csp.notify(event)
    this.ftms.notify(event)
  }
}

module.exports = DaumBLE
