var Gpio = require('onoff').Gpio;
var EventEmitter = require('events').EventEmitter;
var shiftUp = new Gpio(4, 'in', 'rising', {debounceTimeout: 10});
var shiftDown = new Gpio(17, 'in', 'rising', {debounceTimeout: 10});
var DEBUG = true;

function gpio() {


  var gear = 0;

  this.gears = function () {
    var self = this;
    self.emitter = new EventEmitter();
    shiftUp.watch((err, value) => {
      if (err) {
        // self.emitter.emit('error', err );
        throw err;
      };
      gear = gear + 1;

      self.emitter.emit('key', gear);
      self.emitter.emit('setGear', gear.);
      if (DEBUG) console.log("[gpio.js] Shift to Gear: " + gear);
    });

    process.on('SIGINT', () => {
      shiftUp.unexport();
    });

    shiftDown.watch((err, value) => {
      if (err) {
        // self.emitter.emit('error', err );
        throw err;
      };
      gear = gear - 1;
      if (DEBUG) console.log("[gpio.js] Shift to Gear: " + gear);
      self.emitter.emit('setGear', gear);
    });

    process.on('SIGINT', () => {
      shiftDown.unexport();
    });
  };

}

module.exports = gpio
