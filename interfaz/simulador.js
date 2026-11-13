/* e-TicketEvento · simulador de los contratos en el navegador.
 *
 * Solo se usa cuando la página se abre sin servidor (vista previa). Reproduce las reglas,
 * el orden de validación y los errores custom de EventManager, EntradaNFT y ReventaMarketplace.
 * Las firmas EIP-712 y los compromisos keccak256 son reales (ethers.js); la red y los pagos no.
 * El estado se guarda en localStorage para que organizador.html y comprador.html lo compartan.
 */
"use strict";
(function () {
  const E = window.ethers, U = E && E.utils;
  const CLAVE = "eticket-sim-v2";
  const CHAIN_ID = 80002;
  const ADDR = { EntradaNFT: "0x091e9EEb34181D89d5C3F3171D31036B688909cb", EventManager: "0x321375bd30Fd031E9F44EF6eCCC6aB23bb32B09a", ReventaMarketplace: "0x0423B4398a5d3Cc2CAfeb38Ada5039813afaaC75" };
  const MNEMONIC = "test test test test test test test test test test test junk"; // cuentas públicas de prueba de Hardhat
  const RESTRINGIDOS = new Set(["30111222"]);
  const TIPOS = ["Recital", "Espectaculo", "Futbol"];
  const GAS = { crearEvento: 268000, comprarEntrada: 236000, cancelarEvento: 31000, cerrarEvento: 58000, reclamarReembolso: 79000, retirarFondos: 34000, transferFrom: 27000, approve: 25000, validarIngreso: 71000, publicarReventa: 121000, retirarPublicacion: 64000, revenderEntrada: 214000, transfer: 21000 };
  const W = {};
  let S = null;

  const lc = (a) => String(a || "").toLowerCase();
  const B = (v) => BigInt(v || 0);
  const salt = (dni) => U.keccak256(U.defaultAbiCoder.encode(["string", "uint256"], ["tribuna-segura/salt/v1", dni]));
  const compromisoDe = (dni, s) => U.keccak256(U.defaultAbiCoder.encode(["uint256", "bytes32"], [dni, s]));
  const DOM_EM = { name: "EventManager", version: "1", chainId: CHAIN_ID, verifyingContract: ADDR.EventManager };
  const DOM_NFT = { name: "EntradaNFT", version: "1", chainId: CHAIN_ID, verifyingContract: ADDR.EntradaNFT };
  const T_VERIF = { VerificarIdentidad: [{ name: "compromiso", type: "bytes32" }, { name: "comprador", type: "address" }, { name: "idEvento", type: "uint256" }] };
  const T_ACCESO = { ValidarAcceso: [{ name: "tokenId", type: "uint256" }, { name: "timestamp", type: "uint64" }] };

  class Revert extends Error {
    constructor(nombre, contrato, sig) { super(nombre); this.nombre = nombre; this.contrato = contrato; this.selector = U.id(sig || nombre + "()").slice(0, 10); }
  }
  const rev = (n, c, sig) => { throw new Revert(n, c, sig); };

  function nuevoEstado() {
    const bal = {};
    for (const k of Object.keys(W)) bal[lc(W[k].address)] = (k.startsWith("comprador") ? U.parseEther("5") : U.parseEther("2")).toString();
    return { v: 2, offset: 0, bloque: 14820331, eventos: {}, entradas: {}, nextToken: 1, porPersona: {}, saldos: {}, bal, pubs: {}, nextPub: 1, tokenAPub: {}, txs: [], qrs: [] };
  }
  function cargar() {
    try { const s = JSON.parse(localStorage.getItem(CLAVE)); if (s && s.v === 2) { S = s; return; } } catch (_) {}
    if (!S) S = nuevoEstado();
  }
  function guardar() { try { localStorage.setItem(CLAVE, JSON.stringify(S)); } catch (_) {} }
  const ahora = () => Math.floor(Date.now() / 1000) + S.offset;
  const roles = (addr) => lc(addr) === lc(W.organizador.address);
  const credit = (addr, m) => { const k = lc(addr); S.saldos[k] = (B(S.saldos[k]) + B(m)).toString(); };
  const ev = (contrato, nombre, args) => ({ contrato, nombre, args });

  function estadoEfectivo(t) {
    if (t.estado === "Utilizada" || t.estado === "Reembolsada") return t.estado;
    if (S.eventos[t.idEvento]?.estado === "Finalizado") return "Vencida";
    return t.estado === "EnReventa" ? "En reventa" : "Asignada";
  }
  const recuperar = (dom, types, val, firma, c) => { try { return U.verifyTypedData(dom, types, val, firma); } catch (_) { rev("ECDSAInvalidSignature", c); } };
  const vendedorDe = (tokenId) => { const id = S.tokenAPub[tokenId]; return id ? S.pubs[id].vendedor : null; };
  const precioMax = (t) => (B(t.precioOriginal) * BigInt(10000 + S.eventos[t.idEvento].topeBps)) / 10000n;
  const cambiar = (t, estado) => { t.estado = estado; return ev("EntradaNFT", "EstadoEntradaCambiado", { tokenId: t.tokenId, nuevoEstado: ["Asignada", "EnReventa", "Utilizada", "Reembolsada"].indexOf(estado) }); };

  /* ---------------------------------------------------------------- contratos */
  const K = {
    crearEvento(m, p) {
      if (!roles(m.from)) rev("AccessControlUnauthorizedAccount", "EventManager", "AccessControlUnauthorizedAccount(address,bytes32)");
      if (S.eventos[p.idEvento]) rev("EventoYaExiste", "EventManager");
      if (p.fechaHora <= ahora()) rev("FechaInvalida", "EventManager");
      if (p.capacidad === 0) rev("CapacidadInvalida", "EventManager");
      if (B(p.precioBase) === 0n) rev("PrecioInvalido", "EventManager");
      if (!U.isAddress(p.artista) || !U.isAddress(p.plataforma) || /^0x0{40}$/i.test(p.artista) || /^0x0{40}$/i.test(p.plataforma)) rev("DireccionInvalida", "EventManager");
      if (p.regaliaBps + p.comisionBps >= 10000) rev("SumaPorcentajesInvalida", "EventManager");
      if (p.limitePorPersona === 0) rev("LimitePorPersonaInvalido", "EventManager");
      S.eventos[p.idEvento] = { ...p, organizador: m.from, vendidas: 0, estado: "Programado", custodia: "0" };
      return [ev("EventManager", "EventoCreado", { idEvento: p.idEvento, nombre: p.nombre, organizador: m.from, precioBase: p.precioBase, capacidad: p.capacidad })];
    },
    comprarEntrada(m, idEvento, compromiso, firma) {
      const e = S.eventos[idEvento];
      if (!e) rev("EventoInexistente", "EventManager");
      if (e.estado !== "Programado") rev("EventoNoProgramado", "EventManager");
      if (ahora() >= e.fechaHora) rev("FueraDeTermino", "EventManager");
      if (e.vendidas >= e.capacidad) rev("CapacidadAgotada", "EventManager");
      if (B(m.value) !== B(e.precioBase)) rev("MontoIncorrecto", "EventManager");
      if (!roles(recuperar(DOM_EM, T_VERIF, { compromiso, comprador: m.from, idEvento }, firma, "EventManager"))) rev("FirmaInvalida", "EventManager");
      const k = idEvento + ":" + compromiso;
      if ((S.porPersona[k] || 0) >= e.limitePorPersona) rev("LimitePorPersonaExcedido", "EventManager");
      S.porPersona[k] = (S.porPersona[k] || 0) + 1;
      e.vendidas += 1; e.custodia = (B(e.custodia) + B(m.value)).toString();
      const tokenId = S.nextToken++;
      S.entradas[tokenId] = { tokenId, idEvento: String(idEvento), precioOriginal: e.precioBase, compromiso, cantTransferencias: 0, estado: "Asignada", fechaEmision: ahora(), fechaValidacion: 0, titular: m.from, regalia: { a: e.artista, bps: e.regaliaBps } };
      return [ev("EntradaNFT", "Transfer", { from: "0x" + "0".repeat(40), to: m.from, tokenId }), ev("EntradaNFT", "EntradaEmitida", { idEvento, tokenId, titular: m.from, compromiso }), ev("EventManager", "EntradaComprada", { idEvento, tokenId, comprador: m.from, compromiso })];
    },
    cancelarEvento(m, id) {
      if (!roles(m.from)) rev("AccessControlUnauthorizedAccount", "EventManager", "AccessControlUnauthorizedAccount(address,bytes32)");
      const e = S.eventos[id];
      if (!e) rev("EventoInexistente", "EventManager");
      if (e.estado !== "Programado") rev("EventoNoProgramado", "EventManager");
      if (ahora() >= e.fechaHora) rev("FueraDeTermino", "EventManager");
      e.estado = "Cancelado";
      return [ev("EventManager", "EventoCancelado", { idEvento: id })];
    },
    cerrarEvento(m, id) {
      if (!roles(m.from)) rev("AccessControlUnauthorizedAccount", "EventManager", "AccessControlUnauthorizedAccount(address,bytes32)");
      const e = S.eventos[id];
      if (!e) rev("EventoInexistente", "EventManager");
      if (e.estado !== "Programado") rev("EventoNoProgramado", "EventManager");
      if (ahora() < e.fechaHora + 86400) rev("FueraDeTermino", "EventManager");
      e.estado = "Finalizado";
      const lib = e.custodia; e.custodia = "0"; credit(e.organizador, lib);
      return [ev("EventManager", "EventoCerrado", { idEvento: id, organizador: e.organizador, balanceLiberado: lib }), ev("EventManager", "SaldoAcreditado", { beneficiario: e.organizador, monto: lib })];
    },
    reclamarReembolso(m, tokenId) {
      const t = S.entradas[tokenId];
      if (!t) rev("TokenNoExiste", "EntradaNFT");
      const e = S.eventos[t.idEvento], out = [];
      if (e.estado !== "Cancelado") rev("EventoNoProgramado", "EventManager");
      if (t.estado === "Reembolsada") rev("YaReembolsada", "EventManager");
      if (t.estado === "Utilizada") rev("EntradaNoValidaParaIngreso", "EventManager");
      if (t.estado === "Asignada") { if (lc(m.from) !== lc(t.titular)) rev("NoEsTitular", "EventManager"); }
      else {
        const v = vendedorDe(tokenId);
        if (!v || lc(v) !== lc(m.from)) rev("NoEsTitular", "EventManager");
        const idp = S.tokenAPub[tokenId]; S.pubs[idp].estado = "Retirada"; delete S.tokenAPub[tokenId]; t.titular = v;
        out.push(ev("EntradaNFT", "Transfer", { from: ADDR.ReventaMarketplace, to: v, tokenId }));
      }
      out.push(cambiar(t, "Reembolsada"));
      e.custodia = (B(e.custodia) - B(t.precioOriginal)).toString(); credit(m.from, t.precioOriginal);
      return [...out, ev("EventManager", "ReembolsoReclamado", { tokenId, titular: m.from, monto: t.precioOriginal }), ev("EventManager", "SaldoAcreditado", { beneficiario: m.from, monto: t.precioOriginal })];
    },
    retirarFondos(m) {
      const k = lc(m.from), x = B(S.saldos[k]);
      if (x === 0n) rev("SinSaldo", "EventManager");
      S.saldos[k] = "0"; S.bal[k] = (B(S.bal[k]) + x).toString();
      return [ev("EventManager", "FondosRetirados", { beneficiario: m.from, monto: x.toString() })];
    },
    transferFrom() { rev("TransferenciaDirectaBloqueada", "EntradaNFT"); },
    approve() { rev("TransferenciaDirectaBloqueada", "EntradaNFT"); },
    validarIngreso(m, tokenId, compromiso, ts, firma) {
      if (!roles(m.from)) rev("AccessControlUnauthorizedAccount", "EntradaNFT", "AccessControlUnauthorizedAccount(address,bytes32)");
      const t = S.entradas[tokenId];
      if (!t) rev("TokenNoExiste", "EntradaNFT");
      if (t.estado !== "Asignada") rev("EntradaNoValidaParaIngreso", "EntradaNFT");
      if (S.eventos[t.idEvento].estado !== "Programado") rev("EventoNoProgramado", "EntradaNFT");
      if (t.compromiso !== compromiso) rev("CompromisoNoCoincide", "EntradaNFT");
      if (ahora() > ts + 60 || ts > ahora() + 5) rev("QRExpirado", "EntradaNFT");
      if (lc(recuperar(DOM_NFT, T_ACCESO, { tokenId, timestamp: ts }, firma, "EntradaNFT")) !== lc(t.titular)) rev("FirmaInvalida", "EntradaNFT");
      t.fechaValidacion = ahora();
      return [ev("EntradaNFT", "IngresoValidado", { tokenId, titular: t.titular, timestamp: ahora() }), cambiar(t, "Utilizada")];
    },
    publicarReventa(m, tokenId, precio) {
      const t = S.entradas[tokenId];
      if (!t) rev("ERC721NonexistentToken", "EntradaNFT", "ERC721NonexistentToken(uint256)");
      if (lc(t.titular) !== lc(m.from)) rev("NoEsTitular", "ReventaMarketplace");
      if (t.estado !== "Asignada") rev("EntradaNoValidaParaIngreso", "ReventaMarketplace");
      const e = S.eventos[t.idEvento];
      if (e.estado !== "Programado") rev("EventoNoProgramado", "ReventaMarketplace");
      if (ahora() >= e.fechaHora) rev("FueraDeTermino", "ReventaMarketplace");
      if (t.cantTransferencias >= e.maxTransferencias) rev("MaxTransferenciasAlcanzado", "ReventaMarketplace");
      if (B(precio) > precioMax(t)) rev("PrecioSuperaTope", "ReventaMarketplace");
      t.titular = ADDR.ReventaMarketplace;
      const id = S.nextPub++;
      S.pubs[id] = { id, tokenId, vendedor: m.from, precio: String(precio), fecha: ahora(), estado: "Activa" };
      S.tokenAPub[tokenId] = id;
      return [ev("EntradaNFT", "Transfer", { from: m.from, to: ADDR.ReventaMarketplace, tokenId }), cambiar(t, "EnReventa"), ev("ReventaMarketplace", "ReventaPublicada", { idPublicacion: id, idToken: tokenId, vendedor: m.from, precioReventa: String(precio) })];
    },
    retirarPublicacion(m, id) {
      const p = S.pubs[id];
      if (!p || p.estado !== "Activa") rev("PublicacionNoActiva", "ReventaMarketplace");
      if (lc(m.from) !== lc(p.vendedor)) rev("NoEsTitular", "ReventaMarketplace");
      p.estado = "Retirada"; delete S.tokenAPub[p.tokenId];
      const t = S.entradas[p.tokenId]; t.titular = p.vendedor;
      return [cambiar(t, "Asignada"), ev("EntradaNFT", "Transfer", { from: ADDR.ReventaMarketplace, to: p.vendedor, tokenId: p.tokenId }), ev("ReventaMarketplace", "PublicacionRetirada", { idPublicacion: id, idToken: p.tokenId })];
    },
    revenderEntrada(m, id, nuevo, firma) {
      const p = S.pubs[id];
      if (!p || p.estado !== "Activa") rev("PublicacionNoActiva", "ReventaMarketplace");
      if (B(m.value) !== B(p.precio)) rev("MontoIncorrecto", "ReventaMarketplace");
      const t = S.entradas[p.tokenId], e = S.eventos[t.idEvento];
      if (e.estado !== "Programado") rev("EventoNoProgramado", "ReventaMarketplace");
      if (ahora() >= e.fechaHora) rev("FueraDeTermino", "ReventaMarketplace");
      if (!roles(recuperar(DOM_EM, T_VERIF, { compromiso: nuevo, comprador: m.from, idEvento: t.idEvento }, firma, "EventManager"))) rev("FirmaInvalida", "EventManager");
      const kc = t.idEvento + ":" + nuevo, kv = t.idEvento + ":" + t.compromiso;
      if ((S.porPersona[kc] || 0) >= e.limitePorPersona) rev("LimitePorPersonaExcedido", "EventManager");
      if ((S.porPersona[kv] || 0) > 0) S.porPersona[kv] -= 1;
      S.porPersona[kc] = (S.porPersona[kc] || 0) + 1;
      const precio = B(p.precio), regalia = (precio * BigInt(t.regalia.bps)) / 10000n, comision = (precio * BigInt(e.comisionBps)) / 10000n, neto = precio - regalia - comision;
      const out = [];
      if (regalia > 0n) { credit(t.regalia.a, regalia); out.push(ev("EventManager", "SaldoAcreditado", { beneficiario: t.regalia.a, monto: regalia.toString() })); }
      if (comision > 0n) { credit(e.plataforma, comision); out.push(ev("EventManager", "SaldoAcreditado", { beneficiario: e.plataforma, monto: comision.toString() })); }
      if (neto > 0n) { credit(p.vendedor, neto); out.push(ev("EventManager", "SaldoAcreditado", { beneficiario: p.vendedor, monto: neto.toString() })); }
      p.estado = "Vendida"; delete S.tokenAPub[p.tokenId];
      t.compromiso = nuevo; t.cantTransferencias += 1; t.titular = m.from;
      return [...out, ev("EntradaNFT", "CompromisoActualizado", { tokenId: t.tokenId, nuevoCompromiso: nuevo, cantTransferencias: t.cantTransferencias }), cambiar(t, "Asignada"), ev("EntradaNFT", "Transfer", { from: ADDR.ReventaMarketplace, to: m.from, tokenId: t.tokenId }), ev("ReventaMarketplace", "EntradaRevendida", { idPublicacion: id, idToken: t.tokenId, vendedor: p.vendedor, comprador: m.from, precio: p.precio })];
    },
  };
  const CONTRATO_DE = { crearEvento: "EventManager", comprarEntrada: "EventManager", cancelarEvento: "EventManager", cerrarEvento: "EventManager", reclamarReembolso: "EventManager", retirarFondos: "EventManager", transferFrom: "EntradaNFT", approve: "EntradaNFT", validarIngreso: "EntradaNFT", publicarReventa: "ReventaMarketplace", retirarPublicacion: "ReventaMarketplace", revenderEntrada: "ReventaMarketplace" };

  function registrar({ actor, descripcion, metodo, valor = "0", eventos = [], error = null }) {
    S.bloque += 1 + Math.floor(Math.random() * 3);
    const gas = Math.round((GAS[metodo] || 50000) * (error ? 0.3 : 0.95 + Math.random() * 0.08));
    const tx = { id: (S.txs[0]?.id || 0) + 1, ts: Date.now(), actor, descripcion, contrato: CONTRATO_DE[metodo] || null, metodo, de: W[actor].address, hash: U.hexlify(U.randomBytes(32)), url: null, bloque: S.bloque, gas, costo: (BigInt(gas) * 30000000000n).toString(), valor: String(valor), estado: error ? "fallida" : "ok", error, eventos, simulada: true };
    S.txs.unshift(tx); S.txs = S.txs.slice(0, 150);
    return tx;
  }
  /** Igual que servidor.js: primero "simula" (sin efectos); si revierte, devuelve el error o, con forzar, registra la tx fallida. */
  function enviar({ actor, metodo, args, valor = "0", descripcion, forzar }) {
    const k = lc(W[actor].address);
    const copia = JSON.stringify(S);
    if (B(S.bal[k]) < B(valor)) return { ok: false, rechazadoAntes: true, noEnviable: true, error: { nombre: "SaldoInsuficiente", mensaje: "La billetera no tiene saldo suficiente." } };
    try {
      const eventos = K[metodo]({ from: W[actor].address, value: String(valor) }, ...args);
      S.bal[k] = (B(S.bal[k]) - B(valor)).toString();
      const tx = registrar({ actor, descripcion, metodo, valor, eventos });
      guardar();
      return { ok: true, tx };
    } catch (e) {
      if (!(e instanceof Revert)) throw e;
      S = JSON.parse(copia);
      const error = { nombre: e.nombre, selector: e.selector, contrato: e.contrato };
      if (!forzar) return { ok: false, rechazadoAntes: true, error };
      const tx = registrar({ actor, descripcion: descripcion + " (rechazada)", metodo, valor: "0", error });
      guardar();
      return { ok: false, tx, error };
    }
  }

  const nombre = (id) => W[id]?.nombre || id;
  function wei(v) { try { return U.parseEther(String(v).trim().replace(",", ".")).toString(); } catch (_) { throw { nombre: "DatosInvalidos", mensaje: "Monto inválido" }; } }

  const RUTAS = {
    "organizador/crear-evento"(b) {
      const p = { idEvento: String(b.idEvento), nombre: String(b.nombre || ""), tipo: TIPOS.includes(b.tipo) ? b.tipo : "Recital", fechaHora: Number(b.fechaHora), lugar: String(b.lugar || ""), artista: b.artista || W.artista.address, plataforma: b.plataforma || W.plataforma.address, precioBase: wei(b.precio), capacidad: Number(b.capacidad), topeBps: Number(b.topeBps), regaliaBps: Number(b.regaliaBps), comisionBps: Number(b.comisionBps), limitePorPersona: Number(b.limitePorPersona), maxTransferencias: Number(b.maxTransferencias), requiereAdmision: !!b.requiereAdmision };
      return enviar({ actor: "organizador", metodo: "crearEvento", args: [p], descripcion: `Crear evento #${p.idEvento} “${p.nombre}”`, forzar: b.forzar });
    },
    "oraculo/cancelar": (b) => enviar({ actor: "organizador", metodo: "cancelarEvento", args: [String(b.idEvento)], descripcion: `Oráculo cancela el evento #${b.idEvento}`, forzar: b.forzar }),
    "oraculo/cerrar": (b) => enviar({ actor: "organizador", metodo: "cerrarEvento", args: [String(b.idEvento)], descripcion: `Oráculo cierra el evento #${b.idEvento} y libera la custodia`, forzar: b.forzar }),
    "tiempo/adelantar"(b) { S.offset += Number(b.segundos) || 86400; S.bloque += Math.floor((Number(b.segundos) || 86400) / 2); guardar(); return { ok: true, ahora: ahora() }; },
    async "identidad/verificar"(b) {
      const dni = String(b.dni || "").trim();
      if (!/^[1-9]\d{6,7}$/.test(dni)) return { ok: false, error: { nombre: "DatosInvalidos", mensaje: "DNI inválido: 7 u 8 dígitos sin puntos" } };
      const e = S.eventos[String(b.idEvento)];
      if (!b.falsificar && e?.requiereAdmision && RESTRINGIDOS.has(dni)) return { ok: false, error: { nombre: "DerechoDeAdmision", mensaje: "Tribuna Segura no emite la firma: el DNI tiene una restricción de concurrencia vigente (Ley 23.184)." } };
      const s = salt(dni), compromiso = compromisoDe(dni, s);
      const firmante = b.falsificar ? W[b.cuenta].wallet : W.organizador.wallet;
      const firma = await firmante._signTypedData(DOM_EM, T_VERIF, { compromiso, comprador: W[b.cuenta].address, idEvento: String(b.idEvento) });
      const dir = U.verifyTypedData(DOM_EM, T_VERIF, { compromiso, comprador: W[b.cuenta].address, idEvento: String(b.idEvento) }, firma);
      return { ok: true, salt: s, compromiso, firma, firmante: dir, firmanteEsVerificador: roles(dir), yaTiene: S.porPersona[b.idEvento + ":" + compromiso] || 0 };
    },
    comprar(b) {
      const e = S.eventos[String(b.idEvento)];
      const precio = e ? B(e.precioBase) : 0n;
      const valor = (b.montoAlterado ? (precio * 9n) / 10n : precio).toString();
      const r = enviar({ actor: b.cuenta, metodo: "comprarEntrada", args: [String(b.idEvento), b.compromiso, b.firma], valor, descripcion: `${nombre(b.cuenta)} compra una entrada del evento #${b.idEvento}`, forzar: b.forzar });
      if (r.ok) r.tokenId = Number(r.tx.eventos.find((x) => x.nombre === "EntradaComprada").args.tokenId);
      return r;
    },
    "reventa/publicar"(b) { const precio = wei(b.precio); return enviar({ actor: b.cuenta, metodo: "publicarReventa", args: [Number(b.tokenId), precio], descripcion: `${nombre(b.cuenta)} publica la entrada #${b.tokenId} a ${U.formatEther(precio)} POL`, forzar: b.forzar }); },
    "reventa/retirar": (b) => enviar({ actor: b.cuenta, metodo: "retirarPublicacion", args: [Number(b.idPublicacion)], descripcion: `${nombre(b.cuenta)} retira la publicación #${b.idPublicacion}`, forzar: b.forzar }),
    "reventa/comprar"(b) {
      const p = S.pubs[b.idPublicacion]; const precio = p ? B(p.precio) : 0n;
      const valor = (b.montoAlterado ? (precio * 9n) / 10n : precio).toString();
      return enviar({ actor: b.cuenta, metodo: "revenderEntrada", args: [Number(b.idPublicacion), b.compromiso, b.firma], valor, descripcion: `${nombre(b.cuenta)} compra en reventa la entrada #${p?.tokenId}`, forzar: b.forzar });
    },
    transferir: (b) => enviar({ actor: b.cuenta, metodo: b.metodo === "approve" ? "approve" : "transferFrom", args: [], descripcion: `${nombre(b.cuenta)} intenta ${b.metodo === "approve" ? "autorizar a un tercero sobre" : "transferir directo"} la entrada #${b.tokenId}`, forzar: b.forzar }),
    async qr(b) {
      const t = S.entradas[b.tokenId]; const timestamp = Number(b.timestamp ?? ahora());
      const firma = await W[b.cuenta].wallet._signTypedData(DOM_NFT, T_ACCESO, { tokenId: Number(b.tokenId), timestamp });
      const qr = { tokenId: Number(b.tokenId), timestamp, compromiso: t.compromiso, firma };
      S.qrs.unshift({ ...qr, cuenta: b.cuenta, nombre: nombre(b.cuenta), generado: Date.now() }); S.qrs = S.qrs.slice(0, 20); guardar();
      return { ok: true, qr };
    },
    ingreso: (b) => enviar({ actor: "organizador", metodo: "validarIngreso", args: [Number(b.tokenId), b.compromiso, Number(b.timestamp), b.firma], descripcion: `Puerta: validación de la entrada #${b.tokenId}`, forzar: b.forzar }),
    reembolso: (b) => enviar({ actor: b.cuenta, metodo: "reclamarReembolso", args: [Number(b.tokenId)], descripcion: `${nombre(b.cuenta)} reclama el reembolso de la entrada #${b.tokenId}`, forzar: b.forzar }),
    retirar: (b) => enviar({ actor: b.cuenta, metodo: "retirarFondos", args: [], descripcion: `${nombre(b.cuenta)} retira su saldo (patrón pull)`, forzar: b.forzar }),
  };

  function sembrar() {
    const d = new Date((ahora() + 12 * 86400) * 1000); d.setHours(21, 0, 0, 0);
    RUTAS["organizador/crear-evento"]({ idEvento: "1", nombre: "Sierras Sónicas — Gira Aniversario", tipo: "Recital", fechaHora: Math.floor(d.getTime() / 1000), lugar: "Estadio Mario A. Kempes, Córdoba", precio: "0.01", capacidad: 120, topeBps: 2000, regaliaBps: 1000, comisionBps: 500, limitePorPersona: 2, maxTransferencias: 2, requiereAdmision: false });
  }

  window.Simulador = {
    CLAVE,
    async iniciar() {
      if (!E) throw new Error("No se pudo cargar ethers.js");
      const idx = { organizador: 0, artista: 2, plataforma: 3, comprador1: 7, comprador2: 8 };
      const nombres = { organizador: "Productora (admin)", artista: "Artista", plataforma: "Ticketera", comprador1: "Ana Ferreyra", comprador2: "Bruno Quiroga" };
      for (const [k, i] of Object.entries(idx)) { const w = E.Wallet.fromMnemonic(MNEMONIC, `m/44'/60'/0'/0/${i}`); W[k] = { wallet: w, address: w.address, nombre: nombres[k] }; }
      cargar();
      if (!Object.keys(S.eventos).length && !S.txs.length) { sembrar(); }
    },
    reiniciar() { S = nuevoEstado(); sembrar(); guardar(); },
    config() {
      return {
        modo: "simulada", red: "simulada", chainId: CHAIN_ID, esLocal: true, explorador: null, moneda: "POL", contratos: { ...ADDR },
        organizador: { address: W.organizador.address, roles: { ORGANIZADOR_ROLE: true, ORACULO_ROLE: true, VERIFICADOR_ROLE: true, VALIDADOR_ROLE: true } },
        artista: W.artista.address, plataforma: W.plataforma.address,
        compradores: [{ id: "comprador1", nombre: "Ana Ferreyra", dni: "38456123", address: W.comprador1.address }, { id: "comprador2", nombre: "Bruno Quiroga", dni: "41222333", address: W.comprador2.address }],
        precioSugerido: "0.01", ventanaQR: 60, margenCierre: 86400,
      };
    },
    estado() {
      cargar();
      const saldos = {};
      for (const w of Object.values(W)) saldos[lc(w.address)] = { balance: S.bal[lc(w.address)] || "0", pendiente: S.saldos[lc(w.address)] || "0" };
      return {
        ahora: ahora(), bloque: S.bloque,
        eventos: Object.values(S.eventos),
        entradas: Object.values(S.entradas).map((t) => ({ ...t, estadoEfectivo: estadoEfectivo(t), vendedor: vendedorDe(t.tokenId), idPublicacion: S.tokenAPub[t.tokenId] || null })),
        publicaciones: Object.values(S.pubs), saldos, qrs: S.qrs.slice(0, 12), transacciones: S.txs.slice(0, 80),
      };
    },
    async post(ruta, b) {
      cargar();
      try { return await RUTAS[ruta](b || {}); }
      catch (e) { if (e && e.nombre) return { ok: false, error: e }; throw e; }
    },
  };
})();
