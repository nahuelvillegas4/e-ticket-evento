/**
 * Servidor de la interfaz web de e-TicketEvento.
 *
 * Al arrancar despliega los tres contratos DESDE CERO con la billetera del .env (PRIVATE_KEY),
 * que queda como administradora y con todos los roles operativos. No depende de ningún
 * despliegue anterior. Después sirve organizador.html y comprador.html y expone una API JSON
 * que firma y envía transacciones REALES. Las claves nunca salen de este proceso.
 *
 *   npm run interfaz:amoy            → Polygon Amoy: despliega contratos nuevos (~0,2 POL) y arranca
 *   npm run interfaz:amoy:continuar  → Polygon Amoy: retoma los contratos del último arranque
 *   npm run interfaz:local           → nodo local (`npm run nodo` en otra terminal)
 *   npm run interfaz                 → red en memoria de Hardhat (ensayo sin internet)
 *
 * Después abrir http://localhost:3000
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;

const RED = hre.network.name;
const ES_LOCAL = RED === "localhost" || RED === "hardhat";
const EXPLORADOR = RED === "amoy" ? "https://amoy.polygonscan.com" : null;
const MONEDA = RED === "amoy" ? "POL" : "ETH";
const PUERTO = Number(process.env.PUERTO_INTERFAZ || 3000);
const CARPETA = __dirname;
const ARCHIVO_REGISTRO = path.join(CARPETA, "..", "deployments", `interfaz-${RED}.json`);

const TIPOS = ["Recital", "Espectaculo", "Futbol"];
const ESTADO_EVENTO = ["Programado", "Finalizado", "Cancelado"];
const ESTADO_ENTRADA = ["Asignada", "EnReventa", "Utilizada", "Reembolsada"];
const ESTADO_PUB = ["Activa", "Vendida", "Retirada"];
// Registro de derecho de admisión que consulta Tribuna Segura (solo en eventos que lo exigen).
const RESTRINGIDOS = new Set(["30111222"]);

const PERFILES_COMPRADORES = [
  { id: "comprador1", nombre: "Ana Ferreyra", dni: "38456123" },
  { id: "comprador2", nombre: "Bruno Quiroga", dni: "41222333" },
];

let C = {}; // contratos
let IFACES = [];
let admin, cuentas = {}, chainId;
const transacciones = [];
let qrs = [];
let registro = { contratos: null, eventos: [] };

/* ------------------------------------------------------------------ utilidades */
const lc = (a) => String(a || "").toLowerCase();
const json = (v) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x));
const saltPara = (dni) => ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["string", "uint256"], ["tribuna-segura/salt/v1", dni]));
const compromisoDe = (dni, salt) => ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "bytes32"], [dni, salt]));

function guardarRegistro() {
  if (RED === "hardhat") return;
  fs.mkdirSync(path.dirname(ARCHIVO_REGISTRO), { recursive: true });
  fs.writeFileSync(ARCHIVO_REGISTRO, JSON.stringify(registro, null, 2));
}
function leerRegistroPrevio() {
  if (RED === "hardhat") return null;
  try { return JSON.parse(fs.readFileSync(ARCHIVO_REGISTRO, "utf8")); } catch (_) { return null; }
}

class ErrorUsuario extends Error {
  constructor(mensaje) { super(mensaje); this.status = 400; }
}

function datosDelError(e) {
  return e?.data ?? e?.error?.data ?? e?.info?.error?.data ?? e?.error?.error?.data ?? null;
}
function decodificarError(e) {
  if (e?.revert?.name) return { nombre: e.revert.name, selector: e.data?.slice?.(0, 10) || null };
  const data = datosDelError(e);
  if (typeof data === "string" && data.length >= 10) {
    for (const iface of IFACES) {
      try {
        const p = iface.parseError(data);
        if (p) return { nombre: p.name, selector: data.slice(0, 10) };
      } catch (_) { /* siguiente ABI */ }
    }
    return { nombre: "Desconocido", selector: data.slice(0, 10) };
  }
  const texto = `${e?.message || ""} ${e?.error?.message || ""}`;
  const m = texto.match(/custom error '([A-Za-z0-9_]+)\(/) || texto.match(/reverted with custom error '([A-Za-z0-9_]+)/);
  if (m) return { nombre: m[1], selector: ethers.id(m[1] + "()").slice(0, 10) };
  return { nombre: "Error", selector: null, mensaje: e?.shortMessage || e?.message || String(e) };
}

