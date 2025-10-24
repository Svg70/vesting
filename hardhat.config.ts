import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import dotenv from "dotenv";

dotenv.config();

const accounts = [process.env.PRODUCTION_PRIVATE_KEY].filter((x): x is string => !!x);

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    unique: {
      url: "https://ws.unique.network",
      chainId: 8880,
      accounts,
    },
    devnode: {
      url: "https://rpc.web.uniquenetwork.dev",
      chainId: 8882,
      accounts,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
      accounts: accounts.length > 0 ? accounts : undefined,
    },
  },
  ignition: {
    disableFeeBumping: true,
  }
};

export default config;