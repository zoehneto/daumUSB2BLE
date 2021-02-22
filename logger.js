const config = require('config-yml');

const logLevels = {
  DEBUG: 3,
  INFO: 2,
  WARN: 1,
  ERROR: 0,
};

class logger {
  constructor(className) {
    this.level = config.DEBUG.level;
    this.className = className;
  }

  checkLogLevel(logLevel) {
    return this.level >= logLevel;
  }

  getDateTime() {
    return new Date().toISOString();
  }

  debug(message) {
    if (this.checkLogLevel(logLevels.DEBUG)) {
      console.debug(`${this.getDateTime()} [DEBUG]: ${this.className} - ${message}`);
    }
  }

  info(message) {
    if (this.checkLogLevel(logLevels.INFO)) {
      console.info(`${this.getDateTime()} [INFO]: ${this.className} - ${message}`);
    }
  }

  warn(message) {
    if (this.checkLogLevel(logLevels.WARN)) {
      console.warn(`${this.getDateTime()} [WARN]: ${this.className} - ${message}`);
    }
  }

  error(message) {
    if (this.checkLogLevel(logLevels.ERROR)) {
      console.error(`${this.getDateTime()} [ERROR]: ${this.className} - ${message}`);
    }
  }
}

module.exports = logger;
