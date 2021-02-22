const config = require('config-yml');

const logLevels = {
  DEBUG: 3,
  INFO: 2,
  WARN: 1,
  ERROR: 0,
};

const colors = {
  RED: "\x1b[31m%s\x1b[0m",
  YELLOW: "\x1b[33m%s\x1b[0m",
  BLUE: "\x1b[34m%s\x1b[0m",
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
      console.info(colors.BLUE, `${this.getDateTime()} [INFO]: ${this.className} - ${message}`);
    }
  }

  warn(message) {
    if (this.checkLogLevel(logLevels.WARN)) {
      console.warn(colors.YELLOW, `${this.getDateTime()} [WARN]: ${this.className} - ${message}`);
    }
  }

  error(message) {
    if (this.checkLogLevel(logLevels.ERROR)) {
      console.error(colors.RED, `${this.getDateTime()} [ERROR]: ${this.className} - ${message}`);
    }
  }
}

module.exports = logger;
