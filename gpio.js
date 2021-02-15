const Gpio = require('onoff').Gpio;
const EventEmitter = require('events').EventEmitter;
const shiftUp = new Gpio(4, 'in', 'rising', {debounceTimeout: 10});
const shiftDown = new Gpio(17, 'in', 'rising', {debounceTimeout: 10});
const DEBUG = true;

function gpio() {
  let gear = 0;

  this.gears = function () {
    const self = this;
    self.emitter = new EventEmitter();
    shiftUp.watch((err, value) => {
      if (err) {
        // self.emitter.emit('error', err );
        throw err;
      }
      gear = gear + 1;

      self.emitter.emit('key', gear);
      self.emitter.emit('setGear', gear);
      if (DEBUG) console.log("[gpio.js] Shift to Gear: " + gear);
    });

    process.on('SIGINT', () => {
      shiftUp.unexport();
    });

    shiftDown.watch((err, value) => {
      if (err) {
        // self.emitter.emit('error', err );
        throw err;
      }
      gear = gear - 1;
      if (DEBUG) console.log("[gpio.js] Shift to Gear: " + gear);
      self.emitter.emit('setGear', gear);
    });

    process.on('SIGINT', () => {
      shiftDown.unexport();
    });
  };

}

module.exports = gpio;
