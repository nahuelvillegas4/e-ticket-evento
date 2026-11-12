const { ethers } = require("hardhat");
const {
  generarCompromiso,
  generarSalt,
  firmarVerificacionIdentidad,
  firmarAccesoQR,
} = require("../scripts/utils");

async function deploySistemaFixture() {
  const [
    admin,
    organizador,
    artista,
    plataforma,
    verificador,
    validador,
    oraculo,
    comprador1,
    comprador2,
    comprador3,
    otroUsuario,
  ] = await ethers.getSigners();

  // 1. Desplegar EntradaNFT
  const EntradaNFTFactory = await ethers.getContractFactory("EntradaNFT");
  const entradaNFT = await EntradaNFTFactory.deploy();
  await entradaNFT.waitForDeployment();
  const entradaNFTAddress = await entradaNFT.getAddress();

  // 2. Desplegar EventManager
  const EventManagerFactory = await ethers.getContractFactory("EventManager");
  const eventManager = await EventManagerFactory.deploy(entradaNFTAddress);
  await eventManager.waitForDeployment();
  const eventManagerAddress = await eventManager.getAddress();

  // 3. Desplegar ReventaMarketplace
  const ReventaMarketplaceFactory = await ethers.getContractFactory("ReventaMarketplace");
  const marketplace = await ReventaMarketplaceFactory.deploy(entradaNFTAddress, eventManagerAddress);
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();

  // 4. Configurar interconexiones
  await entradaNFT.setEventManager(eventManagerAddress);
  await eventManager.setMarketplace(marketplaceAddress);

  // 5. Configurar roles
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

  // Parámetros de referencia del plan
  const DEFAULT_EVENT_PARAMS = {
    idEvento: 1,
    nombre: "Recital Rock 2026",
    tipoEvento: 0, // Recital
    fechaHoraOffset: 7 * 24 * 3600, // 7 días en el futuro
    lugar: "Estadio Mario Alberto Kempes",
    precioBase: ethers.parseEther("0.1"), // 100 en escala reducida o 0.1 ETH
    capacidad: 100,
    topeReventaBps: 2000, // +20%
    regaliaArtistaBps: 1000, // 10%
    comisionPlataformaBps: 500, // 5%
    limitePorPersona: 2,
    maxTransferencias: 2,
    requiereAdmision: true,
  };

  return {
    admin,
    organizador,
    artista,
    plataforma,
    verificador,
    validador,
    oraculo,
    comprador1,
    comprador2,
    comprador3,
    otroUsuario,
    entradaNFT,
    eventManager,
    marketplace,
    entradaNFTAddress,
    eventManagerAddress,
    marketplaceAddress,
    DEFAULT_EVENT_PARAMS,
    generarCompromiso,
    generarSalt,
    firmarVerificacionIdentidad,
    firmarAccesoQR,
  };
}

module.exports = {
  deploySistemaFixture,
};
