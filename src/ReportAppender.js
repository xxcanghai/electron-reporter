/** @fileoverview 自定义 log4js 的appender **/

const consoleLog = console.log.bind(console)

export default {
	name: 'electron-reporter',
	configure(config) {

	},
	appender() {

	},
	shutdown() {}
}