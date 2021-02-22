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

  debug(message) {
    if (this.checkLogLevel(logLevels.DEBUG)) {
      console.debug(`[DEBUG]: ${this.className} - ${message}`);
    }
  }

  info(message) {
    if (this.checkLogLevel(logLevels.INFO)) {
      console.info(`[INFO]: ${this.className} - ${message}`);
    }
  }

  warn(message) {
    if (this.checkLogLevel(logLevels.WARN)) {
      console.warn(`[WARN]: ${this.className} - ${message}`);
    }
  }

  error(message) {
    if (this.checkLogLevel(logLevels.ERROR)) {
      console.error(`[ERROR]: ${this.className} - ${message}`);
    }
  }
}

module.exports = logger;