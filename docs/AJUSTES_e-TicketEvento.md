# e-TicketEvento: ajustes para la entrega y el Demo Day

**Proyecto:** e-TicketEvento · Desarrollo con tecnologías Blockchain · UTN FRC · 5K3A
**Fecha de la revisión:** 10/11/2026

Este documento lista lo que hay que modificar en el sistema para cumplir con lo pedido: que los contratos corran en una blockchain real y que la demo muestre el modelo completo del TP. El cambio más importante es el 1, el despliegue en Polygon Amoy.

Todos los cambios ya están aplicados y probados en el paquete `e-ticket-evento-ajustado.zip` que acompaña a este documento. Si preferís aplicarlos a mano, el código completo de cada archivo está en el Anexo.

## Resumen de cambios

| N.º | Cambio | Prioridad | Archivos | Estado en el paquete |
|---|---|---|---|---|
| 1 | Desplegar y operar en Polygon Amoy (red pública de prueba) | **Alta** | `hardhat.config.js`, `.env.example`, `scripts/deploy-red.js`, `scripts/demo-red.js`, `package.json`, `.gitignore` | Aplicado |
| 2 | Entregar el proyecto sin `node_modules` | Alta | Entrega | Instrucción |
| 3 | Corregir el paso de despliegue en el informe y el README | Media | `docs/INFORME_DESARROLLO_5K3A.md`, `README.md` | Aplicado |
| 4 | Que la demo muestre el error real del contrato | Media | `scripts/errores.js`, `scripts/demo.js` | Aplicado |
| 5 | Mostrar en la demo los estados Reembolsada y Vencida | Media | `scripts/demo-red.js` | Aplicado |
| 6 | Devolver al vendedor el NFT reembolsado que estaba en reventa | Baja | `contracts/ReventaMarketplace.sol`, `test/05_CicloFinal.test.js` | Aplicado |
| 7 | Mejoras opcionales del contrato | Baja | `EntradaNFT.sol`, `EventManager.sol` | Solo descriptas |
| 8 | Confirmar la fecha del Demo Day (lunes 16/11/2026) | Alta | `README.md`, `docs/INFORME_DESARROLLO_5K3A.md`, `docs/GUIA_PRESENTACION_DEMO.md` | Confirmado y aplicado |

---

## 1. Despliegue en Polygon Amoy

### 1.1 Por qué hace falta

Hoy el proyecto solo corre en la red local de Hardhat (`chainId 31337`). Esa red es una EVM real, pero vive en la computadora y se borra al terminar. El informe y el README dicen que la solución es para Polygon PoS, y la consigna pide trabajar en una blockchain de verdad.

La forma de cumplirlo sin gastar dinero es la red de prueba de Polygon PoS, **Amoy**. Es pública, usa la misma tecnología que la red principal y cualquiera puede ver las transacciones en un explorador.

Además, el `scripts/deploy.js` original no sirve para Amoy. Usa 7 cuentas distintas (`getSigners()`), y en Amoy vas a tener una sola clave, así que fallaría al leer `validador.address`.

### 1.2 Qué se necesita

