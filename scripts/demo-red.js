/**
 * Demo del Demo Day sobre una red persistente, reutilizando los contratos de deploy-red.js.
 *
 *   npx hardhat run scripts/demo-red.js --network localhost   (nodo local: `npx hardhat node`)
 *   npx hardhat run scripts/demo-red.js --network amoy        (Polygon Amoy, red de prueba pública)
 *
 * Cada transacción se imprime con su hash (y en Amoy, con el enlace a amoy.polygonscan.com).
 * Cada ataque muestra el error REAL que devolvió el contrato.
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;
const {
  generarCompromiso,
  generarSalt,
  firmarVerificacionIdentidad,
  firmarAccesoQR,
} = require("./utils");
const { esperarRechazo } = require("./errores");

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const MAGENTA = "\x1b[35m";
const GRAY = "\x1b[90m";

const red = hre.network.name;
const EXPLORADOR = red === "amoy" ? "https://amoy.polygonscan.com" : null;
const ES_LOCAL = red === "localhost" || red === "hardhat";
const MONEDA = red === "amoy" ? "POL" : "ETH";

const transacciones = [];

function titulo(texto) {
  console.log(`\n${BOLD}${MAGENTA}--- ${texto} ---${RESET}`);
}

async function enviar(promesa, descripcion) {
  const tx = await promesa;
  const recibo = await tx.wait();
  transacciones.push({ descripcion, hash: tx.hash, gas: recibo.gasUsed, precio: recibo.gasPrice });
  const enlace = EXPLORADOR ? `${EXPLORADOR}/tx/${tx.hash}` : `tx ${tx.hash}`;
  console.log(`${GREEN}✔ ${descripcion}${RESET} ${GRAY}(bloque ${recibo.blockNumber} · ${enlace})${RESET}`);
  return recibo;
}

function fmt(wei) {
  return `${ethers.formatEther(wei)} ${MONEDA}`;
}

function tokenDeRecibo(recibo, eventManager) {
  for (const log of recibo.logs) {
    try {
      const p = eventManager.interface.parseLog(log);
      if (p?.name === "EntradaComprada") return p.args.tokenId;
    } catch (_) {
      /* log de otro contrato */
    }
  }
  throw new Error("No se encontró el evento EntradaComprada en el recibo");
}

async function horaDeBloque() {
  return (await ethers.provider.getBlock("latest")).timestamp;
}

/**
 * Cuentas de la demo. En el nodo local se usan las cuentas de prueba de Hardhat.
 * En Amoy hay una sola clave (PRIVATE_KEY): los compradores se derivan de ella de forma
 * determinística (siempre las mismas direcciones) y se fondean con un monto chico.
 */
async function prepararCuentas(admin) {
  const signers = await ethers.getSigners();
  if (signers.length >= 9) {
    return {
      artista: signers[2].address,
      plataforma: signers[3].address,
      comprador1: signers[7],
      comprador2: signers[8],
    };
  }

  const base = process.env.PRIVATE_KEY;
  const derivar = (etiqueta) =>
    new ethers.Wallet(ethers.keccak256(ethers.toUtf8Bytes(`${base}:e-ticket-evento:${etiqueta}`)), ethers.provider);

  const cuentas = {
    artista: derivar("artista").address,
    plataforma: derivar("plataforma").address,
    comprador1: derivar("comprador1"),
    comprador2: derivar("comprador2"),
  };

  const fondeo = ethers.parseEther(process.env.FONDEO_COMPRADOR || "0.05");
  for (const nombre of ["comprador1", "comprador2"]) {
    const w = cuentas[nombre];
    const saldo = await ethers.provider.getBalance(w.address);
    if (saldo < fondeo) {
      await enviar(admin.sendTransaction({ to: w.address, value: fondeo - saldo }), `Fondeo de ${nombre} con ${fmt(fondeo - saldo)}`);
    }
  }
  return cuentas;
}

/** Devuelve a la billetera administradora lo que sobró en los compradores (solo redes públicas). */
async function devolverSobrante(admin, wallets) {
  for (const w of wallets) {
    const saldo = await ethers.provider.getBalance(w.address);
    const fee = await ethers.provider.getFeeData();
    const precioGas = fee.maxFeePerGas ?? fee.gasPrice;
    const costo = precioGas * 21000n * 2n;
    if (saldo > costo) {
      await enviar(
        w.sendTransaction({ to: admin.address, value: saldo - costo, gasLimit: 21000n, maxFeePerGas: precioGas * 2n, maxPriorityFeePerGas: fee.maxPriorityFeePerGas }),
        `Devolución del sobrante de ${w.address.slice(0, 8)}…`
      );
    }
  }
}

