/** @fileOverview 给electron/nw等类似客户端用的日志上报模块 **/
import ip from 'ip'
// import network from 'network'
import os from 'os'
// import ping from 'ping'
import request from 'request'
import path from 'path'

import fs from 'fs-extra-promise'
import _ from 'lodash'
import log4js from 'log4js'
import moment from 'moment'
import unzip from 'cross-unzip'
import FILE from './file'
import Queue from './ReportQueue'

// 一些辅助方法
const reportHelper = {
  endOfLine() {
    return os.EOL || '\n'
  },
  t2p(thunk, ...args) {
    return new Promise((resolve, reject) => {
      thunk(...args, (err, ...rest) => {
        if (err) reject(err)
        else {
          resolve(rest.length > 1 ? rest : rest[0])
        }
      })
    })
  },
  /**
   * 获取当前设备所属平台
   * @returns {string}
   */
  getPlatform() {
    const IS_WIN = process.platform === 'win32'
    const IS_MAC = process.platform === 'darwin'
    return IS_MAC ? 'mac' : (IS_WIN ? 'pc' : 'linux')
  },

  /**
   * 上报时的时间戳
   * @returns {number}
   */
  getTime() {
    return new Date().getTime()
  },

  /**
   * 获得当前设备ip地址
   * @returns {*}
   */
  getIP() {
    return ip.address()
  },

  /**
   * 获得当前设备的系统版本
   */
  getSystemVersion() {
    return os.release()
  },

  /**
   * 获取当前设备的网络环境 有5种  wire|wireless|FireWire|Thunderbolt|Other
   * @returns {Promise}
   */
  // async getNetworkType() {
  //   return new Promise((resolve) => {
  //     network.get_active_interface((err, res) => {
  //       if (res && res.type) {
  //         resolve(res.type)
  //       } else {
  //         resolve('unknown')
  //       }
  //     })
  //   })
  // },

  /**
   * 获取指定服务器的延时数值
   * @returns {Promise.<{}>}
   */
  // async getPingStatus(hosts = []) {
  //   const promises = hosts.map(async(host, idx) => {
  //     const p = await ping.promise.probe(host)
  //     return {host, time: p.avg}
  //   })
  //   const pArray = await Promise.all(promises)
  //   const pObject = {}
  //   _.reduce(pArray, (acc, val) => {
  //     acc[val.host] = val.time
  //     return acc
  //   }, pObject)
  //   return pObject
  // }
}

const IP = reportHelper.getIP()
const systemVersion = reportHelper.getSystemVersion()
const platForm = reportHelper.getPlatform()

class Reporter {

  static LEVELS = {
    DEBUG: 1,
    INFO: 2,
    WARN: 3,
    ERROR: 4
  }

  static helper = reportHelper

  /**
   * 根据level的value取得level的key
   * @param val
   * @returns {string}
   */
  static getLevelKey(val) {
    let name
    Object.keys(Reporter.LEVELS).forEach(key => {
      if (Reporter.LEVELS[key] === val) {
        name = key
      }
    })
    return name
  }

  static defaultOptions = {
    // 上报地址
    url: '',
    // 日志文件上传地址
    uploadUrl: '',
    // 设备名字
    deviceName: '',
    // 客户端版本号
    version: '',
    // log文件存储目录
    dir: process.cwd(),
    // 默认上报级别
    level: Reporter.LEVELS.WARN,
    // 不同级别类型日志是否完全保存在本地, 默认全部保存在本地
    // 一旦通过构造函数设置后, 便不可变更, 变更后也是无效的
    localLogLevel: 0,
    // 是否打印控制台log, 同上
    consoleLogLevel: 0,
    // 定时上报时间间隔, 即便没积攒达到上报数量阈值，只要达到时间间隔，仍然上报
    interval: 1000 * 60 * 5,
    // 上报积攒数量阈值, 积攒到阈值就上报
    threshold: 500,
    // 一次上报日志数量允许的最大值
    maxCount: 500,
    // 文件命名的前缀
    filenamePrefix: '',
    // 上报时需要ping的域名集合
    hosts: [],
    // 本地历史记录保持时间
    historyKeepDays: 7,
    // 临时文件保持时间
    tempKeepDays: 3,
    // 加密配置
    encryptOptions: {
      key: '78afc8512559b62f',
      iv: '78afc8512559b62f',
      clearEncoding: 'utf8',
      algorithm: 'aes-128-cbc'
    }
  }

