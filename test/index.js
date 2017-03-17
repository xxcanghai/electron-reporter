import Reporter from '../src'

let logger = new Reporter({
  url: '',
  uploadUrl: '',
  dir: process.cwd() + '/logs',
  interval: 5000,
  localLogLevel: 0,
  consoleLogLevel: 0
})

logger.debug('Got cheese.');
logger.info('Cheese is Gouda.');
logger.warn('Cheese is quite smelly.');
logger.error('Cheese is too ripe!');
