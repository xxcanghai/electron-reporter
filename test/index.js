import Reporter from '../src'

let logger = new Reporter({
  url: '',
  dir: process.cwd() + '/logs',
  interval: 5000,
  localLogLevel: 3
})

logger.debug('Got cheese.');
logger.info('Cheese is Gouda.');
logger.warn('Cheese is quite smelly.');
logger.error('Cheese is too ripe!');