  constructor(options) {
    /**
     * 初始化配置参数
     * @type {{url: string, deviceName: string, version: string, dir: string, level: string, interval: number, threshold: number, filenamePrefix: string, hosts: array}}
     */
    this.options = Object.assign({}, Reporter.defaultOptions, options)

    // 如果指明的目录不存在 要先创建
    const {dir} = this.options
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir)
    }

    /**
     * 处理上报行为的queue
     * @type {ReportQueue}
     */
    this.logQueue = new Queue({
      processFunction: this.report.bind(this)
    })

    /**
     * 处理上传的queue
     * @type {ReportQueue}
     */
    this.uploadQueue = new Queue({
      processFunction: this.upload.bind(this)
    })

    /**
     * log4js实例, 每种类型一个实例, 分文件存储
     * @type {Logger}
     */
    this.loggers = {}

    // 根据level生成log4js配置
    let appenders = Object.keys(Reporter.LEVELS).map((key) => {
      let appender = this._buildAppender(key)
      this.loggers[Reporter.LEVELS[key]] = appender.category
      return appender
    })

    // 配置log4js
    log4js.configure({
      appenders
    })

    // 根据level把logger实例填充入loggers
    appenders.forEach(appender => {
      Object.keys(this.loggers).forEach(key => {
        if (appender.category === this.loggers[key]) {
          this.loggers[key] = log4js.getLogger(appender.category)
        }
      })
    })

    this._addReportTimer()
    this._addClearTimer()
    // 清除太过久远的日志文件
    this.clearHistoryFiles()
  }

  /**
   * 重新设置配置选项
   * @param op
   */
  configure(op) {
    if (!op) {
      return
    }
    let options = Object.assign({}, op)
    if (options.localLogLevel) {
      delete options.localLogLevel
      console.warn('configure localLogLevel is not supported')
    }
    if (options.consoleLogLevel) {
      delete options.consoleLogLevel
      console.warn('configure consoleLogLevel is not supported')
    }
    let { interval } = this.options
    this.options = Object.assign(this.options, options)
    if (this.options.interval && interval !== this.options.interval) {
      this._addReportTimer()
    }
  }

  /**
   * 定时上报的timer
   * @private
   */
  _addReportTimer() {
    if (this.reportTimer) {
      clearInterval(this.reportTimer)
    }
    this.reportTimer = setInterval(this.forceProcess.bind(this), this.options.interval)
  }

  /**
   * 定时清理的timer
   * @private
   */
  _addClearTimer() {
    let interval = 1000 * 60 * 60 * 24 * 3 // 每隔3天定时清理
    if (this.clearTimer) {
      clearInterval(this.clearTimer)
    }
    this.clearTimer = setInterval(this.clearHistoryFiles.bind(this), interval)
  }

  /**
   * 根据文件名获取文件路径
   * @param name
   * @returns {string|*}
   * @private
   */
  _getFilePathByName(name) {
    let {dir} = this.options
    return path.join(dir, name)
  }

  /**
   * 清除太过久远的文件
   * @returns {Promise.<void>}
   */
  async clearHistoryFiles() {
    try {
      let {historyKeepDays, tempKeepDays} = this.options
      let _clearCb = (file) => {
        fs.unlinkSync(this._getFilePathByName(file.filename))
      }
      // 清除普通文件
      let files = await this.getRecentFiles(historyKeepDays, false)
      files.historyFiles.forEach(_clearCb)

      // 清除临时文件
      let temp = await this.getRecentFiles(tempKeepDays, true)
      temp.historyFiles.forEach(_clearCb)

      // todo 还没有清理package目录下备份的日志文件
    } catch (e) {
      this._reportSelfError('clearHistoryFiles failed')
    }
  }

  /**
   * 每种日志类型创建一个文件, 创建一个logger实例
   * @param levelKey
   * @returns {{type: string, appenders: Array, category: string}}
   * @private
   */
  _buildAppender(levelKey) {
    let {filenamePrefix, localLogLevel, consoleLogLevel} = this.options
    let name = filenamePrefix + levelKey
    let level = Reporter.LEVELS[levelKey]
    let appender = {
      type: 'clustered',
      appenders: [],
      category: name
    }

    // 如果当前上报级别大于等于设置的控制台log级别
    if (level >= consoleLogLevel) {
      appender.appenders.push({
        type: 'console'
      })
    }

    // 如果当前上报级别大于等于设置的本地文件log级别
    if (level >= localLogLevel) {
      appender.appenders.push({
        type: 'dateFile',
        absolute: true,
        pattern: '-yyyy-MM-dd',
        filename: this._getFilePathByName(name + '.log'),
        backups: 10,
        maxLogSize: 1024 * 1024 * 5,
        alwaysIncludePattern: true,
        layout: {
          type: 'pattern',
          pattern: "%r %p %c => %m%n"
        }
      })
    }

    return appender
  }

  /**
   * 获取设备名称
   * @returns {string|string}
   */
  getDeviceName() {
    return this.options.deviceName || 'unknown'
  }

  /**
   * 获取客户端版本号
   * @returns {string|string}
   */
  getVersion() {
    return this.options.version || 'unknown'
  }

  /**
   * 得到上报的基础参数
   * @param level
   * @returns {Promise.<{device: (*|string), ip: *, time: (*|number), network: (*|Promise), log_level: *, version: (string|string), dev_n: (string|string), sys_ver: *, ping: (*|Promise.<{}>)}>}
   * @private
   */
  async _buildBaseData(level) {
    return {
      device: platForm,
      ip: IP,
      time: reportHelper.getTime(),
      // network: await reportHelper.getNetworkType(),
      log_level: level,
      version: this.getVersion(),
      dev_n: this.getDeviceName(),
      sys_ver: systemVersion,
      // ping: await reportHelper.getPingStatus(this.options.hosts)
    }
  }

  /**
   * 得到需要上报的数据
   * @param eventName
   * @param _params
   * @param level
   * @returns {Promise.<*>}
   * @private
   */
  async _buildData(eventName, _params = {}, level) {
    let baseData = await this._buildBaseData(level)
    let str
    let params = Object.assign({}, _params)
    Object.keys(params).forEach(key => {
      if (params[key] instanceof Error) {
        params[key] = params[key].toString()
      }
    })

    try {
      str = JSON.stringify({
        event: eventName,
        data: Object.assign({}, baseData, params)
      })
    } catch(e) {
      str = JSON.stringify({
        event: eventName,
        data: Object.assign({}, baseData, {
          error: 'try JSON.stringify failed'
        })
      })
    }
    return str
  }

  /**
   * 获取当前日志文件信息
   * @param level
   * @returns {{level: *, levelKey: string, filePath}}
   * @private
   */
  _getCurrentTemp(level) {
    let levelKey = Reporter.getLevelKey(level)
    let filename = levelKey + '.temp-' + moment().format('YYYY-MM-DD')
    let filePath = this._getFilePathByName(filename)
    if (!fs.existsSync(filePath)) {
      fs.openSync(filePath, 'w')
    }
    return {
      level,
      levelKey,
      filename,
      filePath
    }
  }

  /**
   * 输入日志
   * @param eventName
   * @param data
   * @param level
   * @returns {Promise.<void>}
   */
  async log(eventName, data, level = Reporter.LEVELS.INFO) {
    const record = await this._buildData(eventName, data, level)
    // 这个手动创建的文件是为了上报用(上报完就删除上报过的数据), 不存在就创建一个
    let {filePath} = this._getCurrentTemp(level)

    // 手动写入日志
    fs.appendFile(filePath, record + reportHelper.endOfLine())

    // log4js 自动写入日志
    // log4js写的文件 不做任何处理, 让log4js自动处理(自动根据日期/文件大小分割文件/清除文件等)
    let logger = this.loggers[level]
    // 调用log4js 写入log
    if (level === Reporter.LEVELS.INFO) {
      logger.info(record)
    }
    if (level === Reporter.LEVELS.DEBUG) {
      logger.debug(record)
    }
    if (level === Reporter.LEVELS.WARN) {
      logger.warn(record)
    }
    if (level === Reporter.LEVELS.ERROR) {
      logger.error(record)
    }
    this.process()
  }

  info(eventName, data) {
    return this.log(eventName, data, Reporter.LEVELS.INFO)
  }

  debug(eventName, data) {
    return this.log(eventName, data, Reporter.LEVELS.DEBUG)
  }

  warn(eventName, data) {
    return this.log(eventName, data, Reporter.LEVELS.WARN)
  }

  error(eventName, data) {
    return this.log(eventName, data, Reporter.LEVELS.ERROR)
  }

  /**
   * 获取最近N天的日志文件
   * @param num
   * @param isTemp
   * @param level
   * @returns {Promise.<void>}fgetRecentFiles
   */
  async getRecentFiles(num, isTemp, level) {
    let levelKey = level ? Reporter.getLevelKey(level) : '.*'
    let tail = isTemp ? 'temp-' : 'log-'
    let dateRegex = /\d{4}-\d{2}-\d{2}/
    let datePattern = dateRegex.toString().replace(/\//g, '')
    let regStr = `^${levelKey}\.${tail}${datePattern}$`
    const {dir} = this.options
    const regex = new RegExp(regStr)
    let now = moment()
    let _mapCb = (filename) => {
      return {
        filename,
        filePath: this._getFilePathByName(filename)
      }
    }
    let files = await fs.readdirAsync(dir)

    // 先把不相关的文件过滤掉, 这里不能去掉, 否则就得不到正确的结果
    files = files.filter(filename => {
      return regex.test(filename)
    })

    // 过滤出最近N天的文件
    let recentFiles = files.filter(filename => {
      let execResult = dateRegex.exec(filename)
      execResult = execResult ? execResult[0] : null
      let diff = moment(execResult, 'YYYY-MM-DD').diff(now, 'days')
      return diff > -num //判断不要改成diff<-num, 存在NaN情况也应删除
    })

    let historyFiles = files.filter(name => {
      return recentFiles.indexOf(name) < 0
    })

    recentFiles = recentFiles.map(_mapCb)
    historyFiles = historyFiles.map(_mapCb)

    return {
      recentFiles,
      historyFiles
    }
  }

  /**
   * 根据当前日志文件 获取 日志记录/行数
   * @private
   */
  async _getCurrentFileLines(level, isUnlinkFile) {
    let {filePath} = await this._getCurrentTemp(level)
    return await this._getFileLines(filePath, isUnlinkFile)
  }

  /**
   * 根据日志级别和历史天数 读取日志记录/行数
   * @param filePath
   * @param isUnlinkFile
   * @returns {Promise.<{filePath: *, lines: Array, leftLines: Array, allLines: Array.<T>}>}
   * @private
   */
  async _getFileLines(filePath, isUnlinkFile) {
    const {maxCount} = this.options
    const separatorRegex = /\r?\n/g

    let lines = []
    let leftLines = []

    let content = await fs.readFileAsync(filePath, 'utf8')
    let curLines = content.split(separatorRegex)

    // todo 为什么这么多空行?
    curLines = curLines.filter(line => {
      return line.trim()
    })

    // 如果指明了要删除文件
    if (isUnlinkFile) {
      fs.unlinkSync(filePath)
    }

    // 根据macCount把数据分成2段
    if (lines.length > maxCount) {
      lines = curLines.slice(0, maxCount)
      leftLines = curLines.slice(maxCount)
    } else {
      lines = curLines
    }

    return {
      filePath,
      lines,
      leftLines,
      allLines: curLines.slice(0)
    }
  }

  /**
   * 组装将要上报的数据
   * @returns {Promise.<string>}
   * @private
   */
  async _packageData(file) {
    const {encryptOptions} = this.options
    const {filePath} = file
    const linesInfo = await this._getFileLines(filePath, true)

    let data = []
    let lines = linesInfo.allLines

    lines.reduce((acc, line) => {
      try {
        acc.push(JSON.parse(line))
      } catch (e) {
        // this._reportSelfError(e)
        console.error('json parse line failed', line)
      }
      return acc
    }, data)

    data = _.compact(data)

    if (!data.length) {
      return linesInfo
    }
    const filteredData = _.sortBy(data, function (data) {
      return -data.time
    })

    //todo ...这里为了兼容ios端的特殊格式的处理, 之后加个afterParsedData的hook来传参处理吧
    const encData = FILE.encrypt(JSON.stringify(filteredData), encryptOptions)
    const finalData = '=' + encodeURIComponent(encData)

    return {
      data: finalData,
      linesInfo
    }
  }

  /**
   * 强制立即上报
   */
  forceProcess() {
    this.process(true)
  }

  async process(isForce) {
    // 达到阈值 或者 指明强制上报
    if (isForce) {
      const {level, tempKeepDays} = this.options
      // 得到真正允许上报的级别
      const filterdLevels = Object.keys(Reporter.LEVELS).filter(key => {
        return Reporter.LEVELS[key] >= level
      })

      // 待上传的文件列表
      let files2Report = []

      let filesPromise = filterdLevels.map(curKey => {
        return this.getRecentFiles(tempKeepDays, true, Reporter.LEVELS[curKey])
      })

      let files = await Promise.all(filesPromise)
      files.forEach(file => {
        files2Report = files2Report.concat(file.recentFiles)
      })

      // 只有一个文件
      if (files2Report.length === 1) {
        let file = files2Report[0]
        // 文件大小 小于50k 走字符串上报流程
        let {size} = fs.statSync(file.filePath)
        if (size < 1024 * 50) {
          return this._push2LogQueue(file)
        } else { // 否则走文件上传流程
          return this._push2UploadQueue(files2Report)
        }
      } else if (files2Report.length > 1) { // 多文件直接走文件上传流程
        return this._push2UploadQueue(files2Report)
      }
    }
  }

  /**
   * 根据level 收集日志push到上报队列
   * @param level
   * @returns {Promise.<void>}
   * @private
   */
  async _push2UploadQueue(files) {
    const {encryptOptions} = this.options
    let packageBaseName = 'package'
    let packageExt = '.zip'
    let packageName = packageBaseName + packageExt
    let packageDir = this._getFilePathByName(packageBaseName)
    let packagePath = this._getFilePathByName(packageName)
    let encryptPath = this._getFilePathByName(packageBaseName + '.encrypt' + packageExt)

    let movePromise = []
    // 创建待压缩目录
    if (!fs.existsSync(packageDir)) {
      fs.mkdirSync(packageDir)
    }

    // 全部移到待压缩目录
    files.forEach(file => {
      let newPath = path.join(packageDir, file.filename)
      // 修正文件路径 预防直接覆盖导致日志丢失
      newPath = FILE.fixRepeatFileName(newPath).savePath
      movePromise.push(fs.renameAsync(file.filePath, newPath))
    })

    await Promise.all(movePromise)

    // 压缩成zip
    try {
      await reportHelper.t2p(unzip.zip, packageDir, packagePath)

      // 等待加密完成
      await FILE.encryptFile({
        filename: packageName,
        filePath: packagePath
      }, encryptOptions, encryptPath)

      // 删除zip及加密后文件
      let _clearZip = () => {
        if (fs.existsSync(packagePath)) {
          fs.unlink(packagePath)
        }
        if (fs.existsSync(encryptPath)) {
          fs.unlink(encryptPath)
        }
      }

      // 塞入队列
      this.uploadQueue.pushReport(encryptPath, Reporter.responseValidator).then(rs => {
        // 删除待压缩的目录
        _clearZip()
        if (rs) {
          // 删除待压缩的目录
          this._removePackageDir(packageDir)
          console.log('upload job: success')
        } else {
          throw new Error('上传队列执行失败')
        }
      })
    } catch (e) {
      this._reportSelfError('塞入上传队列过程中出错', e)
    }
  }

  /**
   * 清除待打包目录
   * @param packageDir
   * @returns {Promise.<void>}
   * @private
   */
  async _removePackageDir(packageDir) {
    let _toRemoveFiles = await fs.readdirAsync(packageDir)
    let _toRemovePromise = []
    _toRemoveFiles.forEach(_toRemove => {
      let _toRemovePath = path.join(packageDir, _toRemove)
      _toRemovePromise.push(fs.unlinkAsync(_toRemovePath))
    })
    await Promise.all(_toRemovePromise)
  }

  /**
   * 单个文件的读取上报
   * @param file
   * @returns {Promise.<void>}
   * @private
   */
  async _push2LogQueue(file) {
    try {
      let {data, linesInfo} = await this._packageData(file)
      if (!data) {
        return
      }
      this.logQueue.pushReport(data, Reporter.responseValidator).then(rs => {
        // 上报完成后
        if (rs) {
          console.log('job success::: try clear data')
        } else {
          console.log('job fail::: try recover data')
          // 上报失败再把所有数据回写入当前日志文件
          this._recoverData(linesInfo.allLines, linesInfo.filePath)
        }
      })
    } catch (e) {
      this._reportSelfError(e)
    }
  }

  /**
   * 校验上报结果
   * @param response
   * @returns {boolean}
   * @private
   */
  static responseValidator(response) {
    if (response && response.statusCode === 200) {
      try {
        const {status} = JSON.parse(response.body)
        if (status === 0) {
          return true
        }
        console.error('report::: status is not 0')
        return false
      } catch (e) {
        console.error('responseValidator parse body failed')
        return false
      }
    }
    return false
  }

  /**
   * 上报日志
   * @param data
   * @returns {Promise}
   */
  report(data) {
    return this._report2Remote(data, this.options.url)
  }

  /**
   * 上传日志
   * @param filePath
   * @returns {Promise.<void>}
   */
  upload(filePath) {
    return this._upload2Remote(filePath, this.options.uploadUrl)
  }

  /**
   * 恢复数据到文件
   * @param lines
   * @param filepath
   * @private
   */
  _recoverData(lines, filepath) {
    try {
      if (lines && lines.length) {
        let records = ''
        lines.forEach(line => {
          records += line + reportHelper.endOfLine()
        })
        fs.appendFile(filepath, records)
      }
    } catch (e) {
      console.error(e)
    }
  }

  /**
   * 上报到远程服务器
   * @param data
   * @param uri
   * @returns {Promise}
   * @private
   */
  async _report2Remote(data, uri) {
    const body = data

    const headers = {
      'User-Agent': 'Super Agent/0.0.1',
      'content-type': 'text/plain'
    }

    return new Promise((resolve, reject) => {
      request({method: 'POST', uri, body, headers, timeout: 5000}, function (error, response) {
          if (error) reject(error)
          resolve(response)
        }
      )
    })
  }

  /**
   * 上传日志文件到远程服务器
   * @param filePath
   * @param url
   * @returns {Promise.<void>}
   * @private
   */
  async _upload2Remote(filePath, url) {
    let md5 = await FILE.getMd5File(filePath)
    let { encryptOptions } = this.options
    md5 = FILE.encrypt(md5, encryptOptions)
    let params = {
      a: encodeURIComponent(md5.toString('base64'))
    }
    try {
      let response = await reportHelper.t2p(FILE.uploadFile, {
        url,
        params,
        filePath
      })
      // console.log('response', response)
      return response
    } catch (e) {
      this._reportSelfError('_upload2Remote failed')
    }
  }

  /**
   * 上报本身出现异常
   * @param args
   * @private
   */
  _reportSelfError(...args) {
    console.error(...args)
  }

  /**
   * 销毁, 清除定时器, 解绑等
   */
  destroy() {
    clearInterval(this.reportTimer)
    clearInterval(this.clearTimer)
  }
}

export default Reporter