function nombreDe(addr) {
  if (!addr) return null;
  const a = addr.toLowerCase();
  for (const [k, v] of Object.entries(cuentas)) if (v.address.toLowerCase() === a) return k;
  for (const [k, v] of Object.entries({ EntradaNFT: C.dirNFT, EventManager: C.dirEM, ReventaMarketplace: C.dirMK })) if (v && v.toLowerCase() === a) return k;
  return null;
}

function decodificarEventos(recibo) {
  const out = [];
  for (const log of recibo?.logs || []) {
    const contrato = nombreDe(log.address);
    for (const iface of IFACES) {
      try {
        const p = iface.parseLog(log);
        if (!p) continue;
        const args = {};
        p.fragment.inputs.forEach((inp, i) => { args[inp.name || `arg${i}`] = p.args[i]; });
        out.push({ contrato, nombre: p.name, args });
        break;
      } catch (_) { /* otro ABI */ }
    }
  }
  return out;
}

function registrarTx({ actor, descripcion, contrato, metodo, tx, recibo, valor, error }) {
  const gas = recibo?.gasUsed ?? 0n;
  const precio = recibo?.gasPrice ?? recibo?.effectiveGasPrice ?? tx?.gasPrice ?? 0n;
  const reg = {
    id: transacciones.length + 1,
    ts: Date.now(),
    actor, descripcion, contrato, metodo,
    de: tx?.from || null,
    hash: tx?.hash || null,
    url: EXPLORADOR && tx?.hash ? `${EXPLORADOR}/tx/${tx.hash}` : null,
    bloque: recibo?.blockNumber ?? null,
    gas, costo: gas * precio,
    valor: valor ?? 0n,
    estado: error ? "fallida" : "ok",
    error: error || null,
    eventos: decodificarEventos(recibo),
    simulada: false,
  };
  transacciones.unshift(reg);
  if (transacciones.length > 200) transacciones.pop();
  console.log(`${reg.estado === "ok" ? "✔" : "✘"} [${actor}] ${descripcion}${reg.url ? " · " + reg.url : reg.hash ? " · " + reg.hash : ""}${error ? " · " + error.nombre : ""}`);
  return reg;
}

// Todas las escrituras pasan por una cola para no pisar nonces entre billeteras que comparten fondeo.
let cola = Promise.resolve();
function enCola(fn) {
  const p = cola.then(fn, fn);
  cola = p.catch(() => {});
  return p;
}

/**
 * Envía una transacción. Antes la simula (staticCall): si el contrato la rechaza, devuelve el error
 * sin gastar gas. Con `forzar`, la manda igual con gas fijo para que quede registrada (fallida) en el explorador.
 */
async function enviar({ actor, signer, contrato, nombreContrato, metodo, args, valor = 0n, descripcion, forzar = false }) {
  const c = contrato.connect(signer);
  const overrides = valor ? { value: valor } : {};
  let error = null;
  try {
    await c[metodo].staticCall(...args, overrides);
  } catch (e) {
    error = decodificarError(e);
    if (!forzar) return { ok: false, rechazadoAntes: true, error: { ...error, contrato: nombreContrato } };
  }
  if (error) {
    let tx;
    try {
      tx = await c[metodo](...args, { ...overrides, gasLimit: 500000n });
    } catch (_) {
      // Los nodos locales de Hardhat no aceptan transacciones que revierten: solo se informa el rechazo.
      return { ok: false, rechazadoAntes: true, noEnviable: true, error: { ...error, contrato: nombreContrato } };
    }
    let recibo;
    try { recibo = await tx.wait(); } catch (e) { recibo = e.receipt || (await ethers.provider.getTransactionReceipt(tx.hash)); }
    const reg = registrarTx({ actor, descripcion: descripcion + " (rechazada)", contrato: nombreContrato, metodo, tx, recibo, valor, error });
    return { ok: false, tx: reg, error: { ...error, contrato: nombreContrato } };
  }
  const tx = await c[metodo](...args, overrides);
  const recibo = await tx.wait();
  const reg = registrarTx({ actor, descripcion, contrato: nombreContrato, metodo, tx, recibo, valor });
  return { ok: true, tx: reg };
}

