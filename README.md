# Electron Reporter

> Electron && NW 日志上报模块

### features
  * 根据上报类型分隔日志文件
  * 自动根据日期和文件大小分割日志文件
  * 排队上报到远程服务器, 失败自动重试, 保留所有原始日志
  * 自动把最近N天的日志文件打成加密压缩包并上传
  * 自动清理久远的历史日志

#### usage
> npm install electron-reporter

```
  import Reporter from 'electron-reporter'
  let logger = new Reporter({
    // 上报server地址 必须
    url: 'xxx',
    // 日志文件上传地址
    uploadUrl: '',
    // 设备名字
    deviceName: '',
    // 客户端版本号
    version: '',
    // log文件存储目录 必须
    dir: process.cwd(),
    // 默认上报级别 默认是 3
    level: 3, // DEBUG: 1, INFO: 2, WARN: 3, ERROR: 4
    // 不同级别类型日志是否完全保存在本地, 默认全部保存在本地level级别为0
    // 一旦通过构造函数设置后, 便不可变更, 变更后也是无效的
    localLogLevel: 0,
    // 控制台log打印级别, 同上
    consoleLogLevel: 0,
    // 定时上报时间间隔 默认5分钟
    interval: 5 * 1000 * 60,
    // 一次上报日志数量允许的最大值, 默认 500
    maxCount: 500,
    // 日志文件命名的前缀 默认为空
    filenamePrefix: '',
    // 上报时需要ping的域名集合, 默认为空
    hosts: [],
    // 本地历史记录保持时间, 默认清除7天前的
    historyKeepDays: 7,
    // 临时文件保持时间, 默认清除3天前的
    tempKeepDays: 3,
    // 加密配置
    encryptOptions: {
      key: '',
      iv: '',
      clearEncoding: 'utf8',
      algorithm: 'aes-128-cbc'
    }
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

setTimeout(() => {
  // 重设配置选项
  logger.configure({
    level: 0
  })
  // 强制立即上报
  logger.forceProcess()
}, 6000)
```
