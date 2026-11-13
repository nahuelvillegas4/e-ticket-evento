/* e-TicketEvento · código compartido por las dos interfaces.
 *
 * App.modo === "red": hay un servidor (interfaz/servidor.js) que firma y manda las transacciones
 *                      a la red configurada (Polygon Amoy, nodo local o red en memoria).
 * App.modo === "simulada": no hay servidor (por ejemplo, la vista previa publicada); simulador.js
 *                      reproduce los contratos en el navegador con las mismas reglas.
 */
"use strict";

/* ------------------------------------------------------------------ utilidades */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const short = (a) => (a ? String(a).slice(0, 6) + "…" + String(a).slice(-4) : "—");
const shortH = (h) => (h ? String(h).slice(0, 10) + "…" + String(h).slice(-6) : "—");
const big = (v) => { try { return BigInt(v ?? 0); } catch (_) { return 0n; } };
const lc = (a) => String(a || "").toLowerCase();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function formatEther(wei, dec = 4) {
  const v = big(wei), neg = v < 0n, a = neg ? -v : v;
  const ent = a / 10n ** 18n, frac = (a % 10n ** 18n).toString().padStart(18, "0").slice(0, dec).replace(/0+$/, "");
  return (neg ? "-" : "") + ent.toLocaleString("es-AR") + (frac ? "," + frac : "");
}
const monto = (wei, dec = 4) => `${formatEther(wei, dec)} ${App.cfg?.moneda || "POL"}`;
/** "0.15" | "0,15" → wei (BigInt) o null si el formato no es válido. */
function parseEther(txt) {
  const s = String(txt ?? "").trim().replace(",", ".");
  if (!/^\d+(\.\d{1,18})?$/.test(s)) return null;
  const [e, f = ""] = s.split(".");
  return BigInt(e) * 10n ** 18n + BigInt(f.padEnd(18, "0"));
}
const pct = (bps) => (Number(bps) / 100).toLocaleString("es-AR", { maximumFractionDigits: 2 }) + " %";
const fFecha = (ts) => new Date(ts * 1000).toLocaleString("es-AR", { weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fHora = (ts) => new Date(ts * 1000).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

const TIPO_LABEL = { Recital: "Recital", Espectaculo: "Espectáculo", Futbol: "Fútbol" };
const TIPO_COLOR = { Recital: ["#D9481F", "#7A1E52"], Espectaculo: ["#4136B8", "#1F7A8C"], Futbol: ["#1B7F4C", "#0E3B5C"] };
const ESTADO_ENTRADA = ["Asignada", "EnReventa", "Utilizada", "Reembolsada"];
const ACTOR_COLOR = { organizador: "#DE4F24", comprador1: "#E08A12", comprador2: "#157F59", artista: "#B5357A", plataforma: "#4A44C6" };

const ERR_MSG = {
  AccessControlUnauthorizedAccount: "La billetera no tiene el rol que exige la función.",
  EventoYaExiste: "Ya existe un evento con ese ID.",
  EventoInexistente: "El evento no existe.",
  FechaInvalida: "La fecha del evento tiene que ser posterior a la hora actual de la red.",
  CapacidadInvalida: "La capacidad tiene que ser mayor a cero.",
  PrecioInvalido: "El precio base tiene que ser mayor a cero.",
  DireccionInvalida: "Dirección de artista o plataforma inválida.",
  SumaPorcentajesInvalida: "Regalía + comisión tienen que sumar menos de 100 %.",
  LimitePorPersonaInvalido: "El límite por persona tiene que ser al menos 1.",
  EventoNoProgramado: "El evento no está en estado Programado.",
  CapacidadAgotada: "No quedan entradas: la capacidad está agotada.",
  MontoIncorrecto: "El monto enviado no coincide con el precio exacto.",
  LimitePorPersonaExcedido: "Esta persona (DNI) ya tiene el máximo de entradas permitido para el evento.",
  FirmaInvalida: "La firma no corresponde a quien debería firmar.",
  ECDSAInvalidSignature: "La firma está mal formada.",
  FueraDeTermino: "La operación está fuera del plazo permitido.",
  YaReembolsada: "Esta entrada ya fue reembolsada.",
  EntradaNoValidaParaIngreso: "La entrada no está en un estado válido para esta operación.",
  NoEsTitular: "Solo el titular puede hacer esta operación.",
  SinSaldo: "No hay saldo pendiente para retirar.",
  TransferenciaDirectaBloqueada: "Candado antifraude: las entradas no se pueden pasar de billetera a billetera. Solo se revenden en el marketplace oficial.",
  CompromisoNoCoincide: "La identidad del QR no coincide con la del titular.",
  QRExpirado: "El QR venció: tiene más de 60 segundos. Es una captura vieja.",
  TokenNoExiste: "La entrada no existe.",
  ERC721NonexistentToken: "La entrada no existe.",
  MaxTransferenciasAlcanzado: "La entrada ya se revendió la cantidad máxima de veces.",
  PrecioSuperaTope: "El precio supera el tope legal de reventa del evento.",
  PublicacionNoActiva: "La publicación ya no está activa.",
  DerechoDeAdmision: "Tribuna Segura rechazó la verificación por derecho de admisión.",
};

/* ------------------------------------------------------------------ App */
const App = {
  modo: null, cfg: null, est: null, oyentes: [], vistos: new Set(), _primera: true,
  async iniciar(onEstado) {
    this.oyentes.push(onEstado);
    try {
      const r = await fetch("api/config", { cache: "no-store" });
      const c = r.ok ? await r.json() : null;
      if (c && c.modo === "red") { this.modo = "red"; this.cfg = c; }
    } catch (_) { /* sin servidor */ }
    if (!this.modo) {
      if (!window.Simulador) throw new Error("No se encontró el servidor ni el simulador.");
      await Simulador.iniciar();
      this.modo = "simulada";
      this.cfg = Simulador.config();
      window.addEventListener("storage", (e) => { if (e.key === Simulador.CLAVE) this.refrescar(); });
    }
    await this.refrescar();
    setInterval(() => this.refrescar(), this.modo === "red" ? 5000 : 2500);
  },
  async refrescar() {
    try {
      this.est = this.modo === "red" ? await (await fetch("api/estado", { cache: "no-store" })).json() : Simulador.estado();
    } catch (e) { console.warn("No se pudo leer el estado", e); return; }
    for (const f of this.oyentes) f(this.est);
    for (const t of this.est.transacciones || []) this.vistos.add(t.id);
    this._primera = false;
  },
  async post(ruta, cuerpo) {
    if (this.modo === "simulada") { await wait(500 + Math.random() * 500); return Simulador.post(ruta, cuerpo); }
    const r = await fetch("api/" + ruta, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    return r.json();
  },
  nombreRed() {
    if (this.modo === "simulada") return "Simulación en el navegador";
    return { amoy: "Polygon Amoy", localhost: "Nodo local", hardhat: "Red en memoria" }[this.cfg.red] || this.cfg.red;
  },
  evento(id) { return (this.est?.eventos || []).find((e) => String(e.idEvento) === String(id)); },
  entrada(id) { return (this.est?.entradas || []).find((t) => Number(t.tokenId) === Number(id)); },
  saldo(addr) { return this.est?.saldos?.[lc(addr)] || { balance: "0", pendiente: "0" }; },
  quien(addr) {
    const a = lc(addr), c = this.cfg;
    if (!c || !addr) return "—";
    if (a === lc(c.organizador.address)) return "Organizador";
    if (a === lc(c.artista)) return "Artista";
    if (a === lc(c.plataforma)) return "Ticketera";
    if (a === lc(c.contratos.ReventaMarketplace)) return "Marketplace (custodia)";
    const comp = c.compradores.find((x) => lc(x.address) === a);
    return comp ? comp.nombre : short(addr);
  },
  linkDir(addr) { return this.cfg.explorador ? `<a href="${this.cfg.explorador}/address/${addr}" target="_blank" rel="noopener" class="mono">${short(addr)}</a>` : `<span class="mono">${short(addr)}</span>`; },
};

/* ------------------------------------------------------------------ piezas de UI */
function chipRed() {
  return `<span class="net ${App.modo === "simulada" ? "sim" : ""}" title="${App.modo === "simulada" ? "Sin servidor: los contratos se simulan en el navegador" : "Transacciones reales"}">${esc(App.nombreRed())} · ${App.cfg.chainId}</span>`;
}
function avatar(nombre, color) {
  const ini = String(nombre).split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
  return `<span class="avatar" style="background:${color}">${esc(ini)}</span>`;
}
function estadoPill(e) {
  const map = { Programado: "p-ok", Finalizado: "p-mute", Cancelado: "p-bad", Asignada: "p-ok", "En reventa": "p-warn", EnReventa: "p-warn", Utilizada: "p-chain", Reembolsada: "p-bad", Vencida: "p-mute", Activa: "p-warn", Vendida: "p-ok", Retirada: "p-mute" };
  return `<span class="pill ${map[e] || "p-mute"}">${esc(e === "EnReventa" ? "En reventa" : e)}</span>`;
}
function posterArt(e) {
  const [a, b] = TIPO_COLOR[e.tipo] || TIPO_COLOR.Recital;
  const d = new Date((Number(e.fechaHora) || Date.now() / 1000) * 1000);
  return `<div class="art" style="background:linear-gradient(125deg, ${a}, ${b})">
    <div class="row between"><span class="chip" style="background:rgba(255,255,255,.2);color:#fff">${TIPO_LABEL[e.tipo] || "Evento"}</span>${e.idEvento ? `<span class="mono" style="opacity:.85">#${esc(e.idEvento)}</span>` : ""}</div>
    <div class="date">${d.getDate()}<small>${d.toLocaleDateString("es-AR", { month: "long", year: "numeric" })} · ${d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} h</small></div></div>`;
}
function linkTx(tx) {
  if (!tx.hash) return "";
  return tx.url ? `<a href="${tx.url}" target="_blank" rel="noopener" class="mono">${shortH(tx.hash)} ↗</a>` : `<span class="mono">${shortH(tx.hash)}</span>`;
}
function fmtArg(v) {
  const s = String(v);
  if (/^0x[0-9a-fA-F]{40}$/.test(s)) return `${App.quien(s)} (${short(s)})`;
  if (/^0x[0-9a-fA-F]{64}$/.test(s)) return shortH(s);
  return s;
}
function txCard(tx) {
  const nuevo = !App._primera && !App.vistos.has(tx.id) ? "nuevo" : "";
  const color = ACTOR_COLOR[tx.actor] || "#615D78";
  const evs = tx.eventos?.length ? `<div class="evs">${tx.eventos.map((x) => `<span>${esc(x.nombre)}</span>`).join("")}</div>` : "";
  const detalle = tx.estado === "ok"
    ? (tx.eventos || []).map((x) => `${x.contrato || ""}.${x.nombre}(\n${Object.entries(x.args || {}).map(([k, v]) => `  ${k}: ${fmtArg(v)}`).join("\n")}\n)`).join("\n")
    : `revert ${tx.error?.nombre}()\nselector ${tx.error?.selector || "—"}`;
  return `<div class="tx ${nuevo}">
    <div class="line">${tx.estado === "ok" ? `<span class="pill p-ok">Confirmada</span>` : `<span class="pill p-bad">Fallida</span>`}${tx.bloque != null ? `<span class="num">bloque ${Number(tx.bloque).toLocaleString("es-AR")}</span>` : ""}${tx.gas ? `<span class="num">${Number(tx.gas).toLocaleString("es-AR")} gas</span>` : ""}</div>
    <div class="desc"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:6px"></span>${esc(tx.descripcion)}</div>
    ${tx.contrato ? `<div class="fnline">${esc(tx.contrato)}.${esc(tx.metodo)}()${big(tx.valor) > 0n ? ` <span class="muted">· ${monto(tx.valor)}</span>` : ""}</div>` : ""}
    ${tx.estado !== "ok" ? `<div class="revert">${esc(tx.error?.nombre)}() · ${esc(tx.error?.selector || "")}</div>` : evs}
    <div class="line">${linkTx(tx)}${detalle ? `<details style="flex-basis:100%"><summary>Detalle</summary><pre>${esc(detalle)}</pre></details>` : ""}</div>
  </div>`;
}
function feedHTML(filtro) {
  const txs = (App.est?.transacciones || []).filter(filtro || (() => true)).slice(0, 40);
  return txs.length ? txs.map(txCard).join("") : `<p class="muted small">Todavía no hay transacciones en esta sesión.</p>`;
}
function explicaHTML(x) {
  if (!x) return "";
  return `<div class="explica"><b style="font-size:14px">${esc(x.titulo)}</b>${x.fn ? `<div class="fn">${esc(x.fn)}</div>` : ""}<p>${x.texto}</p>${x.puntos?.length ? `<div class="label">${esc(x.rotulo || "El contrato verifica")}</div><ul>${x.puntos.map((p) => `<li>${p}</li>`).join("")}</ul>` : ""}${x.estado ? `<div class="label">Cambio de estado</div><p>${x.estado}</p>` : ""}</div>`;
}

/* Máquinas de estado (SVG) */
function smEvento(actual) {
  const cls = (n) => "node " + (actual === n ? "cur" : "");
  return `<svg class="maq" viewBox="0 0 320 84" role="img" aria-label="Estados del evento">
    <defs><marker id="ahE" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path class="ah" d="M0,0 L8,4 L0,8 z"/></marker></defs>
    <path class="edge" d="M112,42 C150,42 160,20 196,20" marker-end="url(#ahE)"/><path class="edge" d="M112,42 C150,42 160,64 196,64" marker-end="url(#ahE)"/>
    <text class="elbl" x="116" y="14">cerrarEvento</text><text class="elbl" x="118" y="80">cancelarEvento</text>
    <g class="${cls("Programado")}"><rect x="4" y="26" width="108" height="32" rx="8"/><text x="58" y="46" text-anchor="middle">Programado</text></g>
    <g class="${cls("Finalizado")}"><rect x="198" y="4" width="116" height="32" rx="8"/><text x="256" y="24" text-anchor="middle">Finalizado</text></g>
    <g class="${cls("Cancelado")}"><rect x="198" y="48" width="116" height="32" rx="8"/><text x="256" y="68" text-anchor="middle">Cancelado</text></g>
  </svg>`;
}
function estadosVistos(tokenId) {
  const s = new Set(["Asignada"]);
  for (const tx of App.est?.transacciones || []) for (const e of tx.eventos || []) {
    if (e.nombre === "EstadoEntradaCambiado" && Number(e.args.tokenId) === Number(tokenId)) { const n = ESTADO_ENTRADA[Number(e.args.nuevoEstado)] || e.args.nuevoEstado; s.add(n === "EnReventa" ? "En reventa" : n); }
  }
  return s;
}
function smEntrada(t) {
  const est = t?.estadoEfectivo, seen = t ? estadosVistos(t.tokenId) : new Set();
  const cls = (n) => "node " + (est === n ? "cur" : seen.has(n) ? "seen" : "");
  return `<svg class="maq" viewBox="0 0 320 150" role="img" aria-label="Estados de la entrada">
    <defs><marker id="ahT" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path class="ah" d="M0,0 L8,4 L0,8 z"/></marker></defs>
    <path class="edge" d="M142,20 L178,20" marker-end="url(#ahT)"/><path class="edge" d="M178,34 L142,34" marker-end="url(#ahT)"/>
    <path class="edge dash" d="M58,44 L54,102" marker-end="url(#ahT)"/><path class="edge" d="M104,44 L152,102" marker-end="url(#ahT)"/>
    <path class="edge" d="M128,44 L238,102" marker-end="url(#ahT)"/><path class="edge" d="M252,44 L264,102" marker-end="url(#ahT)"/>
    <text class="elbl" x="6" y="74">evento</text><text class="elbl" x="6" y="84">finalizado</text>
    <text class="elbl" x="94" y="80">validarIngreso</text><text class="elbl" x="196" y="72">reembolso</text>
    <g class="${cls("Asignada")}"><rect x="30" y="10" width="112" height="34" rx="8"/><text x="86" y="31" text-anchor="middle">Asignada</text></g>
    <g class="${cls("En reventa")}"><rect x="178" y="10" width="112" height="34" rx="8"/><text x="234" y="31" text-anchor="middle">En reventa</text></g>
    <g class="${cls("Vencida")}"><rect x="4" y="104" width="98" height="34" rx="8"/><text x="53" y="125" text-anchor="middle">Vencida</text></g>
    <g class="${cls("Utilizada")}"><rect x="111" y="104" width="98" height="34" rx="8"/><text x="160" y="125" text-anchor="middle">Utilizada</text></g>
    <g class="${cls("Reembolsada")}"><rect x="218" y="104" width="98" height="34" rx="8"/><text x="267" y="125" text-anchor="middle">Reembolsada</text></g>
  </svg>`;
}

/* ------------------------------------------------------------------ modales y toasts */
function abrirModal(html, top) {
  const raiz = $(top ? "#modalTop" : "#modal");
  const actual = raiz.firstElementChild;
  // Si el modal ya está abierto se reemplaza solo su contenido, sin repetir la animación de entrada.
  if (actual && actual.classList.contains("overlay")) { actual.innerHTML = html; actual.firstElementChild?.style.setProperty("animation", "none"); }
  else raiz.innerHTML = `<div class="overlay ${top ? "top" : ""}" role="dialog" aria-modal="true">${html}</div>`;
  return raiz;
}
function cerrarModal(top) { $(top ? "#modalTop" : "#modal").innerHTML = ""; }
function toast(msg, tipo) {
  const el = document.createElement("div");
  el.className = "toast " + (tipo || "");
  el.textContent = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), 4500);
}
document.addEventListener("click", (e) => {
  if (e.target.matches("[data-cerrar-top]")) cerrarModal(true);
});

function bloqueError(err, r) {
  const msg = err.mensaje || ERR_MSG[err.nombre] || "";
  return `<div class="box bad"><b>${r?.tx ? "La transacción se envió y falló en la red" : "El contrato rechazó la operación"}</b>
    <span class="mono" style="font-size:13px">${esc(err.contrato ? err.contrato + " → " : "")}${esc(err.nombre)}()${err.selector ? " · " + esc(err.selector) : ""}</span>
    ${msg ? `<span>${esc(msg)}</span>` : ""}
    <span class="muted small">${r?.tx ? "Quedó registrada como fallida: no movió fondos, solo consumió gas." : "No se gastó gas: la red simuló la transacción antes de enviarla y detectó el rechazo."}</span></div>`;
}
function bloqueTx(tx) {
  return `<div class="box ${tx.estado === "ok" ? "ok" : "bad"}">
    <div class="row between"><b>${tx.estado === "ok" ? "✓ Confirmada" : "✗ Fallida"} ${tx.bloque != null ? "en el bloque " + Number(tx.bloque).toLocaleString("es-AR") : ""}</b>${tx.url ? `<a class="btn sm" href="${tx.url}" target="_blank" rel="noopener">Ver en Polygonscan ↗</a>` : App.modo === "simulada" ? `<span class="chip">simulada</span>` : ""}</div>
    <div class="hash">${esc(tx.hash || "")}</div>
    <div class="kv small"><div><span>Función</span><b class="mono">${esc(tx.contrato)}.${esc(tx.metodo)}()</b></div>${tx.gas ? `<div><span>Gas usado</span><b>${Number(tx.gas).toLocaleString("es-AR")}${big(tx.costo) > 0n ? " · " + monto(tx.costo, 6) : ""}</b></div>` : ""}${big(tx.valor) > 0n ? `<div><span>Valor enviado</span><b>${monto(tx.valor)}</b></div>` : ""}</div>
    ${tx.eventos?.length ? `<div class="row" style="gap:4px">${tx.eventos.map((x) => `<span class="chip">${esc(x.nombre)}</span>`).join("")}</div>` : ""}
  </div>`;
}

/**
 * Ejecuta una acción que genera una transacción y muestra su progreso en un modal propio.
 * Resuelve con la respuesta del servidor/simulador cuando el usuario cierra el modal.
 */
function ejecutar({ titulo, ruta, cuerpo, fn, firmante, exito, siguiente }) {
  return new Promise((resolver) => {
    let resultado = null;
    const pasos = [`Firma ${firmante ? "de " + esc(firmante) : "con la billetera"}`, `Envío a ${esc(App.nombreRed())}`, "Confirmación en un bloque"];
    const pintarProgreso = (i) => abrirModal(`<div class="modal"><div class="modal-head"><div><span class="chip">Transacción</span><h2 style="margin-top:4px">${esc(titulo)}</h2><p class="mono muted small">${esc(fn || "")}</p></div></div>
      <div class="modal-body"><div class="spinner"></div><div class="progress">${pasos.map((p, j) => `<div class="${j < i ? "ok" : j === i ? "on" : ""}"><span>${j < i ? "✓" : j === i ? "●" : "○"}</span><span>${p}</span></div>`).join("")}</div>
      ${App.cfg.red === "amoy" ? `<p class="muted small" style="text-align:center">En Polygon Amoy la confirmación tarda unos segundos.</p>` : ""}</div></div>`, true);
    const cerrar = () => { cerrarModal(true); resolver(resultado); };
    const pintarResultado = (r) => {
      resultado = r;
      let body = "", foot = `<button class="btn" type="button" id="mxCerrar">Cerrar</button>`;
      if (r.ok) {
        body = (exito ? exito(r) : "") + bloqueTx(r.tx);
        if (siguiente) foot += `<button class="btn primary" type="button" id="mxSig">${esc(siguiente)}</button>`;
      } else {
        body = bloqueError(r.error || { nombre: "Error" }, r) + (r.tx ? bloqueTx(r.tx) : "");
        const puedeForzar = r.rechazadoAntes && !r.noEnviable && r.error?.nombre !== "DatosInvalidos" && r.error?.nombre !== "DerechoDeAdmision";
        if (puedeForzar) foot = `<button class="btn" type="button" id="mxCerrar">Cerrar</button><button class="btn danger" type="button" id="mxForzar" title="Envía la transacción con gas fijo para que quede registrada como fallida">Enviarla igual${App.cfg.explorador ? " y verla en Polygonscan" : ""}</button>`;
        if (r.noEnviable) body += `<p class="muted small">El nodo local no acepta transacciones que revierten. En Polygon Amoy se puede enviar igual para verla fallida en el explorador.</p>`;
      }
      abrirModal(`<div class="modal wide"><div class="modal-head"><div><span class="chip">${r.ok ? "Resultado" : "Rechazo"}</span><h2 style="margin-top:4px">${esc(titulo)}</h2></div></div><div class="modal-body">${body}</div><div class="modal-foot">${foot}</div></div>`, true);
      $("#mxCerrar").onclick = cerrar;
      if ($("#mxSig")) $("#mxSig").onclick = () => { resultado.siguiente = true; cerrar(); };
      if ($("#mxForzar")) $("#mxForzar").onclick = () => correr(true);
    };
    const correr = async (forzar) => {
      let i = 0; pintarProgreso(0);
      const t = setInterval(() => { i = Math.min(i + 1, 2); pintarProgreso(i); }, App.modo === "red" && App.cfg.red === "amoy" ? 1600 : 350);
      let r;
      try { r = await App.post(ruta, { ...cuerpo, forzar: !!forzar }); } catch (e) { r = { ok: false, error: { nombre: "SinConexion", mensaje: "No se pudo contactar al servidor de la interfaz." } }; }
      clearInterval(t);
      await App.refrescar();
      pintarResultado(r);
    };
    correr(false);
  });
}

/** Encabezado común (marca, red, toggle del riel). */
function montarRiel() {
  let ver = true;
  try { ver = localStorage.getItem("eticket-riel") !== "0"; } catch (_) {}
  document.body.classList.toggle("sin-rail", !ver);
  const sw = $("#toggleRiel");
  if (sw) {
    sw.checked = ver;
    sw.onchange = () => { document.body.classList.toggle("sin-rail", !sw.checked); try { localStorage.setItem("eticket-riel", sw.checked ? "1" : "0"); } catch (_) {} };
  }
}