/** Carga saldo a una billetera de comprador desde la del administrador cuando no le alcanza. */
async function asegurarSaldo(actor, necesario = 0n) {
  const w = cuentas[actor];
  if (!w || actor === "organizador") return null;
  // Con margen: solo se recarga cuando el saldo no cubre el monto + un mínimo para gas,
  // y se recarga de más (CARGA_COMPRADOR) para que las siguientes operaciones no necesiten otra carga.
  const minimo = ethers.parseEther(process.env.RESERVA_GAS || (ES_LOCAL ? "0.5" : "0.02"));
  const carga = ethers.parseEther(process.env.CARGA_COMPRADOR || (ES_LOCAL ? "1" : "0.1"));
  const saldo = await ethers.provider.getBalance(w.address);
  if (saldo >= necesario + minimo) return null;
  const monto = necesario + carga - saldo;
  const tx = await admin.sendTransaction({ to: w.address, value: monto });
  const recibo = await tx.wait();
  return registrarTx({ actor: "organizador", descripcion: `Carga de saldo a ${w.nombre} (${ethers.formatEther(monto)} ${MONEDA})`, contrato: null, metodo: "transfer", tx, recibo, valor: monto });
}

const ahora = async () => (await ethers.provider.getBlock("latest")).timestamp;

/* ------------------------------------------------------------------ arranque */
/**
 * Despliega los tres contratos desde cero con la billetera del .env y la deja con todos los roles.
 * Cada transacción queda registrada (con su enlace al explorador) como parte de la demo.
 */
async function desplegar() {
  const registrar = (descripcion, contrato, metodo, tx, recibo) => {
    const r = registrarTx({ actor: "organizador", descripcion, contrato, metodo, tx, recibo });
    r.fase = "despliegue";
  };
  const deploy = async (nombre, args = []) => {
    const c = await ethers.deployContract(nombre, args);
    const tx = c.deploymentTransaction();
    const recibo = await tx.wait();
    const dir = await c.getAddress();
    if (nombre === "EntradaNFT") { C.nft = c; C.dirNFT = dir; }
    if (nombre === "EventManager") { C.em = c; C.dirEM = dir; }
    if (nombre === "ReventaMarketplace") { C.mk = c; C.dirMK = dir; }
    IFACES = [C.em, C.nft, C.mk].filter(Boolean).map((x) => x.interface);
    registrar(`Despliegue de ${nombre} en ${dir}`, nombre, "constructor", tx, recibo);
    return c;
  };
  const paso = async (descripcion, contrato, nombre, metodo, args) => {
    const tx = await contrato[metodo](...args);
    const recibo = await tx.wait();
    registrar(descripcion, nombre, metodo, tx, recibo);
  };
  console.log(`\nDesplegando contratos nuevos en '${RED}' con ${admin.address}…`);
  const nft = await deploy("EntradaNFT");
  const em = await deploy("EventManager", [C.dirNFT]);
  const mk = await deploy("ReventaMarketplace", [C.dirNFT, C.dirEM]);
  const a = admin.address;
  await paso("Conectar EntradaNFT con EventManager", nft, "EntradaNFT", "setEventManager", [C.dirEM]);
  await paso("Conectar EventManager con el Marketplace", em, "EventManager", "setMarketplace", [C.dirMK]);
  await paso("OPERADOR_ROLE para EventManager (puede acuñar)", nft, "EntradaNFT", "grantRole", [await nft.OPERADOR_ROLE(), C.dirEM]);
  await paso("OPERADOR_ROLE para el Marketplace (puede mover entradas)", nft, "EntradaNFT", "grantRole", [await nft.OPERADOR_ROLE(), C.dirMK]);
  await paso("MARKETPLACE_ROLE para el Marketplace", em, "EventManager", "grantRole", [await em.MARKETPLACE_ROLE(), C.dirMK]);
  await paso("VALIDADOR_ROLE para la billetera del organizador (puerta)", nft, "EntradaNFT", "grantRole", [await nft.VALIDADOR_ROLE(), a]);
  await paso("ORGANIZADOR_ROLE para la billetera del organizador", em, "EventManager", "grantRole", [await em.ORGANIZADOR_ROLE(), a]);
  await paso("ORACULO_ROLE para la billetera del organizador", em, "EventManager", "grantRole", [await em.ORACULO_ROLE(), a]);
  await paso("VERIFICADOR_ROLE para la billetera del organizador (Tribuna Segura)", em, "EventManager", "grantRole", [await em.VERIFICADOR_ROLE(), a]);
  return { EntradaNFT: C.dirNFT, EventManager: C.dirEM, ReventaMarketplace: C.dirMK };
}

