const { ethers } = require("hardhat");

async function main() {
  console.log("====================================================");
  console.log("   DESPLIEGUE DEL SISTEMA e-TicketEvento (5K3A)");
  console.log("====================================================\n");

  const [deployer, organizador, artista, plataforma, verificador, validador, oraculo] =
    await ethers.getSigners();

  console.log(`Billetera de Despliegue (Admin): ${deployer.address}`);

  // 1. EntradaNFT
  console.log("\n1. Desplegando EntradaNFT (ERC-721 + ERC-2981)...");
  const EntradaNFT = await ethers.getContractFactory("EntradaNFT");
  const entradaNFT = await EntradaNFT.deploy();
  await entradaNFT.waitForDeployment();
  const entradaNFTAddress = await entradaNFT.getAddress();
  console.log(`   -> EntradaNFT desplegado en: ${entradaNFTAddress}`);

  // 2. EventManager
  console.log("\n2. Desplegando EventManager (Gestión de eventos, Escrow y Pull)...");
  const EventManager = await ethers.getContractFactory("EventManager");
  const eventManager = await EventManager.deploy(entradaNFTAddress);
  await eventManager.waitForDeployment();
  const eventManagerAddress = await eventManager.getAddress();
  console.log(`   -> EventManager desplegado en: ${eventManagerAddress}`);

  // 3. ReventaMarketplace
  console.log("\n3. Desplegando ReventaMarketplace (Mercado secundario regulado)...");
  const ReventaMarketplace = await ethers.getContractFactory("ReventaMarketplace");
  const marketplace = await ReventaMarketplace.deploy(entradaNFTAddress, eventManagerAddress);
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();
  console.log(`   -> ReventaMarketplace desplegado en: ${marketplaceAddress}`);

  // 4. Interconexiones
  console.log("\n4. Configurando referencias entre contratos...");
  await entradaNFT.setEventManager(eventManagerAddress);
  await eventManager.setMarketplace(marketplaceAddress);
  console.log("   -> Referencias cruzadas establecidas.");

  // 5. Configuración de Roles
  console.log("\n5. Asignando roles de control de acceso (AccessControl)...");
  const OPERADOR_ROLE = await entradaNFT.OPERADOR_ROLE();
  const VALIDADOR_ROLE = await entradaNFT.VALIDADOR_ROLE();
  const ORGANIZADOR_ROLE = await eventManager.ORGANIZADOR_ROLE();
  const ORACULO_ROLE = await eventManager.ORACULO_ROLE();
  const VERIFICADOR_ROLE = await eventManager.VERIFICADOR_ROLE();
  const MARKETPLACE_ROLE = await eventManager.MARKETPLACE_ROLE();

  await entradaNFT.grantRole(OPERADOR_ROLE, eventManagerAddress);
  await entradaNFT.grantRole(OPERADOR_ROLE, marketplaceAddress);
  await entradaNFT.grantRole(VALIDADOR_ROLE, validador.address);

  await eventManager.grantRole(MARKETPLACE_ROLE, marketplaceAddress);
  await eventManager.grantRole(ORGANIZADOR_ROLE, organizador.address);
  await eventManager.grantRole(ORACULO_ROLE, oraculo.address);
  await eventManager.grantRole(VERIFICADOR_ROLE, verificador.address);

  console.log("   -> Roles asignados exitosamente.");
  console.log("\n====================================================");
  console.log("   SISTEMA LISTO PARA OPERAR");
  console.log("====================================================");

  return {
    entradaNFTAddress,
    eventManagerAddress,
    marketplaceAddress,
  };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
