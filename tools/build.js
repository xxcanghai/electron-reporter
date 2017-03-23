import 'shelljs/global'
import yargs from 'yargs'

const { argv } = yargs
console.log(argv)
let watch = argv.watch ? '--watch' : ''

// let env = argv.env === 'production' ? 'cross-env NODE_ENV=production ' : 'cross-env NODE_ENV=development '

let commandStr = `babel-node ./node_modules/webpack/bin/webpack --config ./webpack.config.js --progress --profile --colors ${watch}`

let result = exec(commandStr)

if (result.code !== 0) {
  echo('Error: build error')
  exit(1)
}
