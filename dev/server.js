import Webpack from 'webpack'
import WebpackDevServer from 'webpack-dev-server'
import webpackConfig from './webpack.config.js'

const compiler = Webpack(webpackConfig)
const server = new WebpackDevServer(compiler, {
  stats: {
    colors: true
  }
})

server.listen(1616, '0.0.0.0', function() {
  console.log('Starting server on http://localhost:1616')
})
