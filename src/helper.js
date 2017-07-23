import ip from 'ip'
// import network from 'network'
import os from 'os'
// import ping from 'ping'

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

reportHelper.IP = reportHelper.getIP()
reportHelper.systemVersion = reportHelper.getSystemVersion()
reportHelper.platForm = reportHelper.getPlatform()

export default reportHelper
