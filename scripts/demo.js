const readline = require("readline");
const { ethers } = require("hardhat");
const {
  generarCompromiso,
  generarSalt,
  firmarVerificacionIdentidad,
  firmarAccesoQR,
} = require("./utils");
const { esperarRechazo } = require("./errores");

// Códigos ANSI para colorear salida en consola
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const MAGENTA = "\x1b[35m";

async function pausar(siguientePaso) {
  if (process.env.SIN_PAUSA === "1" || process.stdin.readableEnded || process.stdin.destroyed) {
    return;
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  await new Promise((resolve) => {
    let resuelto = false;
    const finalizar = () => {
      if (!resuelto) {
        resuelto = true;
        rl.close();
        resolve();
      }
    };
    rl.once("close", finalizar);
    try {
      rl.question(
        `\n${YELLOW}⏸  Presioná [ENTER] para ${siguientePaso}...${RESET}`,
        () => finalizar()
      );
    } catch (_) {
      finalizar();
    }
  });
}

function banner(titulo) {
  console.log(`\n${CYAN}========================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}   ${titulo}${RESET}`);
  console.log(`${CYAN}========================================================================${RESET}\n`);
}

function subheader(texto) {
  console.log(`\n${BOLD}${MAGENTA}--- ${texto} ---${RESET}`);
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  banner("DEMO DAY 2026: e-TicketEvento — Entradas Tokenizadas para Eventos Masivos\n   UTN-FRC (Comisión 5K3A) - Cátedra: Blockchain");

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
  ] = await ethers.getSigners();

  console.log(`${BOLD}PARTICIPANTES EN LA DEMOSTRACIÓN:${RESET}`);
  console.log(`  • Organizador:   ${organizador.address}`);
  console.log(`  • Artista / Club:${artista.address}`);
  console.log(`  • Ticketera:     ${plataforma.address}`);
  console.log(`  • Tribuna Segura:${verificador.address}`);
  console.log(`  • Control Acceso:${validador.address}`);
  console.log(`  • Oráculo:       ${oraculo.address}`);
  console.log(`  • Comprador 1:   ${comprador1.address}`);
  console.log(`  • Comprador 2:   ${comprador2.address}`);

  await pausar("avanzar al Paso 1: Despliegue y arquitectura de contratos");

  // 1. Despliegue
  subheader("1. DESPLIEGUE Y ARQUITECTURA DE CONTRATOS");
  const EntradaNFTFactory = await ethers.getContractFactory("EntradaNFT");
  const entradaNFT = await EntradaNFTFactory.deploy();
  await entradaNFT.waitForDeployment();

  const EventManagerFactory = await ethers.getContractFactory("EventManager");
  const eventManager = await EventManagerFactory.deploy(await entradaNFT.getAddress());
  await eventManager.waitForDeployment();

  const ReventaMarketplaceFactory = await ethers.getContractFactory("ReventaMarketplace");
  const marketplace = await ReventaMarketplaceFactory.deploy(
    await entradaNFT.getAddress(),
    await eventManager.getAddress()
  );
  await marketplace.waitForDeployment();

  await entradaNFT.setEventManager(await eventManager.getAddress());
  await eventManager.setMarketplace(await marketplace.getAddress());

  // Roles
  await entradaNFT.grantRole(await entradaNFT.OPERADOR_ROLE(), await eventManager.getAddress());
  await entradaNFT.grantRole(await entradaNFT.OPERADOR_ROLE(), await marketplace.getAddress());
  await entradaNFT.grantRole(await entradaNFT.VALIDADOR_ROLE(), validador.address);

  await eventManager.grantRole(await eventManager.MARKETPLACE_ROLE(), await marketplace.getAddress());
  await eventManager.grantRole(await eventManager.ORGANIZADOR_ROLE(), organizador.address);
  await eventManager.grantRole(await eventManager.ORACULO_ROLE(), oraculo.address);
  await eventManager.grantRole(await eventManager.VERIFICADOR_ROLE(), verificador.address);

  console.log(`${GREEN}✔ Contratos desplegados y roles concedidos bajo AccessControl.${RESET}`);

  await pausar("avanzar al Paso 2: Creación del evento por el Organizador");

  // 2. Crear Evento
  subheader("2. CREACIÓN DEL EVENTO POR EL ORGANIZADOR");
  const idEvento = 101;
  const precioBase = ethers.parseEther("0.1"); // 0.1 ETH
  const blockTime = (await ethers.provider.getBlock("latest")).timestamp;
  const fechaEvento = blockTime + 7 * 24 * 3600;

  await eventManager.connect(organizador).crearEvento(
    idEvento,
    "Recital de Rock - Kempes 2026",
    0, // Recital
    fechaEvento,
    "Estadio Mario Alberto Kempes",
    artista.address,
    plataforma.address,
    precioBase,
    50000, // capacidad
    2000,  // tope reventa: +20%
    1000,  // regalía artista: 10%
    500,   // comisión plataforma: 5%
    2,     // límite por persona: 2
    2,     // máx transferencias: 2
    true   // requiere verificación Tribuna Segura
  );
  console.log(`${GREEN}✔ Evento 101 registrado: 'Recital de Rock - Kempes 2026'${RESET}`);
  console.log(`  Reglas: Tope Reventa = +20% | Regalía = 10% | Comisión = 5% | Límite por DNI = 2`);

  await pausar("avanzar al Paso 3: Compra primaria con identidad verificada (Lazy Mint)");

  // 3. Compra Primaria
  subheader("3. COMPRA PRIMARIA CON IDENTIDAD VERIFICADA (LAZY MINT)");
  const dniComprador1 = 41234567;
  const saltComprador1 = generarSalt();
  const compromiso1 = generarCompromiso(dniComprador1, saltComprador1);

  console.log(`  • DNI del titular: ${dniComprador1} (nunca expuesto on-chain)`);
  console.log(`  • Compromiso criptográfico: ${compromiso1}`);

  const firmaVerificador1 = await firmarVerificacionIdentidad(
    verificador,
    await eventManager.getAddress(),
    compromiso1,
    comprador1.address,
    idEvento
  );
  console.log(`${GREEN}✔ Identidad validada y firmada por Tribuna Segura (EIP-712).${RESET}`);

  const txCompra = await eventManager.connect(comprador1).comprarEntrada(
    idEvento,
    compromiso1,
    firmaVerificador1,
    { value: precioBase }
  );
  await txCompra.wait();
  console.log(`${GREEN}✔ Entrada #1 acuñada (NFT ERC-721) a Comprador 1. Fondos retenidos en Escrow: 0.1 ETH.${RESET}`);

  const datosIniciales = await entradaNFT.obtenerEntrada(1);
  const estadoInicial = await entradaNFT.estadoEfectivo(1);
  const titularInicial = await entradaNFT.ownerOf(1);
  console.log(`  [Consulta on-chain] Titular: ${titularInicial} | Estado DTE: '${estadoInicial}' | Precio Original: ${ethers.formatEther(datosIniciales.precioOriginal)} ETH | Transferencias: 0`);

  await pausar("avanzar al Paso 4: Ataque de transferencia P2P fuera de la plataforma");

  // 4. Intento de Fraude P2P
  subheader("4. DEMOSTRACIÓN DE SEGURIDAD: INTENTO DE REVENTA PARALELA P2P");
  console.log(`  • Acción intentada:  EntradaNFT.transferFrom(Comprador 1 → Comprador 2, token #1)`);
  console.log(`  • Emisor (Titular):  ${comprador1.address}`);
  console.log(`  • Receptor (P2P):    ${comprador2.address} (intentando eludir ReventaMarketplace)`);
  console.log(`  • Regla en contrato: Hook _update() exige OPERADOR_ROLE para transferir entre billeteras`);
  await esperarRechazo(
    () =>
      entradaNFT
        .connect(comprador1)
        .transferFrom(comprador1.address, comprador2.address, 1, { gasLimit: 150000 }),
    "TransferenciaDirectaBloqueada",
    [entradaNFT, eventManager, marketplace]
  );
  const datosPostP2P = await entradaNFT.obtenerEntrada(1);
  console.log(
    `  • [Estado on-chain tras el rechazo] Titular: ${await entradaNFT.ownerOf(1)} (sin cambios) · Estado: '${await entradaNFT.estadoEfectivo(1)}' · Transferencias: ${datosPostP2P.cantTransferencias}`
  );

  await pausar("avanzar al Paso 5: Ataque de reventa con sobreprecio (+50 %)");

  // 5. Intento de Reventa Abusiva
  subheader("5. DEMOSTRACIÓN DE NEGOCIO: TOPE MÁXIMO DE REVENTA");
  const precioAbusivo = ethers.parseEther("0.15"); // +50%, tope es +20% (0.12)
  const infoEvento = await eventManager.obtenerEvento(idEvento);
  const precioMaximoLegal = (precioBase * (10000n + infoEvento.topeReventaBps)) / 10000n;
  console.log(`  • Acción intentada:  ReventaMarketplace.publicarReventa(token #1, ${ethers.formatEther(precioAbusivo)} ETH)`);
  console.log(`  • Emisor (Vendedor): ${comprador1.address}`);
  console.log(
    `  • Regla en contrato: Precio base ${ethers.formatEther(precioBase)} ETH + tope +${Number(infoEvento.topeReventaBps) / 100} % (${infoEvento.topeReventaBps} bps) → Máximo legal: ${ethers.formatEther(precioMaximoLegal)} ETH`
  );
  console.log(
    `  • Sobreprecio:       Intenta publicar a ${ethers.formatEther(precioAbusivo)} ETH (+50 %, excede el máximo legal en ${ethers.formatEther(precioAbusivo - precioMaximoLegal)} ETH)`
  );
  await esperarRechazo(
    () => marketplace.connect(comprador1).publicarReventa(1, precioAbusivo, { gasLimit: 150000 }),
    "PrecioSuperaTope",
    [entradaNFT, eventManager, marketplace]
  );
  const pubActivaPostAtaque = await marketplace.tokenAPublicacionActiva(1);
  console.log(
    `  • [Estado on-chain tras el rechazo] Publicación activa: #${pubActivaPostAtaque} (ninguna) · Titular: ${await entradaNFT.ownerOf(1)} · Estado: '${await entradaNFT.estadoEfectivo(1)}'`
  );

  await pausar("avanzar al Paso 6: Reventa regulada (+15 %) y reparto automático (Split)");

  // 6. Reventa Legal y Split de Fondos
  subheader("6. REVENTA REGULADA Y REPARTO AUTOMÁTICO DE FONDOS (SPLIT)");
  const precioLegal = ethers.parseEther("0.115"); // +15%, dentro del tope
  await marketplace.connect(comprador1).publicarReventa(1, precioLegal);
  const estadoEnReventa = await entradaNFT.estadoEfectivo(1);
  console.log(`${GREEN}✔ Entrada #1 publicada en el Marketplace oficial a 0.115 ETH (Estado consultado: '${estadoEnReventa}').${RESET}`);

  const dniComprador2 = 43987654;
  const saltComprador2 = generarSalt();
  const compromiso2 = generarCompromiso(dniComprador2, saltComprador2);
  const firmaVerificador2 = await firmarVerificacionIdentidad(
    verificador,
    await eventManager.getAddress(),
    compromiso2,
    comprador2.address,
    idEvento
  );

  console.log(`  Comprador 2 adquiere la entrada en reventa por 0.115 ETH...`);
  await marketplace.connect(comprador2).revenderEntrada(1, compromiso2, firmaVerificador2, {
    value: precioLegal,
  });
  const datosPostReventa = await entradaNFT.obtenerEntrada(1);
  const estadoPostReventa = await entradaNFT.estadoEfectivo(1);
  const titularPostReventa = await entradaNFT.ownerOf(1);
  console.log(`${GREEN}✔ Reventa completada.${RESET}`);
  console.log(`  [Consulta on-chain] Nuevo Titular: ${titularPostReventa} | Estado DTE: '${estadoPostReventa}' | cantTransferencias: ${datosPostReventa.cantTransferencias}`);

  const saldoArtista = await eventManager.saldosPendientes(artista.address);
  const saldoPlataforma = await eventManager.saldosPendientes(plataforma.address);
  const saldoVendedor = await eventManager.saldosPendientes(comprador1.address);

  console.log(`\n${BOLD}DISTRIBUCIÓN AUTOMÁTICA DEL PAGO (SPLIT EN CÓDIGO):${RESET}`);
  console.log(`  • Artista (Regalía ERC-2981 del 10%):  ${ethers.formatEther(saldoArtista)} ETH`);
  console.log(`  • Ticketera (Comisión del 5%):        ${ethers.formatEther(saldoPlataforma)} ETH`);
  console.log(`  • Vendedor Secundario (Neto 85%):      ${ethers.formatEther(saldoVendedor)} ETH`);

  await pausar("avanzar al Paso 7: Control de acceso en puerta, QR dinámico y anti-replay");

  // 7. Control de Acceso y Permisos
  subheader("7. CONTROL DE ACCESO EN PUERTA: PERMISOS, QR DINÁMICO Y ANTI-REPLAY");
  const ahora = (await ethers.provider.getBlock("latest")).timestamp;
  const firmaQR = await firmarAccesoQR(comprador2, await entradaNFT.getAddress(), 1, ahora);

  console.log(`  Intento de validar ingreso por cuenta sin VALIDADOR_ROLE (Comprador 1)...`);
  await esperarRechazo(
    () => entradaNFT.connect(comprador1).validarIngreso(1, compromiso2, ahora, firmaQR),
    "AccessControlUnauthorizedAccount",
    [entradaNFT, eventManager, marketplace]
  );

  console.log(`  Validador autorizado de puerta escanea QR firmado por Comprador 2...`);
  await entradaNFT.connect(validador).validarIngreso(1, compromiso2, ahora, firmaQR);
  const estadoUtilizada = await entradaNFT.estadoEfectivo(1);
  console.log(`${GREEN}✔ INGRESO VALIDADO: Entrada #1 pasa a estado '${estadoUtilizada}'.${RESET}`);

  console.log(`  Intento de volver a ingresar con la misma entrada ya consumida (Replay)...`);
  await esperarRechazo(
    () => entradaNFT.connect(validador).validarIngreso(1, compromiso2, ahora, firmaQR),
    "EntradaNoValidaParaIngreso",
    [entradaNFT, eventManager, marketplace]
  );

  await pausar("avanzar al Paso 8: Gobernanza del Escrow y retiro de fondos (Patrón Pull)");

  // 8. Gobernanza del Escrow y Retiro de Fondos (Pull Pattern)
  subheader("8. GOBERNANZA DEL ESCROW Y LIQUIDACIÓN SEGURA (PATRÓN PULL)");
  console.log(`  Intento del Organizador de cerrar el evento por su cuenta (sin ORACULO_ROLE)...`);
  await esperarRechazo(
    () => eventManager.connect(organizador).cerrarEvento(idEvento),
    "AccessControlUnauthorizedAccount",
    [entradaNFT, eventManager, marketplace]
  );
  console.log(`  Solo el Oráculo puede liberar la custodia.`);

  console.log(`  El artista retira sus regalías acumuladas mediante retirarFondos()...`);
  await eventManager.connect(artista).retirarFondos();
  console.log(`${GREEN}✔ Fondos transferidos con éxito. Saldo pendiente del artista en contrato: 0 ETH.${RESET}`);

  banner("DEMOSTRACIÓN FINALIZADA CON ÉXITO\n   Todas las reglas de negocio, seguridad y gobernanza fueron validadas.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
