const EventEmitter = require('events');

class DaumBLE extends EventEmitter {
  constructor (serverCallback) {
    super();
  }
  notifyFTMS (event) {
  }
}

module.exports = DaumBLE;
