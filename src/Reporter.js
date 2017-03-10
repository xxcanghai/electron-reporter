/** @fileOverview 给electron/nw等类似客户端用的日志上报模块 **/

import ip from 'ip'
import network from 'network'
import os from 'os'
import ping from 'ping'
import request from 'request'
import path from 'path'
import crypto from 'crypto'
import uuid from 'node-uuid'
import fs from 'fs-extra-promise'
import _ from 'lodash'
import log4js from 'log4js'
import Queue from './ReportQueue'

// 一些辅助方法
const reportHelper = {
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
	async getNetworkType() {
		return new Promise((resolve) => {
			network.get_active_interface((err, res) => {
				if (res && res.type) {
					resolve(res.type)
				} else {
					resolve('unknown')
				}
			})
		})
	},

	/**
	 * 获取指定服务器的延时数值
	 * @returns {Promise.<{}>}
	 */
	async getPingStatus(hosts = []) {
		const promises = hosts.map(async(host, idx) => {
			const p = await ping.promise.probe(host)
			return {host, time: p.avg}
		})
		const pArray = await Promise.all(promises)
		const pObject = {}
		_.reduce(pArray, (acc, val) => {
			acc[val.host] = val.time
			return acc
		}, pObject)
		return pObject
	},
	/**
	 * 上报前加密日志
	 * @param text
	 * @returns {*}
	 */
	encrypt(text){
		const key = '78afc8512559b62f'
		const iv = '78afc8512559b62f'
		const clearEncoding = 'utf8'
		const algorithm = 'aes-128-cbc'
		try {
			const cipher = crypto.createCipheriv(algorithm, key, iv)
			let enc = cipher.update(text, clearEncoding, 'base64')
			enc += cipher.final('base64')
			return enc
		} catch (e) {
			console.log('reporter encrypt error::', e)
			return text
		}
	},
}

class Reporter {

	static LEVELS = {
		DEBUG: 1,
		INFO: 2,
		WARN: 3,
		ERROR: 4
	}

	// static getLevelName (val) {
	// 	let name = 'INFO'
	// 	Object.keys(Reporter.LEVELS).forEach(key => {
	// 		if (Reporter.LEVELS[key] === val) {
	// 			name = key
	// 		}
	// 	})
	// 	return name.toLowerCase()
	// }

	static defaultOptions = {
		// 上报地址
		url: '',
		// 设备名字
		deviceName: '',
		// 客户端版本号
		version: '',
		// log文件存储目录
		dir: process.cwd(),
		// 默认上报级别
		level: Reporter.LEVELS.WARN,
		// 定时上报时间间隔, 即便没积攒达到上报数量阈值，只要达到时间间隔，仍然上报
		interval: 1000 * 60 * 5,
		// 上报数量阈值, 积攒到阈值就上报
		threshold: 10,
		// 文件命名的前缀
		filenamePrefix: '',
		// 上报时需要ping的域名集合
		hosts: []
	}