async function iniciar() {
  const signers = await ethers.getSigners();
  if (!signers.length) throw new Error("No hay billetera configurada. Completá PRIVATE_KEY en el .env (ver .env.example).");
  admin = signers[0];
  chainId = Number((await ethers.provider.getNetwork()).chainId);

  // Por defecto se despliegan contratos nuevos en cada arranque (independiente de deployments/<red>.json).
  // Con REUSAR_CONTRATOS=1 se retoman los del último arranque si siguen en la red y son de esta billetera.
  let dirs = null;
  const previo = leerRegistroPrevio();
  if (process.env.REUSAR_CONTRATOS === "1" && previo?.contratos?.ReventaMarketplace && lc(previo.admin) === lc(admin.address)) {
    let vivos = true;
    for (const d of Object.values(previo.contratos)) if ((await ethers.provider.getCode(d)) === "0x") vivos = false;
    if (vivos) { dirs = previo.contratos; registro = previo; console.log("Reutilizando los contratos del último arranque."); }
  }
  if (!dirs) {
    if (!ES_LOCAL) {
      const saldo = await ethers.provider.getBalance(admin.address);
      const minimo = ethers.parseEther(process.env.MINIMO_DESPLIEGUE || "0.3");
      if (saldo < minimo) throw new Error(`La billetera ${admin.address} tiene ${ethers.formatEther(saldo)} ${MONEDA}. Para desplegar y operar la demo se necesitan al menos ${ethers.formatEther(minimo)}. Cargá POL de prueba en https://faucet.polygon.technology`);
    }
    dirs = await desplegar();
    registro = { red: RED, fecha: new Date().toISOString(), admin: admin.address, contratos: dirs, eventos: [] };
    guardarRegistro();
  }
  C.nft = await ethers.getContractAt("EntradaNFT", dirs.EntradaNFT);
  C.em = await ethers.getContractAt("EventManager", dirs.EventManager);
  C.mk = await ethers.getContractAt("ReventaMarketplace", dirs.ReventaMarketplace);
  C.dirNFT = dirs.EntradaNFT; C.dirEM = dirs.EventManager; C.dirMK = dirs.ReventaMarketplace;
  IFACES = [C.em.interface, C.nft.interface, C.mk.interface];

  // Cuentas: en redes locales, las de prueba de Hardhat; en Amoy, derivadas de PRIVATE_KEY igual que scripts/demo-red.js
  cuentas.organizador = { nombre: "Productora (admin)", address: admin.address, signer: admin };
  if (signers.length >= 9) {
    cuentas.artista = { nombre: "Artista", address: signers[2].address };
    cuentas.plataforma = { nombre: "Ticketera", address: signers[3].address };
    cuentas.comprador1 = { ...PERFILES_COMPRADORES[0], address: signers[7].address, signer: signers[7] };
    cuentas.comprador2 = { ...PERFILES_COMPRADORES[1], address: signers[8].address, signer: signers[8] };
  } else {
    const base = process.env.PRIVATE_KEY;
    const derivar = (etq) => new ethers.Wallet(ethers.keccak256(ethers.toUtf8Bytes(`${base}:e-ticket-evento:${etq}`)), ethers.provider);
    cuentas.artista = { nombre: "Artista", address: derivar("artista").address };
    cuentas.plataforma = { nombre: "Ticketera", address: derivar("plataforma").address };
    const w1 = derivar("comprador1"), w2 = derivar("comprador2");
    cuentas.comprador1 = { ...PERFILES_COMPRADORES[0], address: w1.address, signer: w1 };
    cuentas.comprador2 = { ...PERFILES_COMPRADORES[1], address: w2.address, signer: w2 };
  }
}

async function rolesDe(addr) {
  return {
    ORGANIZADOR_ROLE: await C.em.hasRole(await C.em.ORGANIZADOR_ROLE(), addr),
    ORACULO_ROLE: await C.em.hasRole(await C.em.ORACULO_ROLE(), addr),
    VERIFICADOR_ROLE: await C.em.hasRole(await C.em.VERIFICADOR_ROLE(), addr),
    VALIDADOR_ROLE: await C.nft.hasRole(await C.nft.VALIDADOR_ROLE(), addr),
  };
}

let cacheRoles = null;
async function config() {
  if (!cacheRoles) cacheRoles = await rolesDe(admin.address);
  return {
    modo: "red", red: RED, chainId, esLocal: ES_LOCAL, explorador: EXPLORADOR, moneda: MONEDA,
    contratos: { EntradaNFT: C.dirNFT, EventManager: C.dirEM, ReventaMarketplace: C.dirMK },
    organizador: { address: admin.address, roles: cacheRoles },
    artista: cuentas.artista.address, plataforma: cuentas.plataforma.address,
    compradores: ["comprador1", "comprador2"].map((id) => ({ id, nombre: cuentas[id].nombre, dni: cuentas[id].dni, address: cuentas[id].address })),
    precioSugerido: process.env.PRECIO_ENTRADA || (ES_LOCAL ? "0.1" : "0.001"),
    ventanaQR: 60, margenCierre: 86400,
  };
}

