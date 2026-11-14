/**
 * Utilidades para mostrar en la demo el error REAL que devuelve el contrato,
 * su selector hexadecimal EVM (4 bytes) y, cuando la transacción se envía con
 * gasLimit explícito, el enlace a la transacción revertida en el explorador.
 */

const RESET = "\x1b[0m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const GRAY = "\x1b[90m";

function datosDelError(error) {
  const candidatos = [
    error?.data,
    error?.error?.data,
    error?.info?.error?.data,
    error?.error?.error?.data,
  ];
  for (const c of candidatos) {
    if (typeof c === "string" && c.startsWith("0x")) return c;
    if (c && typeof c === "object" && typeof c.data === "string" && c.data.startsWith("0x")) {
      return c.data;
    }
  }
  return null;
}

function hashDelError(error, tx) {
  return (
    tx?.hash ??
    error?.receipt?.hash ??
    error?.transactionHash ??
    error?.error?.transactionHash ??
    error?.info?.error?.data?.txHash ??
    error?.error?.data?.txHash ??
    null
  );
}

/**
 * Devuelve { nombre, selector } del custom error (por ejemplo "PrecioSuperaTope" y "0x4f7614ee")
 * probando con el ABI de cada contrato recibido.
 */
function decodificarError(error, ...contratos) {
  let nombre = null;
  let selector = null;

  if (error?.revert?.name) {
    nombre = error.revert.name;
  }

  const data = datosDelError(error);
  if (data && typeof data === "string") {
    selector = data.slice(0, 10);
    for (const c of contratos) {
      try {
        const parsed = c.interface.parseError(data);
        if (parsed) {
          nombre = parsed.name;
          selector = parsed.selector || selector;
          break;
        }
      } catch (_) {
        /* probar con el siguiente ABI */
      }
    }
    if (!nombre) {
      nombre = `desconocido (${selector})`;
    }
  }

  if (!nombre) {
    // Algunos nodos (por ejemplo `npx hardhat node`) devuelven el nombre solo dentro del mensaje
    const texto = `${error?.message || ""} ${error?.error?.message || ""} ${error?.info?.error?.message || ""}`;
    const m = texto.match(/custom error '([A-Za-z0-9_]+)\(/);
    if (m) {
      nombre = m[1];
    } else {
      nombre = error?.shortMessage || error?.message || String(error);
    }
  }

  // Si obtuvimos el nombre pero el nodo no adjuntó los bytes de data, buscamos el selector en el ABI
  if (nombre && !selector) {
    for (const c of contratos) {
      try {
        const frag = c?.interface?.getError(nombre);
        if (frag?.selector) {
          selector = frag.selector;
          break;
        }
      } catch (_) {
        /* no está en este contrato */
      }
    }
  }

  return { nombre, selector };
}

function nombreError(error, ...contratos) {
  return decodificarError(error, ...contratos).nombre;
}

/**
 * Ejecuta una operación que DEBE ser rechazada y muestra qué error devolvió la red.
 * Si la operación se invoca con `{ gasLimit }`, la transacción llega a minarse con
 * estado Reverted (status = 0), permitiendo imprimir el bloque y el link a Polygonscan.
 *
 *  - Verde: se rechazó con el error esperado.
 *  - Amarillo: se rechazó, pero por otro motivo (revisar).
 *  - Rojo: NO se rechazó (falla de la regla de negocio).
 */
async function esperarRechazo(operacion, esperado, contratos, opciones = {}) {
  const provider = contratos?.[0]?.runner?.provider ?? null;
  const bloqueAntes = provider ? await provider.getBlockNumber().catch(() => null) : null;
  let tx = null;

  try {
    tx = await operacion();
    if (tx?.wait) await tx.wait();
    console.log(`${RED}✘ NO SE RECHAZÓ: se esperaba '${esperado}'.${RESET}`);
    return false;
  } catch (error) {
    let recibo = error?.receipt ?? null;
    let hash = hashDelError(error, tx);

    // En nodos JSON-RPC locales (hardhat node), si se minó un bloque con la tx fallida, recuperar su hash
    if (!hash && provider && bloqueAntes !== null) {
      const bloqueDespues = await provider.getBlockNumber().catch(() => null);
      if (bloqueDespues !== null && bloqueDespues > bloqueAntes) {
        const bloque = await provider.getBlock(bloqueDespues).catch(() => null);
        if (bloque?.transactions?.length) {
          hash = bloque.transactions[bloque.transactions.length - 1];
        }
      }
    }

    if (!recibo && hash && provider) {
      recibo = await provider.getTransactionReceipt(hash).catch(() => null);
    }

    // En redes públicas (Amoy), tx.wait() lanza CALL_EXCEPTION con receipt (status=0) pero sin los bytes
    // del custom error. Simulamos con eth_call para extraer el selector exacto devuelto por la EVM.
    let errorParaDecodificar = error;
    if (!datosDelError(error) && tx?.provider) {
      try {
        await tx.provider.call({
          to: tx.to,
          from: tx.from,
          data: tx.data,
          value: tx.value ?? 0n,
        });
      } catch (callError) {
        errorParaDecodificar = callError;
      }
    }

    const { nombre, selector } = decodificarError(errorParaDecodificar, ...contratos);
    const infoSelector = selector ? ` ${CYAN}[selector EVM: ${selector}]${RESET}` : "";
    const enlace = hash
      ? opciones.explorador
        ? `${opciones.explorador}/tx/${hash}`
        : `tx ${hash}`
      : null;
    const infoRed = enlace
      ? ` ${GRAY}(${recibo?.blockNumber != null ? `bloque ${recibo.blockNumber} · ` : ""}${enlace} · status: Reverted)${RESET}`
      : "";

    if (recibo && opciones.transacciones) {
      opciones.transacciones.push({
        descripcion: opciones.descripcion || `Ataque rechazado (${nombre})`,
        hash: hash || recibo.hash,
        gas: recibo.gasUsed ?? 0n,
        precio: recibo.gasPrice ?? 0n,
        revertida: true,
      });
    }

    if (nombre === esperado) {
      console.log(`${GREEN}✔ Rechazado por el contrato con: '${nombre}()'${RESET}${infoSelector}${infoRed}`);
      return true;
    }
    console.log(
      `${YELLOW}⚠ Rechazado, pero con otro error: '${nombre}' (se esperaba '${esperado}')${RESET}${infoSelector}${infoRed}`
    );
    return false;
  }
}

module.exports = { nombreError, decodificarError, esperarRechazo };
