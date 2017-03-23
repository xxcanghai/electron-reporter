import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import md5File from 'md5-file'
import FormData from 'form-data'

export default {
  /**
   * 生成随机加密向量
   * @returns {{key, iv}}
   */
  getEncryptKey() {
    return {
      key: crypto.randomBytes(16).toString('base64'),
      iv: crypto.randomBytes(16).toString('base64')
    }
  },
  getMd5File(path) {
    return new Promise((resolve, reject) => {
      md5File(path, (err, hash) => {
        if (err) reject(err)
        resolve(hash)
      })
    })
  },
  /**
   * 应对文件重名的情况
   * @param savePath
   * @returns {{saveName: *, savePath: *}}
   */
  fixRepeatFileName(savePath) {
    let saveName = path.basename(savePath)
    saveName = saveName.replace(/[\\\/:\*\,"\?<>|]/g, '_')
    let ext = path.extname(saveName)
    let base = path.basename(saveName, ext)
    let baseDir = path.dirname(savePath)
    if (fs.existsSync(savePath)) {
      let i = 1;
      while (fs.existsSync(baseDir + '/' + base + "(" + i + ")" + ext)) {
        i++;
      }
      savePath = baseDir + '/' + base + "(" + i + ")" + ext;
      saveName = base + "(" + i + ")" + ext;
    }
    return {
      saveName,
      savePath
    }
  },
  /**
   * 根据配置加密字符串
   * @param text
   * @param options
   * @returns {*}
   */
  encrypt(text, options){
    const {key, iv, clearEncoding, algorithm} = options
    try {
      const cipher = crypto.createCipheriv(algorithm, key, iv)
      let enc = cipher.update(text, clearEncoding, 'base64')
      enc += cipher.final('base64')
      return enc
    } catch (e) {
      console.error('reporter encrypt error::', e)
      return text
    }
  },
  /**
   * 根据配置加密文件
   * @param file
   * @param options
   * @param encryptPath
   * @returns {Promise}
   */
  async encryptFile(file, options, encryptPath) {
    let {key, iv, algorithm} = options
    let {filePath} = file

    // if (typeof key === 'string') {
    //   key = Buffer.from(key, 'base64')
    // }
    // if (typeof iv === 'string') {
    //   iv = Buffer.from(iv, 'base64')
    // }

    let cipher = crypto.createCipheriv(algorithm, key, iv)
    let input = fs.createReadStream(filePath)
    let output = fs.createWriteStream(encryptPath)

    input.pipe(cipher).pipe(output)

    return new Promise((resolve, reject) => {
      output.on('finish', () => {
        resolve(encryptPath)
      })
      output.on('error', (err) => {
        reject(err)
      })
    })
  },
  /**
   * 上传文件
   * @param url
   * @param params
   * @param filePath
   * @param callback
   * @returns {Promise.<void>}
   */
  uploadFile({url, params = {}, filePath}, callback) {
    if (!fs.existsSync(filePath)) {
      callback(new Error('文件不存在'))
    }

    let form = new FormData()

    Object.keys(params).forEach(key => {
      form.append(key, params[key])
    })

    form.append('file', fs.createReadStream(filePath, {
      bufferSize: 4 * 1024
    }))

    form.submit(url, (err, httpResponse) => {
      if (err) {
        return callback(new Error('服务端接收文件失败'))
      }
      console.log('httpResponse statusCode', httpResponse.statusCode)
      let body = ''
      httpResponse.on('data', chunk => {
        body += chunk
        console.log('BODY: ', body)
      })
      httpResponse.on('end', () => {
        callback(undefined, {
          statusCode: httpResponse.statusCode,
          body
        })
      })
    })
  }
}