/* ------------------------------------------------------------------ lectura de estado */
async function leerEvento(id) {
  const e = await C.em.obtenerEvento(id);
  if (e.idEvento === 0n) return null;
  return {
    idEvento: e.idEvento.toString(), nombre: e.nombre, tipo: TIPOS[Number(e.tipoEvento)], fechaHora: Number(e.fechaHora), lugar: e.lugar,
    organizador: e.organizador, artista: e.artista, plataforma: e.plataformaTicketing, precioBase: e.precioBase, capacidad: Number(e.capacidad),
    vendidas: Number(e.vendidas), topeBps: Number(e.topeReventaBps), regaliaBps: Number(e.regaliaArtistaBps), comisionBps: Number(e.comisionPlataformaBps),
    limitePorPersona: Number(e.limitePorPersona), maxTransferencias: Number(e.maxTransferencias), requiereAdmision: e.requiereAdmision,
    estado: ESTADO_EVENTO[Number(e.estado)], custodia: e.balanceCustodia,
  };
}

async function estado() {
  const [bloque, ts] = await Promise.all([ethers.provider.getBlockNumber(), ahora()]);
  const eventos = (await Promise.all(registro.eventos.map(leerEvento))).filter(Boolean);
  const nextToken = Number(await C.nft.nextTokenId());
  const nextPub = Number(await C.mk.nextPublicacionId());
  const publicaciones = await Promise.all(Array.from({ length: nextPub - 1 }, async (_, i) => {
    const p = await C.mk.obtenerPublicacion(i + 1);
    return { id: i + 1, tokenId: Number(p.idToken), vendedor: p.vendedor, precio: p.precioReventa, fecha: Number(p.fechaPublicacion), estado: ESTADO_PUB[Number(p.estado)] };
  }));
  const entradas = await Promise.all(Array.from({ length: nextToken - 1 }, async (_, i) => {
    const id = i + 1;
    const [e, titular, efectivo] = await Promise.all([C.nft.obtenerEntrada(id), C.nft.ownerOf(id), C.nft.estadoEfectivo(id)]);
    const pub = publicaciones.find((p) => p.tokenId === id && p.estado === "Activa");
    return {
      tokenId: id, idEvento: e.idEvento.toString(), precioOriginal: e.precioOriginal, compromiso: e.compromisoIdentidad,
      cantTransferencias: Number(e.cantTransferencias), estado: ESTADO_ENTRADA[Number(e.estado)], estadoEfectivo: efectivo,
      fechaEmision: Number(e.fechaEmision), fechaValidacion: Number(e.fechaValidacion),
      titular, vendedor: pub ? pub.vendedor : null, idPublicacion: pub ? pub.id : null,
    };
  }));
  // Entradas de eventos creados fuera de la interfaz: se suman al registro para poder verlos.
  for (const t of entradas) if (!registro.eventos.includes(t.idEvento)) { registro.eventos.push(t.idEvento); guardarRegistro(); }
  const saldos = {};
  await Promise.all(Object.values(cuentas).map(async (c) => {
    const [b, p] = await Promise.all([ethers.provider.getBalance(c.address), C.em.saldosPendientes(c.address)]);
    saldos[c.address.toLowerCase()] = { balance: b, pendiente: p };
  }));
  return { ahora: ts, bloque, eventos, entradas, publicaciones, saldos, qrs: qrs.slice(0, 12), transacciones: transacciones.slice(0, 80) };
}

/* ------------------------------------------------------------------ acciones */
const reqCuenta = (id) => {
  const c = cuentas[id];
  if (!c || !c.signer) throw new ErrorUsuario(`Cuenta desconocida: ${id}`);
  return c;
};
const aWei = (v, campo) => {
  try { return ethers.parseEther(String(v).trim()); } catch (_) { throw new ErrorUsuario(`${campo}: monto inválido`); }
};
const entero = (v, campo) => {
  if (!/^\d+$/.test(String(v).trim())) throw new ErrorUsuario(`${campo}: tiene que ser un entero no negativo`);
  return BigInt(String(v).trim());
};
async function precioEvento(idEvento) { return (await C.em.obtenerEvento(idEvento)).precioBase; }

