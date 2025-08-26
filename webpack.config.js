const path = require('path');

module.exports = {
  entry: './src/warpmind.js',
  output: {
    filename: 'warpmind.js',
    path: path.resolve(__dirname, 'dist'),
    library: 'WarpMind',
    libraryTarget: 'umd',
    globalObject: 'this'
  },
  mode: 'production',
  optimization: {
    usedExports: false,
    sideEffects: false,
    minimize: false
  },
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist'),
    },
    compress: true,
    port: 8080,
  },
  resolve: {
    fallback: {
      "fs": false,
      "path": false,
      "os": false,
      "pdfjs-dist/legacy/build/pdf.js": false
    }
  },
  externals: {
    'pdfjs-dist/legacy/build/pdf.js': 'pdfjsLib'
  }
};