| Elemento | Detalle |
|---|---|
| Billetera nueva | Crear una cuenta en MetaMask **solo para este TP**. Nunca usar una billetera con fondos reales. |
| Red Amoy | Nombre: Polygon Amoy · Chain ID: **80002** · RPC: `https://polygon-amoy.drpc.org` · Moneda: **POL** · Explorador: `https://amoy.polygonscan.com` ([Polygon, s.f.](https://docs.polygon.technology/pos/reference/rpc-endpoints/)) |
| POL de prueba | Conseguir al menos **0,5 POL** en un faucet (ver 1.5). No tienen valor real. |
| Clave de API (opcional) | Una cuenta gratuita en Etherscan da una clave que sirve para Polygonscan (API V2). Solo hace falta para publicar el código fuente (paso 7). |

Faucets de Amoy ([Datawallet, s.f.](https://www.datawallet.com/es/crypto/how-to-get-polygon-testnet-tokens)):

| Faucet | Notas |
|---|---|
| [Polygon (oficial)](https://faucet.polygon.technology/) | Monto chico, pide verificar con GitHub o X |
| [QuickNode](https://faucet.quicknode.com/polygon/amoy) | Un pedido cada 12 horas |
| [Chainlink](https://faucets.chain.link/polygon-amoy) | Pide conectar la billetera |
| [Alchemy](https://www.alchemy.com/faucets/polygon-amoy) | 0,5 POL por día con cuenta, pero exige saldo en Ethereum mainnet |

Si un faucet da poco, cada integrante del grupo puede pedir y transferir a la billetera del TP.

### 1.3 Cambios en el código

1. **Instalar `dotenv`**, para leer la clave privada desde un archivo `.env` que no se sube:
   ```bash
   npm install --save-dev dotenv@16
   ```
2. **`hardhat.config.js`:** agregar las redes `localhost` y `amoy` y la configuración de verificación. El `hardhat-verify` que ya trae el toolbox (v2.1.3) soporta Etherscan API V2 y reconoce Amoy (chainId 80002).
3. **`.env.example` (nuevo):** plantilla de variables. Cada uno la copia como `.env` y pone su clave.
4. **`.gitignore`:** ya ignoraba `.env`. Se agrega `deployments/localhost.json`, que cambia cada vez que se reinicia el nodo local. `deployments/amoy.json` **sí** se entrega, porque es la evidencia del despliegue.
5. **`scripts/deploy-red.js` (nuevo):** despliega los tres contratos con **una sola billetera**.
   - Esa billetera queda como administradora y con los roles de Organizador, Oráculo, Verificador (Tribuna Segura) y Validador de acceso.
   - Cada rol se puede pasar a otra dirección con variables del `.env`.
   - Guarda las direcciones, los hashes y el gas en `deployments/<red>.json`.
   - Imprime los enlaces al explorador y los comandos de verificación.
6. **`scripts/demo-red.js` (nuevo):** la demo completa sobre una red persistente (localhost o Amoy), reutilizando los contratos ya desplegados.
   - En Amoy crea dos compradores de prueba derivados de la clave del `.env`. Son siempre las mismas direcciones, así que no se pierde saldo entre corridas.
   - Los fondea con un monto chico y al final les devuelve el sobrante a la billetera principal.
   - Cada transacción se imprime con su enlace a `amoy.polygonscan.com`.
7. **`package.json`:** scripts nuevos `nodo`, `deploy:local`, `demo:local`, `deploy:amoy` y `demo:amoy`.

### 1.4 Paso a paso en Amoy

```bash
# 1. Dependencias limpias
npm install

# 2. Variables de entorno
cp .env.example .env             # en PowerShell: Copy-Item .env.example .env
#    Editar .env y pegar en PRIVATE_KEY la clave privada de la billetera del TP
#    (MetaMask → Detalles de la cuenta → Mostrar clave privada)

# 3. Compilar y probar
npm run compile
npm test

# 4. Desplegar en Amoy (se hace una sola vez)
npm run deploy:amoy
#    → crea deployments/amoy.json y muestra los enlaces a Polygonscan

# 5. Ejecutar la demo sobre los contratos desplegados
npm run demo:amoy

# 6. (Opcional) Publicar el código fuente en Polygonscan
#    Completar ETHERSCAN_API_KEY en .env y usar los comandos que imprimió el deploy:
npx hardhat verify --network amoy <dir_EntradaNFT>
npx hardhat verify --network amoy <dir_EventManager> <dir_EntradaNFT>
npx hardhat verify --network amoy <dir_ReventaMarketplace> <dir_EntradaNFT> <dir_EventManager>
```

### 1.5 Costos estimados

Gas medido en la red local con la billetera única:

| Operación | Gas | Costo aproximado a 30 gwei |
|---|---|---|
| Despliegue completo (3 contratos + 9 configuraciones) | 6.500.000 | 0,20 POL |
| Una corrida de `demo:amoy` (15 transacciones) | 1.850.000 | 0,06 POL |
| Fondeo temporal de los dos compradores | – | 0,10 POL (vuelve casi todo al final) |

El precio del gas en Amoy varía, así que tomá 30 gwei como referencia. Con **0,5 POL** alcanza para desplegar y correr la demo unas cuatro veces. En Amoy la entrada cuesta 0,001 POL; se puede cambiar con `PRECIO_ENTRADA` en el `.env`.

### 1.6 Cómo se ven los cambios en Amoy

- **Transacciones:** cada línea verde de la demo trae su enlace. En Polygonscan se ve el bloque, la hora, quién la envió, el valor y el gas.
- **Eventos del contrato:** en la pestaña *Logs* de cada transacción aparecen `EntradaComprada`, `ReventaPublicada`, `EntradaRevendida`, `IngresoValidado`, etc.
- **Estado de una entrada:** si verificaron el código (paso 6), en la pestaña *Contract → Read Contract* de EntradaNFT pueden consultar en vivo `ownerOf(tokenId)` y `estadoEfectivo(tokenId)`.
- **Historial:** la página del contrato EventManager muestra todas las operaciones en orden.
- **Ataques rechazados:** **no aparecen en el explorador**. La red los rechaza al simular la transacción, antes de enviarla, así que no llegan a un bloque ni consumen gas. Se muestran en la consola de la demo con el error real del contrato.
- **Cierre y entrada vencida:** no se puede hacer en vivo en Amoy, porque `cerrarEvento` exige que pase la fecha del evento más 24 horas y en una red pública no se puede adelantar el reloj. Se muestran en el nodo local (punto 5) o con el test CP-25.

### 1.7 Cuidados con la clave privada

- El `.env` **nunca** se sube al repositorio, se entrega ni se comparte por chat. Revisen que el zip final no lo incluya.
- Usen una billetera creada solo para el TP. Si la clave se filtra, se pierden solo POL de prueba.

### 1.8 Qué actualizar en el informe

- **Sección 3 (tecnología):** indicar que los contratos están desplegados en Polygon Amoy, con las tres direcciones y los enlaces a Polygonscan que quedan en `deployments/amoy.json`.
- **Sección 8, limitación 6:** aclarar que los roles los opera una única billetera en la red de prueba y que en producción serían cuentas separadas o una multisig.

---

## 2. Entregar el proyecto sin `node_modules`

El zip actual trae `node_modules` (unos 480 MB) y al descomprimirlo se pierden los permisos de ejecución: Hardhat falla con `sh: 1: hardhat: Permission denied`.

**Qué hacer:**

- Borrar `node_modules` y correr `npm install` en cada computadora.
- No incluir en la entrega `node_modules`, `cache`, `artifacts`, `coverage`, `coverage.json` ni `.env`. El `.gitignore` ya los excluye, así que si suben el repo a GitHub no viajan.

---

## 3. Corregir el paso de despliegue en el informe y el README

En `docs/INFORME_DESARROLLO_5K3A.md`, sección 6.2, el paso 3 dice:

```bash
npx hardhat run scripts/deploy.js
```

Sin `--network`, ese comando despliega en una red en memoria que se borra al terminar, así que no deja nada desplegado. Reemplazarlo por:

```bash
# Nodo local persistente (con npx hardhat node corriendo en otra terminal)
npm run deploy:local

# Polygon Amoy
npm run deploy:amoy
```

El README del paquete ya tiene las secciones nuevas: nodo local con dos terminales, despliegue en Amoy y la estructura de carpetas con los scripts nuevos.

---

## 4. Que la demo muestre el error real del contrato

En `scripts/demo.js`, cada ataque estaba en un `try/catch` que imprimía un nombre de error escrito a mano. Hoy coincide con el error real (lo verifiqué decodificando los códigos), pero ante cualquier otra falla igual diría "BLOQUEO EXITOSO". Además, el intento de reuso de la entrada no imprimía nada si no se rechazaba.

**Cambio:** nuevo `scripts/errores.js` con `esperarRechazo(operación, errorEsperado, contratos)`. Decodifica el error devuelto por la red con el ABI de los tres contratos y muestra:

- **verde:** se rechazó con el error esperado;
- **amarillo:** se rechazó, pero por otro motivo;
- **rojo:** no se rechazó.

`demo.js` y `demo-red.js` lo usan en todos los ataques.

Si el docente pregunta cómo se sabe qué regla frenó un ataque, sirve esta tabla de códigos (los primeros 4 bytes del error que muestra el nodo):

| Código | Error | Regla que lo produce |
|---|---|---|
| `0x9f255784` | `TransferenciaDirectaBloqueada` | Candado P2P en `_update` |
| `0x4f7614ee` | `PrecioSuperaTope` | Tope de reventa |
| `0xe2517d3f` | `AccessControlUnauthorizedAccount` | Falta de rol |
| `0xfb491662` | `EntradaNoValidaParaIngreso` | Entrada ya usada o no asignada |

---

## 5. Mostrar en la demo los estados Reembolsada y Vencida

El DTE del TP tiene tres estados finales, pero la demo original solo mostraba Utilizada. Reembolsada y Vencida estaban probadas únicamente en los tests CP-21 a CP-25.

`scripts/demo-red.js` agrega:

- **Paso 7, cancelación:** se crea un partido, el Comprador 1 compra, el oráculo cancela, el comprador reclama y retira el reembolso, y la entrada queda **Reembolsada**. Un segundo reclamo se rechaza con `YaReembolsada`.
- **Paso 8, cierre (solo nodo local):** el Comprador 1 compra una entrada que no usa. Cerrar antes de tiempo se rechaza con `FueraDeTermino`. Después se adelanta el reloj 8 días, el oráculo cierra el evento y libera la custodia, y la entrada sin usar queda **Vencida**.

Con esto, la demo recorre el DTE completo: Asignada → En reventa → Asignada → Utilizada, más Reembolsada y Vencida.

---

## 6. Devolver al vendedor el NFT reembolsado que estaba en reventa

Si el evento se cancelaba mientras la entrada estaba publicada, el reembolso se acreditaba bien al vendedor, pero el NFT quedaba para siempre en poder del contrato `ReventaMarketplace`.

**Cambio en `ReventaMarketplace.cerrarPorReembolso`:** después de cerrar la publicación, se devuelve el NFT al vendedor.

```solidity
if (idPub != 0) {
    publicaciones[idPub].estado = EstadoPublicacion.Retirada;
    delete tokenAPublicacionActiva[idToken];
    // Devuelve el NFT (ya reembolsado) al vendedor para que no quede en custodia del marketplace
    entradaNFT.transferenciaRegulada(address(this), publicaciones[idPub].vendedor, idToken);
}
```

**Test agregado en CP-23** (`test/05_CicloFinal.test.js`):

```js
// El NFT reembolsado vuelve al vendedor y no queda en custodia del marketplace
expect(await entradaNFT.ownerOf(tokenId)).to.equal(comprador1.address);
```

Siguen pasando los 34 tests, y la cobertura queda igual (99,41 % de sentencias, 98,91 % de ramas, 100 % de funciones).

---

## 7. Mejoras opcionales del contrato (no aplicadas)

Estas dos quedan a criterio del grupo. Ambas ya figuran como limitaciones en el informe, así que no son obligatorias.

1. **Validar el ingreso solo el día del evento.** Hoy `validarIngreso` se puede ejecutar cualquier día antes del cierre.
   - Para limitarlo, EntradaNFT tendría que leer `fechaHora` desde EventManager (ampliar la interfaz `IEventManagerView` con `obtenerEvento`) y exigir, por ejemplo, `block.timestamp >= fechaHora - 12 horas`.
   - Habría que ajustar los tests CP-16 a CP-19 y los de borde para adelantar el reloj antes de validar.
2. **Usar `requiereAdmision`.** Hoy se guarda pero no cambia nada.
   - Una opción es exigir la firma del verificador solo cuando `requiereAdmision` es verdadero (fútbol) y aceptar compras sin verificación en recitales.
   - Esto cambia la regla del límite por DNI en esos eventos, así que conviene discutirlo antes de tocarlo.

---

## 8. Confirmar la fecha del Demo Day

Confirmado: la presentación es el **lunes 16/11/2026**. Ya quedó unificada en `README.md`, `docs/INFORME_DESARROLLO_5K3A.md`, `docs/GUIA_PRESENTACION_DEMO.md` y `docs/guia_estudio/GUIA_ESTUDIO.html`.

---

## 9. Guion de la demo con los cambios

### El día anterior

- [ ] En la computadora de la presentación: `npm install`, `npm run compile` y `npm test` (34 en verde). Así el compilador queda descargado y no dependen de internet para la parte local.
- [ ] Tener en la billetera del TP al menos 0,2 POL para correr `demo:amoy` una vez más.
- [ ] Correr `npm run demo:amoy` y dejar abiertas en el navegador la página del contrato EventManager en Polygonscan y una transacción de compra, por si la conexión del aula falla.
- [ ] Grabar la pantalla con una corrida completa como plan B.

### Opción A: nodo local (recomendada para el bloque de demo en vivo)

| Terminal | Comando | Qué mostrar |
|---|---|---|
| 1 | `npm run nodo` | La blockchain local: cada transacción con función, cuenta, valor, gas y bloque. Los ataques aparecen como `reverted with ... custom error (0x...)`. |
| 2 | `npm run deploy:local` y después `npm run demo:local` | La demo completa, con el error real de cada ataque y los estados Reembolsada y Vencida. |

Ventajas: es instantáneo, no depende de internet y muestra el DTE completo, incluido el cierre con entrada vencida.

### Opción B: Polygon Amoy (para mostrar que corre en una red pública)

- Ejecutar `npm run demo:amoy`. Tarda más, porque cada transacción espera unos segundos a entrar en un bloque.
- Abrir en el navegador uno de los enlaces impresos y mostrar la transacción, sus *Logs* y el historial del contrato.

**Combinación sugerida:** la demo en vivo con la opción A y, al final, 30 segundos en Polygonscan mostrando los contratos desplegados en Amoy (opción B, con las páginas ya abiertas).

### Si preguntan algo técnico

- **Tests:** `npm test` (34 en verde) y `coverage/index.html` después de `npm run coverage`.
- **Códigos de error:** la tabla del punto 4.
- **Límite por DNI:** depende de que el verificador asigne un único `salt` por DNI y evento (limitación 1 del informe).

---

## 10. Qué se verificó

| Prueba | Resultado |
|---|---|
| `npm test` con los cambios | 34 de 34 en verde |
| `npm run coverage` | 99,41 % sentencias · 98,91 % ramas · 100 % funciones · 99,53 % líneas |
| `npm run demo` (con `errores.js`) | Todos los ataques rechazados con el error esperado |
| `deploy-red.js` + `demo-red.js` con **una sola billetera** sobre un nodo local, configurado para simular Amoy | Despliegue, fondeo, 15 transacciones, cancelación con reembolso y devolución del sobrante, sin errores |
| `deploy:local` + `demo:local` con varias cuentas | Incluye el cierre con adelanto de reloj y la entrada en estado Vencida |

**Sin probar:** el despliegue real en Amoy. Desde el entorno donde hice la revisión no hay acceso a la red de Polygon, así que el paso 1.4 hay que correrlo por primera vez desde su computadora. La configuración de red y verificación sigue la documentación de Polygon y de Etherscan.

---

## Fuentes

- Polygon. (s.f.). *RPC endpoints*. https://docs.polygon.technology/pos/reference/rpc-endpoints/
- Datawallet. (s.f.). *Cómo obtener tokens testnet de Polygon: faucets de Amoy y límites*. https://www.datawallet.com/es/crypto/how-to-get-polygon-testnet-tokens
- Etherscan. (s.f.). *V2 migration*. https://docs.etherscan.io/v2-migration
- Etherscan. (s.f.). *Verify with Hardhat*. https://docs.etherscan.io/etherscan-v2/contract-verification/verify-with-hardhat

---

## Anexo: código completo de los archivos nuevos y modificados

### A.1 `hardhat.config.js` (modificado)

```js
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { PRIVATE_KEY, AMOY_RPC_URL, ETHERSCAN_API_KEY } = process.env;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      evmVersion: "cancun",
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    // Red en memoria: se crea y se borra en cada comando (tests y demo rápida)
    hardhat: {
      chainId: 31337,
    },
    // Nodo local persistente: `npx hardhat node` en otra terminal
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    // Red de prueba pública de Polygon PoS
    amoy: {
      url: AMOY_RPC_URL || "https://polygon-amoy.drpc.org",
      chainId: 80002,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  // Verificación en amoy.polygonscan.com (Etherscan API V2: una sola clave para todas las redes)
  etherscan: {
    apiKey: ETHERSCAN_API_KEY || "",
  },
  sourcify: {
    enabled: false,
  },
};
```

### A.2 `.env.example` (nuevo)

```bash
# Copiar este archivo como .env y completar. El .env NUNCA se sube ni se comparte.

# Clave privada de una billetera NUEVA, creada solo para este TP (nunca una con fondos reales)
PRIVATE_KEY=0xTU_CLAVE_PRIVADA

# RPC de Polygon Amoy (opcional: si se deja vacío se usa el público de dRPC)
AMOY_RPC_URL=https://polygon-amoy.drpc.org

# Clave de API de Etherscan (V2, sirve también para amoy.polygonscan.com). Solo para verificar contratos.
ETHERSCAN_API_KEY=

# Monto en POL que el script le transfiere a cada comprador de prueba (precio de entrada + gas)
FONDEO_COMPRADOR=0.05
```

### A.3 `scripts/errores.js` (nuevo)

```js
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
```

### A.4 `scripts/deploy-red.js` (nuevo)

```js
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
```

### A.5 `scripts/demo-red.js` (nuevo)

```js
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
```

### A.6 `package.json` (modificado)

```json
{
  "name": "e-ticket-evento",
  "version": "1.0.0",
  "description": "Smart Contracts para e-TicketEvento - UTN FRC 5K3A",
  "main": "index.js",
  "scripts": {
    "compile": "hardhat compile",
    "test": "hardhat test",
    "coverage": "hardhat coverage",
    "demo": "hardhat run scripts/demo.js",
    "nodo": "hardhat node",
    "deploy:local": "hardhat run scripts/deploy-red.js --network localhost",
    "demo:local": "hardhat run scripts/demo-red.js --network localhost",
    "deploy:amoy": "hardhat run scripts/deploy-red.js --network amoy",
    "demo:amoy": "hardhat run scripts/demo-red.js --network amoy"
  },
  "author": "Chas Díaz, Tombesi, Villegas, Rottino",
  "license": "MIT",
  "devDependencies": {
    "@nomicfoundation/hardhat-toolbox": "^5.0.0",
    "dotenv": "^16.6.1",
    "hardhat": "^2.22.18"
  },
  "dependencies": {
    "@openzeppelin/contracts": "^5.1.0"
  }
}
```

### A.7 `scripts/demo.js` (modificado)

Se agrega `const { esperarRechazo } = require("./errores");` después de importar `./utils`. Cada bloque `try { ... } catch { console.log("✔ BLOQUEO EXITOSO ...") }` se reemplaza por:

```js
await esperarRechazo(
  () => marketplace.connect(comprador1).publicarReventa(1, precioAbusivo),
  "PrecioSuperaTope",
  [entradaNFT, eventManager, marketplace]
);
```

Lo mismo para `TransferenciaDirectaBloqueada`, `AccessControlUnauthorizedAccount` (dos veces) y `EntradaNoValidaParaIngreso`.

### A.8 `.gitignore` (línea agregada)

```
deployments/localhost.json
```
