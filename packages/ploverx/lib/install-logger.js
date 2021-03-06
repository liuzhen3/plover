const pathUtil = require('path');
const fse = require('fs-extra');
const winston = require('winston');
const Logger = require('plover-logger');

require('winston-daily-rotate-file');


const LEVEL = { error: 1, warn: 2, info: 3, debug: 4 };


module.exports = function(settings) {
  const map = settings.loggers || {};
  const list = [];
  for (const name in map) {
    list.push(create(name, map[name]));
  }
  if (!list.length) {
    return function() {};
  }

  const isDebug = !!process.env.DEBUG;

  Logger.level = isDebug ? 'debug' :
    // set level to highest level in config
    list.reduce((last, o) => {
      const level = o.config.level;
      return LEVEL[level] > LEVEL[last] ? level : last;
    }, 'error');

  const handler = Logger.handler;

  Logger.handler = function(name, level, message) {
    isDebug && handler(name, level, message);
    const item = list.find(o => (o.test ? o.test(name) : true));
    const logger = item && winston.loggers.get(item.name);
    logger && logger[level](message, { name });
  };

  // restore
  return function() {
    Logger.handler = handler;
  };
};


function create(name, config) {
  const match = config.match;
  const test = !match ? null :
    typeof match === 'string' ? n => match === n :
      typeof match.test === 'function' ? n => match.test(n) :
        typeof match === 'function' ? match : null;

  const transports = [];
  const Console = winston.transports.Console;
  const formatter = config.formatter || defaultFormatter;

  ensureFileDir(config.file);
  ensureFileDir(config.errorFile);

  config.file && transports.push(createTransport(name, config.file, config.level, config));

  config.errorFile && transports.push(createTransport(`${name}-error`, config.errorFile, 'error', config));

  config.consoleLevel && transports.push(new Console({
    name: `${name}-console`,
    level: config.consoleLevel,
    colorize: true,
    formatter
  }));

  config.transports && transports.push(...config.transports);
  winston.loggers.add(name, { transports });

  return { name, test, config };
}


function createTransport(name, filename, level, config) {
  const formatter = config.formatter || defaultFormatter;
  const File = config.rotate ?
    winston.transports.DailyRotateFile :
    winston.transports.File;
  return new File({
    name,
    filename,
    level,
    json: false,
    prepend: true,
    formatter
  });
}


function defaultFormatter(opts) {
  const now = new Date();
  const time = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate() +
      ' ' + now.getHours() + ':' + now.getMinutes() + ':' + now.getSeconds();
  return time + ' [' + opts.level.toUpperCase() + '] [' +
      opts.meta.name + '] ' + opts.message;
}


function ensureFileDir(path) {
  path && fse.ensureDirSync(pathUtil.dirname(path));
}