	constructor(options) {
		/**
		 * 初始化配置参数
		 * @type {{url: string, deviceName: string, version: string, dir: string, level: string, interval: number, threshold: number, filenamePrefix: string, hosts: array}}
		 */
		this.options = Object.assign(Reporter.defaultOptions, options)
		/**
		 * 处理上报行为的queue
		 * @type {ReportQueue}
		 */
		this.logQueue = new Queue({
			processFunction: this.report.bind(this)
		})

		/**
		 * log4js实例, 每种类型一个实例, 分文件存储
		 * @type {Logger}
		 */
		this.loggers = {}

		// 根据level生成log4js配置
		let appenders = Object.keys(Reporter.LEVELS).map((key) => {
			let appender = this._buildAppender(Reporter.LEVELS)
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
		/**
		 * 定时上报的timer
		 * @type {*}
		 */
		this.timer = setInterval(this.forceProcess.bind(this), this.options.interval)
	}

	// 每种日志类型创建一个文件, 创建一个logger实例
	_buildAppender (levelKey) {
		let { dir, filenamePrefix } = this.options
		let name = filenamePrefix + levelKey
		return {
			type: 'clustered',
			appenders: [
				{
					type: 'console'
				},
				{
					type: 'dateFile',
					absolute: true,
					pattern: '-yyyy-MM-dd',
					filename: path.join(dir, name + '.log'),
					backups: 2,
					alwaysIncludePattern: false
				}
			],
			category: name
		}
	}

	getDeviceName() {
		return this.options.deviceName || 'unknown'
	}

	getVersion() {
		return this.options.version || 'unknown'
	}

	getAD() {
		return this.options.ad || 'unknown'
	}

	// 得到上报的基础参数
	async _buildBaseData() {
		return {
			device: reportHelper.getPlatform(),
			ip: reportHelper.getIP(),
			time: reportHelper.getTime(),
			network: await reportHelper.getNetworkType(),
			log_level: this.options.level,
			version: this.getVersion(),
			dev_n: this.getDeviceName(),
			sys_ver: reportHelper.getSystemVersion(),
			ad: this.getAD(),
			ping: await reportHelper.getPingStatus(this.options.hosts)
		}
	}

	// 得到需要上报的数据
	async _buildData(eventName, params = {}) {
		let baseData = await this._buildBaseData()
		return {
			event: eventName,
			data: Object.assign(baseData, params)
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
		const record = await this._buildData(eventName, data)
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
	 * 组装将要上报的数据
	 * @returns {Promise.<string>}
	 * @private
	 */
	async _packageData() {
		const { dir } = this.options
		const files = await fs.readdirAsync(dir)

		let data = []
		await Promise.each(files, async(file) => {
			console.log('filefilefile', file)
			const regex = new RegExp('^[0-9a-zA-Z-]{36}.log$')
			if (!regex.test(file)) return

			const content = await fs.readFileAsync(path.join(dir, file), 'utf8')
			const lines = content.split(/\r?\n/g)
			lines.reduce((acc, line) => {
				try {
					acc.push(JSON.parse(line))
				} catch (e) {
					//
				}
				return acc
			}, data)
		})

		data = _.compact(data)

		if (!data.length) {
			return
		}

		const filteredData = _.take(_.sortByAll(data, 'd', function (data) {
			return -data.t
		}), 500)

		const encData = this.encrypt(JSON.stringify(filteredData))
		const finalData = '=' + encodeURIComponent(encData)
		return finalData
	}

	/**
	 * 强制立即上报
	 */
	forceProcess() {
		this.process(true)
	}

	process(isForce) {
		// let data = this._packageData()
		// // 达到阈值 或者 指明强制上报
		// if (data && isForce) {
		// 	this.logQueue.pushReport(data, Reporter.responseValidator)
		// }
	}

	/**
	 * 校验上报结果
	 * @param response
	 * @returns {boolean}
	 * @private
	 */
	static responseValidator(response) {
		// todo 测试代码 需要删除
		return true
		if (response && response.statusCode === 200) {
			try {
				const { status } = JSON.parse(response.body)
				if (status === 0) {
					return true
				}
				console.log('report::: status is not 0')
				return false
			} catch (e) {
				return false
			}
		}
		return false
	}

	/**
	 * 上报日志
	 */
	report(data) {
		return this._report2Remote(data, this.options.serverUrl)
	}

	/**
	 * 删除当前指定目录下所有日志文件
	 * @param dir
	 * @param files
	 */
	_deleteLogFiles(dir, files) {
		files.forEach((file) => {
			fs.unlink(path.join(dir, file))
		})
	}

	/**
	 * 上报到远程服务器
	 * @param data
	 * @param uri
	 * @returns {Promise}
	 * @private
	 */
	async _report2Remote(data, uri) {
		// todo 测试代码 需要删除
		return Promise.resolve()
		const body = data

		const headers = {
			'User-Agent': 'Super Agent/0.0.1',
			'content-type': 'text/plain'
		}

		return new Promise((resolve, reject) => {
			request({method: 'POST', uri, body, headers}, function (error, response) {
					if (error) reject(error)
					resolve(response)
				}
			)
		})
	}
}

export default Reporter
