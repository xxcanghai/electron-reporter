import _ from 'lodash'
import {queue} from 'd3-queue'

export default class ReportQueue {
  constructor(options = {}) {
    // 并行数量
    this.concurrency = options.concurrency || 1
    this.status = 'idle'
    // 要上报的数据列表
    this.queue = []
    // 真正处理上报的队列实例
    this.jobQueue = queue(this.concurrency)

    // 重试间隔
    this.retryGap = options.retryGap || 1000 * 1
    // 重试次数限制
    this.retryLimit = options.retryTimes || 3
    this.retryCount = 0

    if (options.processFunction) {
      this.processFunction = options.processFunction
    } else {
      throw new Error('必须指定队列要执行的方法!')
    }
  }

  /**
   * 重置jobQueue
   * @param void
   */
  initNewQueue() {
    this.jobQueue = queue(this.concurrency)
  }

  /**
   * 从顶部向队列添加新的节点
   * @param array
   */
  unshift(array) {
    this.queue = _.union(array, this.queue)
    this.processQueue()
  }

  /**
   * 从底部向队列添加新的节点
   * @param array
   */
  push(array) {
    this.queue = _.union(this.queue, array)
    this.processQueue()
  }

  async pushReport(data, validator) {
    return new Promise((resolve) => {
      this.push([{data, validator, resolve}])
    })
  }

  async unshiftReport(data, validator) {
    return new Promise((resolve) => {
      this.unshift([{data, validator, resolve}])
    })
  }

  processQueue(loop) {
    if (!this.queue.length) {
      this.jobQueue.await((err, res) => {
        this.initNewQueue()
        this.status = 'idle'
      })
    } else if (this.status === 'idle' || loop) {
      this.status = 'process'

      const {data, validator, resolve} = this.queue[0]
      if (!data || !validator || !resolve) throw new Error

      const resolveResponse = (response) => {
        this.retryCount = 0
        this.queue.splice(0, 1)
        resolve(response)
      }

      this.jobQueue = this.jobQueue.defer(callback => {
        this.processFunction(data).then(async(res) => {
          this.retryCount += 1

          const isValid = validator(res) // 判断返回结果是否valid，否则重试
          if (isValid) {
            resolveResponse(res)
          } else {
            console.log('job Retry::::', this.retryCount)
            // 判断是否达到重试限制
            if (this.retryCount == this.retryLimit) {
              resolveResponse(null)
            }
            // 延时重试
            await new Promise(done => setTimeout(done, this.retryGap || 0))
          }

          callback(null)
          this.processQueue('loop')
        }).catch(err => {
          resolveResponse(null)

          callback(null) // 不要callbakc error, 队列会停止处理
          this.processQueue('loop')
        })
      })
    }
  }
}
