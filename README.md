# Electron Reporter

> Electron && NW 日志上报模块

### features
  * 根据上报类型分隔日志文件
  * 自动根据日期和文件大小分割日志文件
  * 排队上报到远程服务器, 失败自动重试, 保留所有原始日志

#### usage
> npm install electron-reporter

```
  import Reporter from 'electron-reporter'
  let logger = new Reporter({
    url: 'xxx',
    dir: process.cwd() + '/logs',
    interval: 10 * 1000
  })

  let params = {
     ad: 'tom',
     xx: 'xx',
     ...
  }

  logger.debug('Got cheese.', params);
  logger.info('Cheese is Gouda.', params);
  logger.warn('Cheese is quite smelly.', params);
  logger.error('Cheese is too ripe!', params);
```