const ACCIONES = {
  async "organizador/crear-evento"(b) {
    const idEvento = entero(b.idEvento, "ID");
    const args = [
      idEvento, String(b.nombre || ""), TIPOS.indexOf(b.tipo) < 0 ? 0 : TIPOS.indexOf(b.tipo), entero(b.fechaHora, "Fecha"), String(b.lugar || ""),
      b.artista || cuentas.artista.address, b.plataforma || cuentas.plataforma.address, aWei(b.precio, "Precio"), entero(b.capacidad, "Capacidad"),
      entero(b.topeBps, "Tope"), entero(b.regaliaBps, "Regalía"), entero(b.comisionBps, "Comisión"), entero(b.limitePorPersona, "Límite"),
      entero(b.maxTransferencias, "Reventas"), !!b.requiereAdmision,
    ];
    if (!ethers.isAddress(args[5]) || !ethers.isAddress(args[6])) throw new ErrorUsuario("Dirección de artista o plataforma con formato inválido");
    const r = await enviar({ actor: "organizador", signer: admin, contrato: C.em, nombreContrato: "EventManager", metodo: "crearEvento", args, descripcion: `Crear evento #${idEvento} “${args[1]}”`, forzar: b.forzar });
    if (r.ok && !registro.eventos.includes(idEvento.toString())) { registro.eventos.push(idEvento.toString()); guardarRegistro(); }
    return r;
  },
  async "oraculo/cancelar"(b) {
    return enviar({ actor: "organizador", signer: admin, contrato: C.em, nombreContrato: "EventManager", metodo: "cancelarEvento", args: [entero(b.idEvento, "ID")], descripcion: `Oráculo cancela el evento #${b.idEvento}`, forzar: b.forzar });
  },
  async "oraculo/cerrar"(b) {
    return enviar({ actor: "organizador", signer: admin, contrato: C.em, nombreContrato: "EventManager", metodo: "cerrarEvento", args: [entero(b.idEvento, "ID")], descripcion: `Oráculo cierra el evento #${b.idEvento} y libera la custodia`, forzar: b.forzar });
  },
  async "tiempo/adelantar"(b) {
    if (!ES_LOCAL) throw new ErrorUsuario("En una red pública no se puede adelantar el reloj.");
    const s = Number(b.segundos) || 86400;
    await hre.network.provider.send("evm_increaseTime", [s]);
    await hre.network.provider.send("evm_mine", []);
    return { ok: true, ahora: await ahora() };
  },
  async "identidad/verificar"(b) {
    const c = reqCuenta(b.cuenta);
    const dni = String(b.dni || "").trim();
    if (!/^[1-9]\d{6,7}$/.test(dni)) throw new ErrorUsuario("DNI inválido: 7 u 8 dígitos sin puntos");
    const idEvento = entero(b.idEvento, "Evento");
    const ev = await C.em.obtenerEvento(idEvento);
    if (!b.falsificar && ev.requiereAdmision && RESTRINGIDOS.has(dni)) {
      return { ok: false, error: { nombre: "DerechoDeAdmision", mensaje: "Tribuna Segura no emite la firma: el DNI tiene una restricción de concurrencia vigente (Ley 23.184)." } };
    }
    const salt = saltPara(dni), compromiso = compromisoDe(dni, salt);
    const firmante = b.falsificar ? c.signer : admin; // ataque: el comprador se firma a sí mismo
    const domain = { name: "EventManager", version: "1", chainId, verifyingContract: C.dirEM };
    const types = { VerificarIdentidad: [{ name: "compromiso", type: "bytes32" }, { name: "comprador", type: "address" }, { name: "idEvento", type: "uint256" }] };
    const firma = await firmante.signTypedData(domain, types, { compromiso, comprador: c.address, idEvento });
    const dirFirmante = ethers.verifyTypedData(domain, types, { compromiso, comprador: c.address, idEvento }, firma);
    const yaTiene = Number(await C.em.entradasPorPersona(idEvento, compromiso));
    return { ok: true, salt, compromiso, firma, firmante: dirFirmante, firmanteEsVerificador: await C.em.hasRole(await C.em.VERIFICADOR_ROLE(), dirFirmante), yaTiene };
  },
  async comprar(b) {
    const c = reqCuenta(b.cuenta);
    const idEvento = entero(b.idEvento, "Evento");
    const precio = await precioEvento(idEvento);
    const valor = b.montoAlterado ? (precio * 9n) / 10n : precio;
    const carga = await asegurarSaldo(b.cuenta, valor);
    const r = await enviar({ actor: b.cuenta, signer: c.signer, contrato: C.em, nombreContrato: "EventManager", metodo: "comprarEntrada", args: [idEvento, b.compromiso, b.firma], valor, descripcion: `${c.nombre} compra una entrada del evento #${idEvento}`, forzar: b.forzar });
    if (r.ok) r.tokenId = Number(r.tx.eventos.find((e) => e.nombre === "EntradaComprada")?.args.tokenId ?? 0);
    r.carga = carga;
    return r;
  },
  async "reventa/publicar"(b) {
    const c = reqCuenta(b.cuenta);
    await asegurarSaldo(b.cuenta, 0n);
    const precio = aWei(b.precio, "Precio");
    return enviar({ actor: b.cuenta, signer: c.signer, contrato: C.mk, nombreContrato: "ReventaMarketplace", metodo: "publicarReventa", args: [entero(b.tokenId, "Entrada"), precio], descripcion: `${c.nombre} publica la entrada #${b.tokenId} a ${ethers.formatEther(precio)} ${MONEDA}`, forzar: b.forzar });
  },
  async "reventa/retirar"(b) {
    const c = reqCuenta(b.cuenta);
    await asegurarSaldo(b.cuenta, 0n);
    return enviar({ actor: b.cuenta, signer: c.signer, contrato: C.mk, nombreContrato: "ReventaMarketplace", metodo: "retirarPublicacion", args: [entero(b.idPublicacion, "Publicación")], descripcion: `${c.nombre} retira la publicación #${b.idPublicacion}`, forzar: b.forzar });
  },
  async "reventa/comprar"(b) {
    const c = reqCuenta(b.cuenta);
    const id = entero(b.idPublicacion, "Publicación");
    const pub = await C.mk.obtenerPublicacion(id);
    const valor = b.montoAlterado ? (pub.precioReventa * 9n) / 10n : pub.precioReventa;
    const carga = await asegurarSaldo(b.cuenta, valor);
    const r = await enviar({ actor: b.cuenta, signer: c.signer, contrato: C.mk, nombreContrato: "ReventaMarketplace", metodo: "revenderEntrada", args: [id, b.compromiso, b.firma], valor, descripcion: `${c.nombre} compra en reventa la entrada #${pub.idToken}`, forzar: b.forzar });
    r.carga = carga;
    return r;
  },
  async transferir(b) {
    const c = reqCuenta(b.cuenta);
    const destino = cuentas[b.destino]?.address || b.destino;
    await asegurarSaldo(b.cuenta, 0n);
    const metodo = b.metodo === "approve" ? "approve" : "transferFrom";
    const args = metodo === "approve" ? [destino, entero(b.tokenId, "Entrada")] : [c.address, destino, entero(b.tokenId, "Entrada")];
    return enviar({ actor: b.cuenta, signer: c.signer, contrato: C.nft, nombreContrato: "EntradaNFT", metodo, args, descripcion: `${c.nombre} intenta ${metodo === "approve" ? "autorizar a un tercero sobre" : "transferir directo"} la entrada #${b.tokenId}`, forzar: b.forzar });
  },
  async qr(b) {
    const c = reqCuenta(b.cuenta);
    const tokenId = Number(entero(b.tokenId, "Entrada"));
    const e = await C.nft.obtenerEntrada(tokenId);
    // En redes locales el último bloque puede ser viejo: se mina uno vacío para tomar la hora actual de la red.
    if (ES_LOCAL) await hre.network.provider.send("evm_mine", []);
    const timestamp = Number(b.timestamp ?? (await ahora()));
    const domain = { name: "EntradaNFT", version: "1", chainId, verifyingContract: C.dirNFT };
    const types = { ValidarAcceso: [{ name: "tokenId", type: "uint256" }, { name: "timestamp", type: "uint64" }] };
    const firma = await c.signer.signTypedData(domain, types, { tokenId, timestamp });
    const qr = { tokenId, timestamp, compromiso: e.compromisoIdentidad, firma };
    qrs.unshift({ ...qr, cuenta: b.cuenta, nombre: c.nombre, generado: Date.now() });
    qrs = qrs.slice(0, 20);
    return { ok: true, qr };
  },
  async ingreso(b) {
    const tokenId = entero(b.tokenId, "Entrada");
    return enviar({ actor: "organizador", signer: admin, contrato: C.nft, nombreContrato: "EntradaNFT", metodo: "validarIngreso", args: [tokenId, b.compromiso, entero(b.timestamp, "timestamp"), b.firma], descripcion: `Puerta: validación de la entrada #${tokenId}`, forzar: b.forzar });
  },
  async reembolso(b) {
    const c = reqCuenta(b.cuenta);
    await asegurarSaldo(b.cuenta, 0n);
    return enviar({ actor: b.cuenta, signer: c.signer, contrato: C.em, nombreContrato: "EventManager", metodo: "reclamarReembolso", args: [entero(b.tokenId, "Entrada")], descripcion: `${c.nombre} reclama el reembolso de la entrada #${b.tokenId}`, forzar: b.forzar });
  },
  async retirar(b) {
    const c = reqCuenta(b.cuenta);
    await asegurarSaldo(b.cuenta, 0n);
    return enviar({ actor: b.cuenta, signer: c.signer, contrato: C.em, nombreContrato: "EventManager", metodo: "retirarFondos", args: [], descripcion: `${c.nombre} retira su saldo (patrón pull)`, forzar: b.forzar });
  },
};

