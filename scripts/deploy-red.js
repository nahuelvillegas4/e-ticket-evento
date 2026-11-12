/**
 * Despliegue en una red real o persistente (Polygon Amoy o nodo local) con UNA sola billetera.
 *
 *   npx hardhat run scripts/deploy-red.js --network amoy
 *   npx hardhat run scripts/deploy-red.js --network localhost
 *
 * La billetera del .env queda como administradora y con los roles de Organizador,
 * Oráculo, Verificador (Tribuna Segura) y Validador de acceso. Opcionalmente, cada rol
 * se puede asignar a otra dirección con las variables ORGANIZADOR, ORACULO, VERIFICADOR
 * y VALIDADOR del .env.
 *
 * Las direcciones desplegadas se guardan en deployments/<red>.json para que la
 * demo y la verificación las reutilicen.
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;

function explorador(red) {
  return red === "amoy" ? "https://amoy.polygonscan.com" : null;
}

async function main() {
  const red = hre.network.name;
  if (red === "hardhat") {
    throw new Error("Usá --network localhost o --network amoy: en la red 'hardhat' lo desplegado se borra al terminar.");
  }

  const [admin] = await ethers.getSigners();
  if (!admin) throw new Error("No hay billetera configurada: completá PRIVATE_KEY en el archivo .env");

  const saldo = await ethers.provider.getBalance(admin.address);
  console.log(`Red: ${red} (chainId ${(await ethers.provider.getNetwork()).chainId})`);
  console.log(`Billetera administradora: ${admin.address}`);
  console.log(`Saldo: ${ethers.formatEther(saldo)} ${red === "amoy" ? "POL" : "ETH"}\n`);

  const roles = {
    organizador: process.env.ORGANIZADOR || admin.address,
    oraculo: process.env.ORACULO || admin.address,
    verificador: process.env.VERIFICADOR || admin.address,
    validador: process.env.VALIDADOR || admin.address,
  };

  const txs = [];
  const esperar = async (promesa, descripcion) => {
    const tx = await promesa;
    const recibo = await tx.wait();
    txs.push({ descripcion, hash: tx.hash, gasUsed: recibo.gasUsed.toString() });
    console.log(`   ✔ ${descripcion} (tx ${tx.hash})`);
    return recibo;
  };
  const registrarDespliegue = async (contrato, descripcion) => {
    const recibo = await contrato.deploymentTransaction().wait();
    txs.push({ descripcion, hash: recibo.hash, gasUsed: recibo.gasUsed.toString() });
  };

  console.log("1. Desplegando EntradaNFT...");
  const entradaNFT = await ethers.deployContract("EntradaNFT");
  await entradaNFT.waitForDeployment();
  await registrarDespliegue(entradaNFT, "deploy EntradaNFT");
  const dirNFT = await entradaNFT.getAddress();
  console.log(`   -> ${dirNFT}`);

  console.log("2. Desplegando EventManager...");
  const eventManager = await ethers.deployContract("EventManager", [dirNFT]);
  await eventManager.waitForDeployment();
  await registrarDespliegue(eventManager, "deploy EventManager");
  const dirEM = await eventManager.getAddress();
  console.log(`   -> ${dirEM}`);

  console.log("3. Desplegando ReventaMarketplace...");
  const marketplace = await ethers.deployContract("ReventaMarketplace", [dirNFT, dirEM]);
  await marketplace.waitForDeployment();
  await registrarDespliegue(marketplace, "deploy ReventaMarketplace");
  const dirMK = await marketplace.getAddress();
  console.log(`   -> ${dirMK}`);

  console.log("4. Conectando contratos y asignando roles...");
  await esperar(entradaNFT.setEventManager(dirEM), "EntradaNFT.setEventManager");
  await esperar(eventManager.setMarketplace(dirMK), "EventManager.setMarketplace");
  await esperar(entradaNFT.grantRole(await entradaNFT.OPERADOR_ROLE(), dirEM), "OPERADOR_ROLE -> EventManager");
  await esperar(entradaNFT.grantRole(await entradaNFT.OPERADOR_ROLE(), dirMK), "OPERADOR_ROLE -> Marketplace");
  await esperar(entradaNFT.grantRole(await entradaNFT.VALIDADOR_ROLE(), roles.validador), "VALIDADOR_ROLE");
  await esperar(eventManager.grantRole(await eventManager.MARKETPLACE_ROLE(), dirMK), "MARKETPLACE_ROLE -> Marketplace");
  await esperar(eventManager.grantRole(await eventManager.ORGANIZADOR_ROLE(), roles.organizador), "ORGANIZADOR_ROLE");
  await esperar(eventManager.grantRole(await eventManager.ORACULO_ROLE(), roles.oraculo), "ORACULO_ROLE");
  await esperar(eventManager.grantRole(await eventManager.VERIFICADOR_ROLE(), roles.verificador), "VERIFICADOR_ROLE");

  const salida = {
    red,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    fecha: new Date().toISOString(),
    admin: admin.address,
    roles,
    contratos: { EntradaNFT: dirNFT, EventManager: dirEM, ReventaMarketplace: dirMK },
    transacciones: txs,
  };

  const carpeta = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(carpeta, { recursive: true });
  const archivo = path.join(carpeta, `${red}.json`);
  fs.writeFileSync(archivo, JSON.stringify(salida, null, 2));

  const saldoFinal = await ethers.provider.getBalance(admin.address);
  const moneda = red === "amoy" ? "POL" : "ETH";
  console.log(`\nDirecciones guardadas en deployments/${red}.json`);
  console.log(`Costo total del despliegue: ${ethers.formatEther(saldo - saldoFinal)} ${moneda}`);

  const gasTotal = txs.reduce((a, t) => a + BigInt(t.gasUsed), 0n);
  console.log(`Gas total usado: ${gasTotal}`);

  const exp = explorador(red);
  if (exp) {
    console.log("\nVer en el explorador:");
    console.log(`   EntradaNFT:         ${exp}/address/${dirNFT}`);
    console.log(`   EventManager:       ${exp}/address/${dirEM}`);
    console.log(`   ReventaMarketplace: ${exp}/address/${dirMK}`);
    console.log("\nPara verificar el código fuente:");
    console.log(`   npx hardhat verify --network amoy ${dirNFT}`);
    console.log(`   npx hardhat verify --network amoy ${dirEM} ${dirNFT}`);
    console.log(`   npx hardhat verify --network amoy ${dirMK} ${dirNFT} ${dirEM}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
