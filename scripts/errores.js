/**
 * Utilidades para mostrar en la demo el error REAL que devuelve el contrato,
 * en lugar de un texto escrito a mano.
 */

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";

function datosDelError(error) {
  return (
    error?.data ??
    error?.error?.data ??
    error?.info?.error?.data ??
    error?.error?.error?.data ??
    null
  );
}

/**
 * Devuelve el nombre del custom error (por ejemplo "PrecioSuperaTope") probando
 * con el ABI de cada contrato recibido. Si no lo reconoce, devuelve el mensaje.
 */
function nombreError(error, ...contratos) {
  if (error?.revert?.name) return error.revert.name;
  const data = datosDelError(error);
  if (data && typeof data === "string") {
    for (const c of contratos) {
      try {
        const parsed = c.interface.parseError(data);
        if (parsed) return parsed.name;
      } catch (_) {
        /* probar con el siguiente ABI */
      }
    }
    return `desconocido (${data.slice(0, 10)})`;
  }
  // Algunos nodos (por ejemplo `npx hardhat node`) devuelven el nombre solo dentro del mensaje
  const texto = `${error?.message || ""} ${error?.error?.message || ""}`;
  const m = texto.match(/custom error '([A-Za-z0-9_]+)\(/);
  if (m) return m[1];
  return error?.shortMessage || error?.message || String(error);
}

/**
 * Ejecuta una operación que DEBE ser rechazada y muestra qué error devolvió la red.
 *  - Verde: se rechazó con el error esperado.
 *  - Amarillo: se rechazó, pero por otro motivo (revisar).
 *  - Rojo: NO se rechazó (falla de la regla de negocio).
 */
async function esperarRechazo(operacion, esperado, contratos) {
  try {
    const tx = await operacion();
    if (tx?.wait) await tx.wait();
    console.log(`${RED}✘ NO SE RECHAZÓ: se esperaba '${esperado}'.${RESET}`);
    return false;
  } catch (error) {
    const nombre = nombreError(error, ...contratos);
    if (nombre === esperado) {
      console.log(`${GREEN}✔ Rechazado por el contrato con: '${nombre}()'${RESET}`);
      return true;
    }
    console.log(`${YELLOW}⚠ Rechazado, pero con otro error: '${nombre}' (se esperaba '${esperado}')${RESET}`);
    return false;
  }
}

module.exports = { nombreError, esperarRechazo };