/* ------------------------------------------------------------------ HTTP */
const TIPOS_MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

function responder(res, status, cuerpo) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(json(cuerpo));
}

async function leerCuerpo(req) {
  let datos = "";
  for await (const parte of req) { datos += parte; if (datos.length > 1e6) throw new ErrorUsuario("Cuerpo demasiado grande"); }
  if (!datos) return {};
  try { return JSON.parse(datos); } catch (_) { throw new ErrorUsuario("JSON inválido"); }
}

function servirArchivo(req, res) {
  let rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (rel === "/") rel = "/index.html";
  const archivo = path.normalize(path.join(CARPETA, rel));
  if (!archivo.startsWith(CARPETA + path.sep) || path.basename(archivo).startsWith("servidor") || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("No encontrado");
  }
  let contenido = fs.readFileSync(archivo);
  // index.html se escribe sin <head> propio (también se publica como Artifact): acá se le agrega.
  if (path.basename(archivo) === "index.html") {
    contenido = Buffer.concat([Buffer.from('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0">'), contenido, Buffer.from("</body></html>")]);
  }
  res.writeHead(200, { "Content-Type": TIPOS_MIME[path.extname(archivo)] || "application/octet-stream", "Cache-Control": "no-store" });
  res.end(contenido);
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (!url.pathname.startsWith("/api/")) return servirArchivo(req, res);
  const ruta = url.pathname.slice(5);
  try {
    if (req.method === "GET" && ruta === "config") return responder(res, 200, await config());
    if (req.method === "GET" && ruta === "estado") return responder(res, 200, await estado());
    if (req.method === "POST" && ACCIONES[ruta]) {
      const cuerpo = await leerCuerpo(req);
      const lectura = ruta === "identidad/verificar" || ruta === "qr";
      const r = lectura ? await ACCIONES[ruta](cuerpo) : await enCola(() => ACCIONES[ruta](cuerpo));
      return responder(res, 200, r);
    }
    return responder(res, 404, { ok: false, error: { nombre: "RutaInexistente", mensaje: ruta } });
  } catch (e) {
    if (!(e instanceof ErrorUsuario)) console.error(e);
    return responder(res, e.status || 500, { ok: false, error: { nombre: e instanceof ErrorUsuario ? "DatosInvalidos" : "ErrorServidor", mensaje: e.shortMessage || e.message } });
  }
});

