/**
 * Webpack config for development electron main process
 */

import path from 'path';
import webpack from 'webpack';
import { BundleAnalyzerPlugin } from 'webpack-bundle-analyzer';
import { merge } from 'webpack-merge';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import { spawnSync } from 'child_process';
import checkNodeEnv from '../scripts/check-node-env';
import baseConfig from './webpack.config.base';
import webpackPaths from './webpack.paths';

// When an ESLint server is running, we can't set the NODE_ENV so we'll check if it's
// at the dev webpack config is not accidentally run in a production environment
if (process.env.NODE_ENV === 'production') {
  checkNodeEnv('development');
}

const buildExtensions = (): void => {
  const result = spawnSync('npm', ['run', 'build:extensions'], {
    cwd: webpackPaths.rootPath,
    stdio: 'inherit',
    shell: true,
  });

  if (result.status !== 0) {
    throw new Error('Failed to build extension bundle(s).');
  }
};

class BuildExtensionsPlugin {
  apply(compiler: webpack.Compiler): void {
    compiler.hooks.beforeRun.tap('BuildExtensionsPlugin', buildExtensions);
  }
}

const configuration: webpack.Configuration = {
  devtool: 'inline-source-map',

  mode: 'development',

  target: 'electron-main',

  externals: ['@napi-rs/keyring'],

  entry: {
    main: path.join(webpackPaths.srcMainPath, 'main.ts'),
    preload: path.join(webpackPaths.srcMainPath, 'preload.ts'),
    webViewPreload: path.join(webpackPaths.webViewPath, 'webViewPreload.ts'),
  },

  output: {
    path: webpackPaths.dllPath,
    filename: '[name].bundle.dev.js',
    library: {
      type: 'umd',
    },
  },

  plugins: [
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    new BundleAnalyzerPlugin({
      analyzerMode: process.env.ANALYZE === 'true' ? 'server' : 'disabled',
      analyzerPort: 8888,
    }),

    new webpack.DefinePlugin({
      'process.type': '"browser"',
    }),

    new BuildExtensionsPlugin(),

    new CopyWebpackPlugin({
      patterns: [
        {
          from: webpackPaths.srcExtensionsPath,
          to: webpackPaths.erbExtensionsPath,
          noErrorOnMissing: true,
        },
      ],
    }),
  ],

  /**
   * Disables webpack processing of __dirname and __filename.
   * If you run the bundle in node.js it falls back to these values of node.js.
   * https://github.com/webpack/webpack/issues/2010
   */
  node: {
    __dirname: false,
    __filename: false,
  },
};

export default merge(baseConfig, configuration);
