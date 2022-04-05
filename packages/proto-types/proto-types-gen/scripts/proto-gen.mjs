/* eslint-disable import/no-extraneous-dependencies, @typescript-eslint/no-var-requires */

import "zx/globals";
import fs from "fs";
import FolderHash from "folder-hash";
import glob from "glob";

async function calculateOutputHash(root) {
  const dirCandidates = fs.readdirSync(root, {
    withFileTypes: true,
  });

  let dirs = [];

  for (const candidate of dirCandidates) {
    if (candidate.isDirectory()) {
      if (
        candidate.name !== "node_modules" &&
        candidate.name !== "proto-types-gen"
      ) {
        dirs.push(candidate);
      }
    }
  }

  dirs = dirs.sort((dir1, dir2) => {
    if (dir1.name < dir2.name) return -1;
    if (dir1.name > dir2.name) return 1;
    return 0;
  });

  let hash = Buffer.alloc(0);
  for (const dir of dirs) {
    const p = path.join(root, dir.name);
    const buf = Buffer.from((await FolderHash.hashElement(p)).hash, "base64");
    hash = Buffer.concat([hash, buf]);
  }

  return hash.toString("base64");
}

function getOutputHash(root) {
  return fs.readFileSync(path.join(root, "outputHash"));
}

function setOutputHash(root, hash) {
  return fs.writeFileSync(path.join(root, "outputHash"), hash, { mode: 0o600 });
}

(async () => {
  try {
    const packageRoot = path.join(__dirname, "../..");

    const outDir = path.join(__dirname, "../src");
    await $`mkdir -p ${outDir}`;

    // When executed in CI, the proto output should not be different with ones built locally.
    let lastOutputHash = undefined;
    if (process.env.CI === "true") {
      console.log("You are ci runner");
      lastOutputHash = await getOutputHash(packageRoot);
    }

    const protoTsBinPath = (() => {
      try {
        const binPath = path.join(
          __dirname,
          "../../node_modules/.bin/protoc-gen-ts_proto"
        );
        fs.readFileSync(binPath);
        return binPath;
      } catch {
        const binPath = path.join(
          __dirname,
          "../../../../node_modules/.bin/protoc-gen-ts_proto"
        );
        fs.readFileSync(binPath);
        return binPath;
      }
    })();

    const baseDirPath = path.join(__dirname, "..");

    const baseProtoPath = path.join(baseDirPath, "proto");
    const thirdPartyProtoPath = path.join(baseDirPath, "third_party/proto");

    const inputs = [
      "cosmos/base/v1beta1/coin.proto",
      "cosmos/bank/v1beta1/bank.proto",
      "cosmos/bank/v1beta1/tx.proto",
      "cosmos/staking/v1beta1/tx.proto",
      "cosmos/gov/v1beta1/gov.proto",
      "cosmos/gov/v1beta1/tx.proto",
      "cosmos/distribution/v1beta1/tx.proto",
      "cosmos/crypto/multisig/v1beta1/multisig.proto",
      "cosmos/crypto/secp256k1/keys.proto",
      "cosmos/tx/v1beta1/tx.proto",
      "cosmos/tx/signing/v1beta1/signing.proto",
      "cosmos/base/abci/v1beta1/abci.proto",
      "cosmwasm/wasm/v1/tx.proto",
      "ibc/applications/transfer/v1/tx.proto",
      "secret/compute/v1beta1/msg.proto",
    ];

    const thirdPartyInputs = ["tendermint/crypto/keys.proto"];

    await $`protoc \
      --plugin=${protoTsBinPath} \
      --ts_proto_opt=forceLong=string \
      --ts_proto_opt=esModuleInterop=true \
      --ts_proto_opt=outputClientImpl=false \
      --proto_path=${baseProtoPath} \
      --proto_path=${thirdPartyProtoPath} \
      --ts_proto_out=${outDir} \
      ${inputs.map((i) => path.join(baseProtoPath, i))} \
      ${thirdPartyInputs.map((i) => path.join(thirdPartyProtoPath, i))}`;

    // Build javascript output
    const rootDir = path.join(__dirname, "..");
    cd(rootDir);
    await $`npx tsc`;

    // Move javascript output to proto-types package
    const buildOutDir = path.join(rootDir, "build");

    // Remove previous output if exist
    const previous = glob.sync(`${packageRoot}/**/*.+(ts|js|cjs|mjs|map)`);
    for (const path of previous) {
      if (
        !path.includes("/proto-types-gen/") &&
        !path.includes("/node_modules/")
      ) {
        await $`rm -f ${path}`;
      }
    }

    await $`cp -R ${buildOutDir + "/"} ${packageRoot}`;

    const outputHash = await calculateOutputHash(packageRoot);
    if (lastOutputHash && lastOutputHash !== outputHash) {
      throw new Error("Output is different");
    }

    setOutputHash(packageRoot, outputHash);
  } catch (e) {
    console.log(e);
    process.exit(1);
  }
})();

/* eslint-enable import/no-extraneous-dependencies, @typescript-eslint/no-var-requires */