iniciar()
  .then(() => {
    servidor.listen(PUERTO, "127.0.0.1", () => {
      console.log(`\ne-TicketEvento · interfaz web sobre la red '${RED}' (chainId ${chainId})`);
      console.log(`  EventManager: ${C.dirEM}`);
      console.log(`  Organizador:  ${admin.address}`);
      console.log(`  Comprador 1:  ${cuentas.comprador1.address}`);
      console.log(`  Comprador 2:  ${cuentas.comprador2.address}`);
      rolesDe(admin.address).then((r) => {
        const faltan = Object.entries(r).filter(([, v]) => !v).map(([k]) => k);
        if (faltan.length) {
          console.log(`\n  ⚠ La billetera del .env (${admin.address}) NO tiene: ${faltan.join(", ")}.`);
          console.log(`    El contrato va a rechazar crear/cancelar/cerrar eventos, verificar identidades o validar ingresos.`);
          console.log(`    Corré "npm run chequear:${RED === "amoy" ? "amoy" : RED}" para ver cómo resolverlo.`);
        }
      });
      console.log(`\n  Abrí http://localhost:${PUERTO}  (organizador: /organizador.html · comprador: /comprador.html)\n`);
    });
  })
  .catch((e) => {
    console.error(`\nNo se pudo iniciar la interfaz: ${e.message}\n`);
    process.exit(1);
  });
