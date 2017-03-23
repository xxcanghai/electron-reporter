import webpack from 'webpack'
import path from 'path'
import formatter from 'eslint-formatter-pretty'
import { dependencies as externals } from './package.json'

const externalsKeys = Object.keys(externals)


let config = {
  target: "node",
  devtool: 'source-map',
  eslint: {
    formatter
  },
  entry: {
    index: './src/index.js'
  },
  output: {
    path: path.join(__dirname, './dist'),
    filename: '[name].js',
    chunkFilename: '[id].[chunkhash].js',
    libraryTarget: 'commonjs2'
  },
  module: {
    preLoaders: [
      {
        test: /\.js$/,
        loader: 'eslint-loader',
        exclude: /node_modules/
      }
    ],
    loaders: [
      {
        test: /\.jsx?$/,
        loader: 'babel',
        include: [
          path.join(__dirname, './src')
        ],
        query: {
          // https://github.com/babel/babel-loader#options
          cacheDirectory: true,
          // https://babeljs.io/docs/usage/options/
          babelrc: false,
          presets: [
            'es2015',
            'stage-0'
          ],
          plugins: ['transform-runtime']
        }
      }
    ]
  },
  plugins: [
    new webpack.optimize.DedupePlugin(),
    new webpack.optimize.OccurenceOrderPlugin(),
    new webpack.optimize.UglifyJsPlugin({
      minimize: true,
      compress: {
        warnings: false,
        screw_ie8: true
      }
    })
  ],
  externals: externalsKeys
}

export default config
