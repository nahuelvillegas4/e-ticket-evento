require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { PRIVATE_KEY, AMOY_RPC_URL, ETHERSCAN_API_KEY } = process.env;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      evmVersion: "cancun",
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    // Red en memoria: se crea y se borra en cada comando (tests y demo rápida)
    hardhat: {
      chainId: 31337,
    },
    // Nodo local persistente: `npx hardhat node` en otra terminal
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    // Red de prueba pública de Polygon PoS
    amoy: {
      url: AMOY_RPC_URL || "https://polygon-amoy-bor-rpc.publicnode.com",
      chainId: 80002,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      timeout: 120000,
    },
  },
  // Verificación en amoy.polygonscan.com (Etherscan API V2: una sola clave para todas las redes)
  etherscan: {
    apiKey: ETHERSCAN_API_KEY || "",
  },
  sourcify: {
    enabled: false,
  },
};
