import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { describeBuild, writeBuildInfo } from "./build-info.mjs";
import filter from "./package-filter.cjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

export function packagerOptions({
  root = ROOT,
  out = path.join(root, "dist"),
  build,
  signingIdentity = "-",
} = {}) {
  return {
    dir: root,
    out,
    name: "TVLens",
    platform: "darwin",
    arch: "arm64",
    appBundleId: "dev.tvlens.capture",
    icon: path.join(root, "assets/macos/tvlens.icns"),
    // Seal the final bundle; Electron's linker signature does not cover our resources.
    osxSign: {
      identity: signingIdentity,
      identityValidation: signingIdentity !== "-",
      continueOnError: false,
      preAutoEntitlements: false,
      preEmbedProvisioningProfile: false,
      optionsForFile: () => ({
        hardenedRuntime: signingIdentity !== "-",
        timestamp: signingIdentity === "-" ? "none" : undefined,
        entitlements: ["com.apple.security.cs.allow-jit"],
      }),
    },
    overwrite: true,
    prune: true,
    asar: { unpackDir: "node_modules/@img" },
    ignore: filter.copyFilter(root),
    afterCopy: [
      async ({ buildPath }) => {
        await writeBuildInfo(buildPath, build);
      },
    ],
    extendInfo: {
      NSAudioCaptureUsageDescription:
        "TVLens capture le son des vidéos pour construire leur contexte.",
      NSScreenCaptureUsageDescription:
        "TVLens capture la fenêtre vidéo que vous choisissez.",
    },
  };
}

export async function buildMac({
  root = ROOT,
  out,
  requireClean = false,
  packageApp,
  signingIdentity = "-",
} = {}) {
  const build = await describeBuild({ root });
  if (requireClean && build.dirty)
    throw Object.assign(
      new Error(
        "Construction CI refusée : le dépôt contient des modifications.",
      ),
      { code: "TVLENS_PACKAGE_DIRTY" },
    );
  const packager = packageApp || (await import("@electron/packager")).packager;
  return packager(packagerOptions({ root, out, build, signingIdentity }));
}

async function main() {
  const { values } = parseArgs({
    options: {
      out: { type: "string" },
      "require-clean": { type: "boolean" },
      "sign-identity": { type: "string" },
    },
  });
  const paths = await buildMac({
    out: values.out && path.resolve(values.out),
    requireClean: values["require-clean"],
    signingIdentity: values["sign-identity"],
  });
  for (const directory of paths)
    console.log(`Paquet Mac construit : ${directory}`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
