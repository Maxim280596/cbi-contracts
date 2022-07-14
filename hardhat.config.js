require("@nomiclabs/hardhat-web3");
require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-waffle");
require("solidity-coverage");
const { getPKs } = require("./utills/configInit");

const accounts = getPKs();

module.exports = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      forking: {
        url: "https://rpc.testnet.fantom.network/",
        enabled: true,
        blockNumber: 9148484,
        chainId: 4002,
        gasPrice: 250000000000,
        accounts,
      },
    },
    fantomMainnet: {
      url: "https://rpc.ftm.tools/",
      accounts,
    },
    fantomTestnet: {
      url: "https://rpc.testnet.fantom.network/",
      accounts,
    },
  },

  solidity: {
    compilers: [
      {
        version: "0.8.14",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
            details: {
              yul: true,
            },
          },
        },
      },
    ],
  },
  typechain: {
    outDir: "typechain",
    target: "ethers-v5",
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 40000,
  },
  etherscan: {
    apiKey: "WM4ZGA5IU33XKZV9SAI9XXZJJE3R3RXTAI",
  },
};