async function main() {
  const archivo = path.join(__dirname, "..", "deployments", `${red}.json`);
  if (!fs.existsSync(archivo)) {
    throw new Error(`No existe deployments/${red}.json. Ejecutá antes: npx hardhat run scripts/deploy-red.js --network ${red}`);
  }
  const dep = JSON.parse(fs.readFileSync(archivo, "utf8"));

  for (const [nombre, dir] of Object.entries(dep.contratos)) {
    if ((await ethers.provider.getCode(dir)) === "0x") {
      throw new Error(`${nombre} no existe en ${dir} (¿reiniciaste el nodo local?). Volvé a ejecutar deploy-red.js --network ${red}`);
    }
  }

  const [admin] = await ethers.getSigners();
  const entradaNFT = await ethers.getContractAt("EntradaNFT", dep.contratos.EntradaNFT);
  const eventManager = await ethers.getContractAt("EventManager", dep.contratos.EventManager);
  const marketplace = await ethers.getContractAt("ReventaMarketplace", dep.contratos.ReventaMarketplace);
  const todos = [entradaNFT, eventManager, marketplace];
  const dirEM = await eventManager.getAddress();
  const dirNFT = await entradaNFT.getAddress();

  for (const [contrato, rol] of [
    [eventManager, "ORGANIZADOR_ROLE"],
    [eventManager, "ORACULO_ROLE"],
    [eventManager, "VERIFICADOR_ROLE"],
    [entradaNFT, "VALIDADOR_ROLE"],
  ]) {
    if (!(await contrato.hasRole(await contrato[rol](), admin.address))) {
      throw new Error(`La billetera ${admin.address} no tiene ${rol}: esta demo necesita que la billetera del .env tenga todos los roles operativos.`);
    }
  }

  console.log(`\n${CYAN}========================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}   DEMO DAY: e-TicketEvento sobre la red '${red}' (chainId ${dep.chainId})${RESET}`);
  console.log(`${CYAN}========================================================================${RESET}`);
  console.log(`  EntradaNFT:         ${dep.contratos.EntradaNFT}`);
  console.log(`  EventManager:       ${dep.contratos.EventManager}`);
  console.log(`  ReventaMarketplace: ${dep.contratos.ReventaMarketplace}`);
  if (EXPLORADOR) console.log(`  Explorador:         ${EXPLORADOR}/address/${dep.contratos.EntradaNFT}`);
  console.log(`  Admin / Organizador / Oráculo / Tribuna Segura / Validador: ${admin.address}`);

  titulo("0. CUENTAS DE LA DEMO");
  const { artista, plataforma, comprador1, comprador2 } = await prepararCuentas(admin);
  console.log(`  • Artista:     ${artista}`);
  console.log(`  • Ticketera:   ${plataforma}`);
  console.log(`  • Comprador 1: ${comprador1.address}`);
  console.log(`  • Comprador 2: ${comprador2.address}`);

  const saldoInicialAdmin = await ethers.provider.getBalance(admin.address);

  // ---------------------------------------------------------------- 1. Evento
  titulo("1. CREACIÓN DEL EVENTO (Organizador)");
  const precio = ethers.parseEther(process.env.PRECIO_ENTRADA || (ES_LOCAL ? "0.1" : "0.001"));
  const idEvento = BigInt(await horaDeBloque());
  const fechaEvento = (await horaDeBloque()) + 7 * 24 * 3600;
  await enviar(
    eventManager.connect(admin).crearEvento(
      idEvento, "Recital de Rock - Kempes 2026", 0, fechaEvento, "Estadio Mario Alberto Kempes",
      artista, plataforma, precio, 50000, 2000, 1000, 500, 2, 2, true
    ),
    `Evento ${idEvento} creado: precio ${fmt(precio)}, tope +20 %, regalía 10 %, comisión 5 %, 2 por DNI`
  );

  // ---------------------------------------------------------------- 2. Compra
  titulo("2. COMPRA PRIMARIA CON IDENTIDAD VERIFICADA (se acuña el NFT)");
  const salt1 = generarSalt();
  const compromiso1 = generarCompromiso(41234567, salt1);
  console.log(`  DNI 41234567 → compromiso ${compromiso1} (el DNI no viaja a la red)`);
  const firma1 = await firmarVerificacionIdentidad(admin, dirEM, compromiso1, comprador1.address, idEvento);
  const r1 = await enviar(
    eventManager.connect(comprador1).comprarEntrada(idEvento, compromiso1, firma1, { value: precio }),
    "Comprador 1 compra la entrada (fondos en custodia)"
  );
  const tokenId = tokenDeRecibo(r1, eventManager);
  console.log(`  Entrada #${tokenId} · titular ${await entradaNFT.ownerOf(tokenId)} · estado '${await entradaNFT.estadoEfectivo(tokenId)}'`);

  // ---------------------------------------------------------------- 3. Ataques
  titulo("3. ATAQUE: transferencia directa fuera de la plataforma (P2P)");
  await esperarRechazo(
    () => entradaNFT.connect(comprador1).transferFrom(comprador1.address, comprador2.address, tokenId),
    "TransferenciaDirectaBloqueada",
    todos
  );

  titulo("4. ATAQUE: reventa con sobreprecio (+50 %, el tope es +20 %)");
  await esperarRechazo(
    () => marketplace.connect(comprador1).publicarReventa(tokenId, (precio * 150n) / 100n),
    "PrecioSuperaTope",
    todos
  );

  // ---------------------------------------------------------------- 5. Reventa
  titulo("5. REVENTA REGULADA Y REPARTO AUTOMÁTICO");
  const precioReventa = (precio * 115n) / 100n;
  const rPub = await enviar(
    marketplace.connect(comprador1).publicarReventa(tokenId, precioReventa),
    `Comprador 1 publica la entrada a ${fmt(precioReventa)} (+15 %)`
  );
  let idPublicacion;
  for (const log of rPub.logs) {
    try {
      const p = marketplace.interface.parseLog(log);
      if (p?.name === "ReventaPublicada") idPublicacion = p.args.idPublicacion;
    } catch (_) {}
  }
  console.log(`  Estado de la entrada: '${await entradaNFT.estadoEfectivo(tokenId)}' (el NFT queda en custodia del marketplace)`);

  const antes = {
    artista: await eventManager.saldosPendientes(artista),
    plataforma: await eventManager.saldosPendientes(plataforma),
    vendedor: await eventManager.saldosPendientes(comprador1.address),
  };
  const compromiso2 = generarCompromiso(43987654, generarSalt());
  const firma2 = await firmarVerificacionIdentidad(admin, dirEM, compromiso2, comprador2.address, idEvento);
  await enviar(
    marketplace.connect(comprador2).revenderEntrada(idPublicacion, compromiso2, firma2, { value: precioReventa }),
    "Comprador 2 compra la entrada en reventa"
  );
  const datos = await entradaNFT.obtenerEntrada(tokenId);
  console.log(`  Nuevo titular ${await entradaNFT.ownerOf(tokenId)} · estado '${await entradaNFT.estadoEfectivo(tokenId)}' · transferencias ${datos.cantTransferencias}`);
  console.log(`${BOLD}  Reparto de ${fmt(precioReventa)}:${RESET}`);
  console.log(`    Artista (10 %):   ${fmt((await eventManager.saldosPendientes(artista)) - antes.artista)}`);
  console.log(`    Ticketera (5 %):  ${fmt((await eventManager.saldosPendientes(plataforma)) - antes.plataforma)}`);
  console.log(`    Vendedor (85 %):  ${fmt((await eventManager.saldosPendientes(comprador1.address)) - antes.vendedor)}`);
  await enviar(eventManager.connect(comprador1).retirarFondos(), "Comprador 1 retira lo que le corresponde (patrón pull)");

  // ---------------------------------------------------------------- 6. Acceso
  titulo("6. CONTROL DE ACCESO CON QR DINÁMICO");
  let ts = await horaDeBloque();
  let qr = await firmarAccesoQR(comprador2, dirNFT, tokenId, ts);
  console.log("  Alguien sin VALIDADOR_ROLE intenta validar el ingreso...");
  await esperarRechazo(
    () => entradaNFT.connect(comprador1).validarIngreso(tokenId, compromiso2, ts, qr),
    "AccessControlUnauthorizedAccount",
    todos
  );
  ts = await horaDeBloque();
  qr = await firmarAccesoQR(comprador2, dirNFT, tokenId, ts);
  await enviar(entradaNFT.connect(admin).validarIngreso(tokenId, compromiso2, ts, qr), "El validador escanea el QR firmado por el Comprador 2");
  console.log(`  Estado de la entrada: '${await entradaNFT.estadoEfectivo(tokenId)}'`);
  console.log("  Se intenta volver a entrar con la misma entrada...");
  await esperarRechazo(
    () => entradaNFT.connect(admin).validarIngreso(tokenId, compromiso2, ts, qr),
    "EntradaNoValidaParaIngreso",
    todos
  );

  // ---------------------------------------------------------------- 7. Cancelación
  titulo("7. CANCELACIÓN DEL EVENTO Y REEMBOLSO (estado Reembolsada)");
  const idEventoB = idEvento + 1n;
  await enviar(
    eventManager.connect(admin).crearEvento(
      idEventoB, "Partido suspendido - Copa 2026", 2, fechaEvento, "Estadio Kempes",
      artista, plataforma, precio, 50000, 2000, 1000, 500, 2, 2, true
    ),
    `Evento ${idEventoB} creado (fútbol)`
  );
  const compromiso3 = generarCompromiso(41234567, generarSalt());
  const firma3 = await firmarVerificacionIdentidad(admin, dirEM, compromiso3, comprador1.address, idEventoB);
  const r3 = await enviar(
    eventManager.connect(comprador1).comprarEntrada(idEventoB, compromiso3, firma3, { value: precio }),
    "Comprador 1 compra una entrada para el partido"
  );
  const tokenB = tokenDeRecibo(r3, eventManager);
  await enviar(eventManager.connect(admin).cancelarEvento(idEventoB), "El oráculo informa la suspensión: evento Cancelado");
  await enviar(eventManager.connect(comprador1).reclamarReembolso(tokenB), "Comprador 1 reclama el reembolso");
  console.log(`  Entrada #${tokenB}: estado '${await entradaNFT.estadoEfectivo(tokenB)}' · saldo a retirar ${fmt(await eventManager.saldosPendientes(comprador1.address))}`);
  await enviar(eventManager.connect(comprador1).retirarFondos(), "Comprador 1 retira el reembolso");
  console.log("  Se intenta reclamar el reembolso de nuevo...");
  await esperarRechazo(() => eventManager.connect(comprador1).reclamarReembolso(tokenB), "YaReembolsada", todos);

  // ---------------------------------------------------------------- 8. Cierre
  titulo("8. CIERRE DEL EVENTO Y ENTRADA VENCIDA");
  if (ES_LOCAL) {
    const compromiso4 = generarCompromiso(41234567, generarSalt());
    const firma4 = await firmarVerificacionIdentidad(admin, dirEM, compromiso4, comprador1.address, idEvento);
    const r4 = await enviar(
      eventManager.connect(comprador1).comprarEntrada(idEvento, compromiso4, firma4, { value: precio }),
      "Comprador 1 compra otra entrada para el recital (no la va a usar)"
    );
    const tokenSinUso = tokenDeRecibo(r4, eventManager);
    console.log("  Intento de cerrar antes de tiempo...");
    await esperarRechazo(() => eventManager.connect(admin).cerrarEvento(idEvento), "FueraDeTermino", todos);
    console.log(`${YELLOW}  ⏩ Se adelanta el reloj de la red local 8 días (solo posible en una red de prueba local)${RESET}`);
    await hre.network.provider.send("evm_increaseTime", [8 * 24 * 3600]);
    await hre.network.provider.send("evm_mine", []);
    const custodia = (await eventManager.obtenerEvento(idEvento)).balanceCustodia;
    await enviar(eventManager.connect(admin).cerrarEvento(idEvento), `El oráculo cierra el evento y libera ${fmt(custodia)} al organizador`);
    console.log(`  Entrada #${tokenSinUso} (sin usar): estado '${await entradaNFT.estadoEfectivo(tokenSinUso)}'`);
    console.log(`  Entrada #${tokenId} (usada):     estado '${await entradaNFT.estadoEfectivo(tokenId)}'`);
  } else {
    console.log(`${YELLOW}  En una red pública no se puede adelantar el reloj: cerrarEvento exige fecha del evento + 24 h.${RESET}`);
    console.log("  Este paso se muestra en el nodo local o con el test CP-25 (npx hardhat test).");
  }

  // ---------------------------------------------------------------- Resumen
  if (!ES_LOCAL) {
    titulo("9. DEVOLUCIÓN DEL SOBRANTE DE LOS COMPRADORES");
    await devolverSobrante(admin, [comprador1, comprador2]);
  }

  titulo("RESUMEN");
  const totalGas = transacciones.reduce((s, t) => s + t.gas, 0n);
  const totalCosto = transacciones.reduce((s, t) => s + t.gas * t.precio, 0n);
  console.log(`  Transacciones enviadas: ${transacciones.length}`);
  console.log(`  Gas total: ${totalGas} · costo total en comisiones de red: ${fmt(totalCosto)}`);
  if (!ES_LOCAL) {
    const saldoFinalAdmin = await ethers.provider.getBalance(admin.address);
    console.log(`  Saldo de la billetera admin: ${fmt(saldoFinalAdmin)} (antes ${fmt(saldoInicialAdmin)})`);
  }
  if (EXPLORADOR) console.log(`  Historial completo: ${EXPLORADOR}/address/${dep.contratos.EventManager}`);
  console.log(`\n${BOLD}${CYAN}   DEMO FINALIZADA${RESET}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
