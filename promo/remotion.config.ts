/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";

Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);

// Optional export mode for disks with very little temporary space.
if (process.env.TVLENS_PROMO_LOW_DISK === "1") {
  Config.overrideRspackConfig((config) => ({ ...config, devtool: false }));
}
