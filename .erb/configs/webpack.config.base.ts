/**
 * Base webpack config used across other specific configs
 */
import dotenv from 'dotenv';
import TsconfigPathsPlugins from 'tsconfig-paths-webpack-plugin';
import webpack from 'webpack';
import webpackPaths from './webpack.paths';

dotenv.config();

const configuration: webpack.Configuration = {
  stats: 'errors-only',

  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        include: [webpackPaths.srcPath],
        use: {
          loader: 'ts-loader',
          options: {
            // Remove this line to enable type checking in webpack builds
            transpileOnly: true,
            compilerOptions: {
              module: 'nodenext',
              moduleResolution: 'nodenext',
            },
          },
        },
      },
    ],
  },

  output: {
    path: webpackPaths.srcPath,
    // https://github.com/webpack/webpack/issues/1114
    library: { type: 'commonjs2' },
  },

  /**
   * Determine the array of extensions that should be used to resolve modules.
   */
  resolve: {
    extensions: ['.js', '.jsx', '.json', '.ts', '.tsx'],
    modules: [webpackPaths.srcPath, 'node_modules'],
    // There is no need to add aliases here, the paths in tsconfig get mirrored
    plugins: [new TsconfigPathsPlugins()],
  },

  plugins: [
    new webpack.EnvironmentPlugin({
      NODE_ENV: 'production',
      LLM_API_PROVIDER: process.env.LLM_API_PROVIDER,
      LLM_API_KEY: process.env.LLM_API_KEY,
    }),
  ],
};

export default configuration;
