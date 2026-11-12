# Informe Técnico de Desarrollo y Validación de Smart Contracts
## Caso de Estudio: e-TicketEvento — Entradas Tokenizadas para Eventos Masivos
### Asignatura: Desarrollo con Tecnologías Blockchain — UTN FRC (Comisión 5K3A)

---

## 1. Carátula y Datos Institucionales

* **Proyecto:** `e-TicketEvento` — Emisión, comercialización, reventa y control de acceso de entradas tokenizadas para eventos masivos.
* **Institución:** Universidad Tecnológica Nacional – Facultad Regional Córdoba (UTN-FRC).
* **Carrera:** Ingeniería en Sistemas de Información.
* **Asignatura:** Desarrollo con Tecnologías Blockchain.
* **Comisión:** 5K3A.
* **Docentes:**
  * Dr. Oscar Carlos Medina
  * Esp. Rubén Aníbal Romero
* **Fecha de Presentación (Demo Day):** Lunes 16 de noviembre de 2026.
* **Integrantes del Equipo:**
  * **95346** – Chas Díaz, Lucas Martín
  * **95345** – Tombesi, Gino Paolo
  * **94837** – Villegas, Angel Nahuel
  * **94543** – Rottino, Juan Ignacio

---

## 2. Breve Descripción del Proceso Trabajado en la Actividad 4

El presente trabajo implementa un prototipo funcional del contrato inteligente modelado en la **Actividad 4: "Modelado de Contrato Inteligente"** para el proceso de **emisión, comercialización, reventa y control de acceso de entradas para eventos masivos** (recitales, espectáculos y partidos de fútbol), abarcando desde que el organizador registra el evento y habilita la venta hasta que el espectador ingresa al recinto o el evento se liquida/reembolsa.

### 2.1 Problemáticas del Proceso Tradicional
1. **Entradas falsas o duplicadas:** Los códigos QR estáticos enviados por mail o PDF son fácilmente fotografiados o reenviados; múltiples personas reciben la misma entrada y solo la primera en llegar al molinete logra ingresar.
2. **Reventa especulativa y desregulada:** Bots y revendedores acaparan entradas apenas abre la venta y las ofrecen en mercados informales a precios abusivos, infringiendo normas como la Ley 5174 (CABA) y la Ley Nacional 23.184 en espectáculos deportivos.
3. **El organizador y el artista no participan de la reventa:** Todo el margen del mercado secundario queda en manos de intermediarios informales.
4. **Reembolsos lentos y burocráticos:** Ante la suspensión o cancelación de un evento, la devolución del dinero depende de la ticketera centralizada y suele demorar semanas.
5. **Control de admisión aislado:** En el fútbol, el control con el programa *Tribuna Segura* mediante DNI no está vinculado criptográficamente con la titularidad de la entrada.

### 2.2 Activos y Participantes del Modelo
* **Activo principal (lógico):** La **entrada al evento** (derecho de acceso a un lugar y fecha determinados), tokenizada como un **NFT (ERC-721)** con titularidad verificable, estado dentro del ciclo de vida y reglas de transferencia embebidas en el propio activo.
* **Activo secundario:** El **dinero en custodia (*escrow*)**, correspondiente a la recaudación de la venta primaria que permanece retenida en el contrato hasta que un oráculo independiente confirma la realización o cancelación del espectáculo.
* **Participantes:** Organizador / Productor / Club, Plataforma de Ticketing, Comprador / Titular Primario, Comprador Secundario, Artista / Club (beneficiario de regalías), Validador de Acceso en Puerta, Oráculo de Eventos y Autoridad Verificadora de Identidad (*Tribuna Segura* / KYC).

---

## 3. Tecnología Blockchain y Lenguaje Elegidos: Justificación

Se mantiene y materializa la elección tecnológica planteada en la Actividad 4: **Red Polygon PoS (compatible con EVM)** y lenguaje **Solidity (`0.8.24`)**, utilizando **Hardhat** como entorno de desarrollo, pruebas y despliegue (tanto en nodo local como en la red pública de prueba **Polygon Amoy**, `chainId: 80002` con explorador en `amoy.polygonscan.com`) y **OpenZeppelin Contracts v5.1.0** como librería base auditada.

### 3.1 Fundamentación según los Criterios de la Consigna

| Criterio de Análisis | Fundamentación Técnica y de Negocio |
|---|---|
| **1. Características del proceso y del activo representado** | Cada entrada es un activo único y no intercambiable (no fungible) cuyo ciclo de vida requiere trazabilidad individual desde su emisión hasta su uso en puerta o reembolso. Una red compatible con la **EVM (Polygon PoS)** permite representar cada entrada bajo el estándar **ERC-721** e integrar regalías automáticas en el mercado secundario mediante **ERC-2981**. Además, el alto volumen transaccional de un evento masivo (decenas de miles de compras, reventas y validaciones) exige los bajos costos de gas y los tiempos de bloque rápidos (~2 segundos) de Polygon PoS frente a Ethereum Mainnet. |
| **2. Participantes y sus permisos** | En el proceso interactúan múltiples actores que no confían ciegamente entre sí (organizadores, ticketeras, artistas, público, controladores de acceso y organismos de control). Una blockchain **pública** evita que una ticketera dominante monopolice la base de datos, mientras que a nivel de contrato inteligente se aplica un control de acceso granular basado en roles (`AccessControl` de OpenZeppelin) que restringe qué participante puede crear eventos (`ORGANIZADOR_ROLE`), certificar identidades (`VERIFICADOR_ROLE`), validar ingresos en molinete (`VALIDADOR_ROLE`) o informar el cierre/cancelación del evento (`ORACULO_ROLE`). |
| **3. Necesidades de privacidad y acceso a la información** | La titularidad y autenticidad de cada entrada deben ser públicamente verificables sin pedir permiso a un intermediario, pero los datos personales del asistente están protegidos por la **Ley 25.326 de Protección de Datos Personales**. Como lo escrito en una red pública es inmutable, el DNI nunca se guarda en claro ni como hash simple: se almacena únicamente un **compromiso criptográfico seudonimizado** `keccak256(abi.encode(DNI, salt))` con un `salt` secreto off-chain, acompañado de una firma tipificada **EIP-712** emitida por el verificador autorizado. |
| **4. Adecuación de la tecnología y del lenguaje al caso de uso** | **Solidity `0.8.24`** es el lenguaje nativo y maduro de la EVM: provee protección nativa contra *overflow/underflow*, tipos de datos estructurados (`struct`, `mapping`, `enum`), errores personalizados (*custom errors*) eficientes en gas y soporte directo para primitivas criptográficas (`keccak256`, `ECDSA.recover`, `EIP-712`). Asimismo, cuenta con precedentes reales probados en la industria del ticketing sobre Polygon (como *Ticketmaster* y *OPEN Ticketing Ecosystem*). |

---

## 4. Correspondencia entre el Modelo Original y la Implementación

Tal como se definió en la Sección 3.2.6 de la Actividad 4, el sistema se estructura en **tres contratos inteligentes coordinados**:

```
┌──────────────────────────────────────────────────────────────────┐
│                          PARTICIPANTES                           │
│   Organizador · Artista · Ticketera · Tribuna Segura · Público   │
└─────────────────────────────────┬────────────────────────────────┘
                                  │
    ┌─────────────────────────────┼─────────────────────────────┐
    ▼                             ▼                             ▼
┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│  EventManager.sol    │  │   EntradaNFT.sol     │  │ReventaMarketplace.sol│
│                      │  │                      │  │                      │
│ • Parámetros evento  │  │ • ERC-721 + ERC-2981 │  │ • Custodia temporal  │
│ • Escrow fondos      │  │ • Candado _update    │  │ • Control tope precio│
│ • Límites por DNI    │  │ • QR dinámico EIP-712│  │ • Split automático:  │
│ • Retiros Pull (CEI) │  │ • Lazy Minting       │  │   Artista/Ticket/Vend│
└──────────────────────┘  └──────────────────────┘  └──────────────────────┘
```

### 4.1 Correspondencia de Contratos y Atributos

| Contrato en Actividad 4 | Contrato Implementado | Atributos del Modelo (Act. 4) | Implementación en Solidity |
|---|---|---|---|
| **Contrato Evento** (Tabla 4) | `contracts/EventManager.sol` | `idEvento`, `nombre`, `tipoEvento`, `fechaHora`, `lugar`, `organizador`, `capacidad`, `topeReventa`, `regaliaArtista`, `limitePorPersona`, `requiereAdmision`, `estadoEvento` | Implementados en `struct Evento` + `mapping(uint256 => Evento) eventos`. Se suman `artista`, `plataformaTicketing`, `precioBase`, `vendidas`, `comisionPlataformaBps`, `maxTransferencias` y `balanceCustodia` (escrow). |
| **Contrato Entrada (NFT ERC-721)** (Tabla 5) | `contracts/EntradaNFT.sol` | `idToken`, `idEvento`, `precioOriginal`, `titular`, `hashIdentidad`, `cantTransferencias`, `estado`, `fechaEmision`, `fechaValidacion` | Implementados en `struct Entrada` + `mapping(uint256 => Entrada) entradas`. `titular` se obtiene de `ownerOf(tokenId)` (estándar ERC-721) y `hashIdentidad` es `compromisoIdentidad` (`bytes32`). |
| **Contrato Reventa** (Tabla 6) | `contracts/ReventaMarketplace.sol` | `idPublicacion`, `idToken`, `vendedor`, `precioReventa`, `comprador`, `comisionPlataforma`, `fechaPublicacion`, `estadoPublicacion` | Implementados en `struct Publicacion` + `mapping(uint256 => Publicacion) publicaciones`. El `comprador` queda registrado en `ownerOf(idToken)` y en el evento `EntradaRevendida`; la comisión se lee del evento (`comisionPlataformaBps`). |

### 4.2 Correspondencia de Transacciones (Tabla 7 de la Actividad 4)

| N.º | Transacción (Act. 4) | Actor | Implementación en los Contratos (`.sol`) |
|:---:|---|---|---|
| **0** | `crearEvento` | Organizador (`ORGANIZADOR_ROLE`) | `EventManager.crearEvento(...)`: valida parámetros y registra el evento en estado `Programado`. |
| **1** | `emitirEntrada` | Organizador / Sistema | Integrado en `EventManager.comprarEntrada(...)` mediante *Lazy Minting* invocando a `EntradaNFT.mint(...)` (`OPERADOR_ROLE`). |
| **2** | `comprarEntrada` | Comprador primario | `EventManager.comprarEntrada(idEvento, compromiso, firmaVerificador)`: verifica firma EIP-712 de identidad, controla cupo del evento y límite por persona, retiene el pago en `balanceCustodia` y acuña el NFT. |
| **3** | `publicarReventa` | Titular de la entrada | `ReventaMarketplace.publicarReventa(idToken, precio)`: verifica titularidad, estado `Asignada`, vigencia del evento, límite de transferencias y tope máximo de precio; pone el NFT en custodia del Marketplace (`EnReventa`). |
| **4** | `retirarPublicacion` | Titular vendedor | `ReventaMarketplace.retirarPublicacion(idPublicacion)`: cancela la publicación activa, devuelve el NFT al vendedor y restituye el estado `Asignada`. |
| **5** | `revenderEntrada` | Comprador secundario | `ReventaMarketplace.revenderEntrada(idPublicacion, nuevoCompromiso, firmaVerificador)`: verifica identidad y cupo del nuevo comprador, calcula y acredita el *split* (regalía ERC-2981 al artista, comisión a la plataforma y neto al vendedor), incrementa `cantTransferencias`, actualiza el compromiso y transfiere el NFT. |
| **6** | `validarIngreso` | Validador de acceso (`VALIDADOR_ROLE`) | `EntradaNFT.validarIngreso(tokenId, compromisoPresentado, timestamp, firmaTitular)`: verifica estado `Asignada`, evento `Programado`, coincidencia del compromiso y firma EIP-712 efímera del titular (ventana de 60 s); marca `Utilizada`. |
| **7** | `cancelarEvento` | Oráculo (`ORACULO_ROLE`) + Titulares | `EventManager.cancelarEvento(idEvento)` pasa el evento a `Cancelado`; luego cada titular ejecuta `EventManager.reclamarReembolso(tokenId)` y `retirarFondos()` (patrón *Pull*). Si la entrada estaba publicada en reventa, `ReventaMarketplace.cerrarPorReembolso` cierra la publicación y restituye el NFT al vendedor. |
| **8** | `cerrarEvento` | Oráculo (`ORACULO_ROLE`) + Beneficiarios | `EventManager.cerrarEvento(idEvento)` (tras `fechaHora + 1 day`) pasa el evento a `Finalizado`, libera `balanceCustodia` al organizador y deja las entradas no usadas en estado efectivo `Vencida`. |

### 4.3 Correspondencia del Diagrama de Transición de Estados (DTE)

| Estado en el DTE (Act. 4) | Representación en el Código | ¿Estado Final? |
|---|---|:---:|
| **`Emitida`** | **Estado lógico:** cupo disponible para acuñar en el evento (`evento.vendidas < evento.capacidad`). | No |
| **`Asignada`** | **Estado almacenado:** `EstadoEntrada.Asignada` en `EntradaNFT.sol`. | No |
| **`En reventa`** | **Estado almacenado:** `EstadoEntrada.EnReventa` (en custodia de `ReventaMarketplace`). | No |
| **`Utilizada`** | **Estado almacenado:** `EstadoEntrada.Utilizada` tras `validarIngreso`. | **Sí** |
| **`Reembolsada`** | **Estado almacenado:** `EstadoEntrada.Reembolsada` tras `reclamarReembolso`. | **Sí** |
| **`Vencida`** | **Estado lógico derivado:** reportado por `EntradaNFT.estadoEfectivo(tokenId)` cuando `evento.estado == Finalizado` y la entrada no fue utilizada ni reembolsada. | **Sí** |

---

## 5. Ajustes Técnicos Realizados y sus Motivos

Al traducir el modelo conceptual de la Actividad 4 a código productivo sobre la EVM, se aplicaron los siguientes ajustes de ingeniería de software y seguridad:

1. **Acuñación Perezosa (*Lazy Minting*) en lugar de `emitirEntrada` masivo:**
   * *Motivo:* Pre-acuñar 50.000 NFTs al crear el evento excedería el límite de gas por bloque (*Block Gas Limit*) y obligaría al organizador a financiar miles de transacciones previas. Con *Lazy Minting*, cada NFT se acuña en el instante de la compra (`comprarEntrada`), pagando solo por las entradas efectivamente vendidas.
2. **Eliminación de bucles mediante Estados Lógicos (`Emitida` y `Vencida`) y Reembolsos *Pull*:**
   * *Motivo:* Recorrer un arreglo de miles de entradas dentro de `cancelarEvento` o `cerrarEvento` provocaría una denegación de servicio (DoS por agotamiento de gas) o que una sola billetera receptora maliciosa bloquee toda la transacción. Por ello, `cancelarEvento` y `cerrarEvento` operan en tiempo constante $O(1)$ cambiando solo el estado del evento; el estado `Vencida` se deduce sin costo de gas en `estadoEfectivo(tokenId)`, y cada comprador reclama su reembolso individualmente (`reclamarReembolso` + `retirarFondos`).
3. **Patrón *Pull* + *Checks-Effects-Interactions* (CEI) + `ReentrancyGuard`:**
   * *Motivo:* En lugar de enviar ETH directamente durante la compra en reventa o el cierre del evento, los fondos se acreditan en `saldosPendientes[beneficiario]` y se retiran mediante `retirarFondos()`, que pone el saldo en cero antes de ejecutar `.call{value: monto}("")` y cuenta con el modificador `nonReentrant`.
4. **Compromiso Criptográfico con *Salt* y Firma EIP-712 del Verificador:**
   * *Motivo:* Un hash simple `keccak256(DNI)` es vulnerable a un ataque de diccionario o fuerza bruta porque el espacio de DNIs argentinos es pequeño (~$10^8$ combinaciones), y además sin firma cualquiera podría enviar un hash inventado. Se reemplazó por `keccak256(abi.encode(DNI, salt))` acompañado de una firma tipificada EIP-712 de una cuenta con `VERIFICADOR_ROLE`.
5. ** Aplicación del Límite por Persona también en el Mercado Secundario:**
   * *Motivo:* Para evitar que un acaparador eluda el cupo máximo comprando entradas adicionales a través del Marketplace de reventa, `registrarTransferenciaIdentidad` descuenta el cupo al vendedor y verifica/incrementa el cupo del comprador secundario.
6. **QR Dinámico mediante Firma EIP-712 con Ventana Temporal (`VENTANA_QR = 60 s`):**
   * *Motivo:* Materializa en código el concepto de QR dinámico del modelo: `validarIngreso` recupera criptográficamente el firmante de `ValidarAcceso(tokenId, timestamp)`, verifica que coincida con `ownerOf(tokenId)` y exige que el `timestamp` no tenga más de 60 segundos de antigüedad.
7. **Separación Estricta entre `ORGANIZADOR_ROLE` y `ORACULO_ROLE` y Margen Temporal:**
   * *Motivo:* Si el organizador pudiera ejecutar `cerrarEvento` por sí mismo, podría liberar los fondos en custodia antes de realizar el evento. Se delegó exclusivamente en `ORACULO_ROLE` y se añadió `MARGEN_CIERRE = 1 days` posterior a `fechaHora`.
8. **Aritmética en *Basis Points* (`10000 = 100%`) y Eliminación del Estado `EnCurso`:**
   * *Motivo:* Solidity no posee tipos de punto flotante; el uso de *basis points* (`topeReventaBps`, `regaliaArtistaBps`, `comisionPlataformaBps`) permite expresar porcentajes con dos decimales de precisión sin errores de truncamiento. Se eliminó el estado de evento `EnCurso` porque ninguna transacción lo disparaba ni modificaba reglas del contrato.

---

## 6. Requisitos del Entorno y Pasos para Desplegar, Ejecutar y Probar

### 6.1 Requisitos Previos
* **Sistema Operativo:** Windows, Linux o macOS.
* **Node.js:** v18.0.0 o superior (verificado en v22.14.0).
* **npm:** v9.0.0 o superior.
* **Dependencias incluidas en `package.json`:**
  * `hardhat` (`^2.22.18`)
  * `@nomicfoundation/hardhat-toolbox` (`^5.0.0`)
  * `@openzeppelin/contracts` (`^5.1.0`)
  * `dotenv` (`^16.6.1`)
* **Configuración del compilador y redes (`hardhat.config.js`):** Solidity `0.8.24`, `evmVersion: "cancun"`, `viaIR: true`, optimizador activado (`runs: 200`); redes configuradas: `hardhat` (en memoria, `chainId: 31337`), `localhost` (nodo local persistente en `http://127.0.0.1:8545`, `chainId: 31337`) y `amoy` (red pública de prueba de Polygon PoS, `chainId: 80002`, con soporte de verificación en Polygonscan vía Etherscan API V2).

### 6.2 Pasos de Instalación, Compilación, Despliegue y Ejecución

1. **Ubicarse en la carpeta del proyecto e instalar dependencias:**
   ```bash
   cd e-ticket-evento
   npm install
   ```
2. **Compilar los contratos inteligentes:**
   ```bash
   npm run compile
   # equivalente a: npx hardhat compile
   ```
3. **Ejecutar la suite completa de pruebas automatizadas (34 tests):**
   ```bash
   npm test
   # equivalente a: npx hardhat test
   ```
4. **Generar el reporte de cobertura de código:**
   ```bash
   npm run coverage
   # equivalente a: npx hardhat coverage
   ```
5. **Ejecutar la demostración rápida en red en memoria:**
   ```bash
   npm run demo
   # equivalente a: npx hardhat run scripts/demo.js
   ```
6. **Desplegar y ejecutar la demo completa sobre un nodo local persistente (dos terminales):**
   ```bash
   # Terminal 1: levantar la blockchain local persistente
   npm run nodo

   # Terminal 2: desplegar contratos y correr la demo completa (incluye estados Reembolsada y Vencida)
   npm run deploy:local
   npm run demo:local
   ```
7. **Desplegar y operar en Polygon Amoy (red pública de prueba de Polygon PoS):**
   ```bash
   # Copiar la plantilla y configurar PRIVATE_KEY (billetera exclusiva para el TP con POL de prueba)
   cp .env.example .env

   # Desplegar contratos (guarda direcciones y hashes en deployments/amoy.json)
   npm run deploy:amoy

   # Ejecutar la demo sobre los contratos desplegados (imprime enlaces a amoy.polygonscan.com)
   npm run demo:amoy

   # (Opcional) Publicar y verificar el código fuente en Polygonscan
   npx hardhat verify --network amoy <dir_EntradaNFT>
   npx hardhat verify --network amoy <dir_EventManager> <dir_EntradaNFT>
   npx hardhat verify --network amoy <dir_ReventaMarketplace> <dir_EntradaNFT> <dir_EventManager>
   ```

---

## 7. Casos de Prueba de la Demostración y Resultados Esperados

### 7.1 Flujo de Pruebas en Vivo durante la Clase (`scripts/demo.js` y `scripts/demo-red.js`)

Los scripts de demostración (`scripts/demo.js` para corrida rápida en memoria y `scripts/demo-red.js` para nodo local persistente o Polygon Amoy) demuestran en vivo todos los puntos exigidos por la consigna (creación del activo, consulta de datos y estados, recorrido completo del DTE incluyendo sus tres estados finales `Utilizada`, `Reembolsada` y `Vencida`, rechazo de operaciones inválidas y rechazo por falta de permisos), decodificando en tiempo real el *custom error* devuelto por la EVM mediante `scripts/errores.js`:

| Etapa | Operación Ejecutada | Datos y Condiciones Iniciales | Resultado Esperado y Verificación |
|:---:|---|---|---|
| **1** | Despliegue y configuración RBAC | Contratos desplegados en la red elegida (`deploy.js` o `deploy-red.js`); roles otorgados y cuentas de participantes preparadas. | Contratos `EntradaNFT`, `EventManager` y `ReventaMarketplace` desplegados, enlazados y con sus roles otorgados. |
| **2** | `crearEvento` | Organizador crea el Evento ("Recital de Rock - Kempes 2026"), precio `0.1 ETH` (`0.001 POL` en Amoy), capacidad `50000`, tope `+20%` (`2000 bps`), regalía `10%`, comisión `5%`, límite `2` por DNI. | Evento registrado en estado `Programado` con cupo `Emitida` disponible. |
| **3** | `comprarEntrada` + Consulta del activo | Comprador 1 presenta compromiso `keccak256(41234567, salt)` firmado con EIP-712 por *Tribuna Segura* y abona el precio. Se consulta `obtenerEntrada`, `ownerOf` y `estadoEfectivo`. | Se acuña el NFT a Comprador 1 en estado `Asignada`; fondos retenidos en `balanceCustodia`. La consulta en cadena devuelve titular, precio y estado `Asignada`. |
| **4** | Rechazo de transferencia P2P (`transferFrom`) | Comprador 1 intenta transferir directamente el NFT a Comprador 2 por fuera del Marketplace. | **Rechazo de operación inválida:** la EVM revierte y `errores.js` decodifica `TransferenciaDirectaBloqueada` (`0x9f255784`). |
| **5** | Rechazo de sobreprecio (`publicarReventa`) | Comprador 1 intenta publicar el NFT a `+50%` (superando el tope permitido de `+20%`). | **Rechazo de operación inválida:** la EVM revierte y se decodifica `PrecioSuperaTope` (`0x4f7614ee`). |
| **6** | `publicarReventa` + `revenderEntrada` + Consulta | Comprador 1 publica a `+15%`; estado pasa a `En reventa`. Comprador 2 compra con su compromiso verificado. | NFT transferido a Comprador 2 (`Asignada`, `cantTransferencias = 1`). Split acreditado: Artista `10%`, Ticketera `5%`, Vendedor `85%`. Retiro exitoso vía `retirarFondos()` (patrón *Pull*). |
| **7** | Rechazo sin rol + `validarIngreso` + Rechazo de replay | 1) Comprador 1 (sin `VALIDADOR_ROLE`) intenta ejecutar `validarIngreso`.<br/>2) Validador autorizado escanea el QR dinámico firmado por Comprador 2.<br/>3) Se intenta volver a ingresar con la misma entrada. | 1) **Rechazo por permisos:** revierte con `AccessControlUnauthorizedAccount` (`0xe2517d3f`).<br/>2) Ingreso exitoso: estado pasa a **`Utilizada`**.<br/>3) **Rechazo de transición inválida:** revierte con `EntradaNoValidaParaIngreso` (`0xfb491662`). |
| **8** | Cancelación, Reembolso y Cierre (`demo-red.js`) | 1) Se crea un segundo evento, Comprador 1 compra, el Oráculo ejecuta `cancelarEvento` y el comprador reclama y retira su reembolso (e intenta reclamar por segunda vez).<br/>2) En nodo local, se compra otra entrada sin usar, se intenta cerrar antes de término, se avanza el reloj 8 días y el Oráculo ejecuta `cerrarEvento`. | 1) La entrada del evento cancelado queda en estado final **`Reembolsada`**; el segundo reclamo revierte con `YaReembolsada`.<br/>2) El cierre anticipado revierte con `FueraDeTermino`; tras +8 días se libera la custodia al organizador y la entrada sin usar queda en estado final **`Vencida`**. |

### 7.2 Matriz Completa de Pruebas Automatizadas (`npx hardhat test`)

La suite automatizada consta de **34 pruebas** (los **27 casos funcionales y de seguridad `CP-01` a `CP-27`** más **7 suites de validaciones exhaustivas de borde** en `test/06_ValidacionesYCobertura.test.js`). Parámetros de referencia: precio base `0.1 ETH`, tope `+20%` (`2000 bps`), regalía `10%` (`1000 bps`), comisión `5%` (`500 bps`), límite por persona `2`, máximo de transferencias `2`, capacidad `100`.

| ID | Categoría | Operación | Datos y Condiciones Iniciales | Resultado Esperado | Estado |
|:---:|---|---|---|---|---|
| **CP-01** | Happy Path | `crearEvento` | Organizador crea "Recital Rock 2026" con los parámetros de referencia. | Evento `Programado`, evento `EventoCreado` emitido, cupo 100 disponible (`Emitida`). | ✔ PASA |
| **CP-02** | Happy Path | `comprarEntrada` | Comprador 1 paga `0.1 ETH` con compromiso firmado por el verificador. | NFT `#1` acuñado a Comprador 1 (`Asignada`), `balanceCustodia = 0.1 ETH`. | ✔ PASA |
| **CP-03** | Negocio | Límite por persona (primario) | Comprador 1 ya compró 2 entradas e intenta comprar una 3ra con el mismo compromiso. | Revert con `LimitePorPersonaExcedido`. | ✔ PASA |
| **CP-04** | Negocio | Capacidad agotada | Evento creado con `capacidad = 1` ya vendida; Comprador 2 intenta comprar. | Revert con `CapacidadAgotada`. | ✔ PASA |
| **CP-05** | Negocio | Monto incorrecto | Comprador 1 envía `0.09 ETH` en lugar de `0.1 ETH`. | Revert con `MontoIncorrecto`. | ✔ PASA |
| **CP-06** | Seguridad | Firma de verificador inválida | Compromiso firmado por una cuenta sin `VERIFICADOR_ROLE`. | Revert con `FirmaInvalida`. | ✔ PASA |
| **CP-07** | Happy Path | `publicarReventa` | Comprador 1 publica su entrada a `0.115 ETH` (dentro del tope de `0.12 ETH`). | NFT en custodia del Marketplace, estado `En reventa`. | ✔ PASA |
| **CP-08** | Negocio | Exceso de tope de precio | Comprador 1 intenta publicar a `0.15 ETH` (+50%, tope +20%). | Revert con `PrecioSuperaTope`. | ✔ PASA |
| **CP-09** | Happy Path | `retirarPublicacion` | Comprador 1 retira su publicación activa `#1`. | NFT restituido a Comprador 1, estado `Asignada`, publicación `Retirada`. | ✔ PASA |
| **CP-10** | Happy Path | `revenderEntrada` y split | Comprador 2 paga `0.115 ETH` con su compromiso firmado por el verificador. | NFT a Comprador 2 (`Asignada`, `cantTransferencias = 1`). Saldos: Artista `0.0115 ETH`, Plataforma `0.00575 ETH`, Vendedor `0.09775 ETH`. | ✔ PASA |
| **CP-11** | Negocio | Límite por persona (secundario) | Comprador 2 ya posee 2 entradas del evento e intenta comprar una 3ra en reventa. | Revert con `LimitePorPersonaExcedido`. | ✔ PASA |
| **CP-12** | Negocio | Máximo de transferencias | Entrada revendida 2 veces (`cantTransferencias == 2`) intenta volver a publicarse. | Revert con `MaxTransferenciasAlcanzado`. | ✔ PASA |
| **CP-13** | Negocio | Pago incorrecto en reventa | Comprador 2 envía `0.10 ETH` para una publicación de `0.115 ETH`. | Revert con `MontoIncorrecto`. | ✔ PASA |
| **CP-14** | Seguridad | Transferencia directa P2P | Titular invoca `transferFrom` directamente hacia otra billetera. | Revert con `TransferenciaDirectaBloqueada`. | ✔ PASA |
| **CP-15** | Seguridad | Bloqueo de `approve` | Titular invoca `approve` o `setApprovalForAll`. | Revert con `TransferenciaDirectaBloqueada`. | ✔ PASA |
| **CP-16** | Permisos | `validarIngreso` sin rol | Usuario sin `VALIDADOR_ROLE` invoca `validarIngreso`. | Revert con `AccessControlUnauthorizedAccount`. | ✔ PASA |
| **CP-17** | Happy Path | `validarIngreso` con QR dinámico | Validador presenta compromiso correcto y firma EIP-712 reciente del titular. | Estado pasa a `Utilizada`, registra `fechaValidacion` y emite `IngresoValidado`. | ✔ PASA |
| **CP-18** | Negocio | Replay en molinete | Se intenta validar por segunda vez la misma entrada ya `Utilizada`. | Revert con `EntradaNoValidaParaIngreso`. | ✔ PASA |
| **CP-19** | Seguridad | QR expirado o firma apócrifa | QR con `timestamp` de hace 10 min (> 60 s) o firmado por cuenta que no es titular. | Revert con `QRExpirado` y `FirmaInvalida` respectivamente. | ✔ PASA |
| **CP-20** | Permisos | Cierre por el organizador | Organizador (sin `ORACULO_ROLE`) intenta ejecutar `cerrarEvento`. | Revert con `AccessControlUnauthorizedAccount`. | ✔ PASA |
| **CP-21** | Cancelación | `cancelarEvento` y reembolso | Oráculo cancela evento; Comprador 2 (titular actual por reventa) ejecuta `reclamarReembolso`. | Recibe crédito por `0.1 ETH` (`precioOriginal`), entrada pasa a `Reembolsada`. | ✔ PASA |
| **CP-22** | Cancelación | Doble reembolso | Titular intenta ejecutar `reclamarReembolso` por segunda vez sobre la misma entrada. | Revert con `YaReembolsada`. | ✔ PASA |
| **CP-23** | Cancelación | Reembolso en reventa activa | Evento se cancela con entrada publicada en el Marketplace; el vendedor reclama reembolso. | Vendedor recibe `0.1 ETH`, entrada pasa a `Reembolsada`, publicación se cierra y el NFT se restituye a la billetera del vendedor. | ✔ PASA |
| **CP-24** | Liquidación | Cierre antes de término | Oráculo intenta `cerrarEvento` antes de `fechaHora + 1 day`. | Revert con `FueraDeTermino`. | ✔ PASA |
| **CP-25** | Liquidación | `cerrarEvento` y vencimiento | Reloj avanza a `fechaHora + 25 h`; Oráculo cierra el evento. | Custodia acreditada al organizador; `estadoEfectivo` de entradas sin usar devuelve `Vencida`. | ✔ PASA |
| **CP-26** | Liquidación | `retirarFondos` (patrón Pull) | Beneficiario retira su saldo acumulado; luego intenta retirar por segunda vez. | Balance en ETH se incrementa exactamente; segundo retiro revierte con `SinSaldo`. | ✔ PASA |
| **CP-27** | Seguridad | Ataque de reentrancia | Contrato malicioso `Atacante.sol` intenta reentrar en `retirarFondos`, `comprarEntrada` y `reclamarReembolso`. | El ataque revierte (`TransferenciaFallida` / `ReentrancyGuardReentrantCall`); los fondos quedan intactos. | ✔ PASA |

### 7.3 Cobertura de Código Verificada (`npx hardhat coverage`)

```
-------------------------|----------|----------|----------|----------|
File                     |  % Stmts | % Branch |  % Funcs |  % Lines |
-------------------------|----------|----------|----------|----------|
 contracts/              |      100 |     98.9 |      100 |      100 |
  EntradaNFT.sol         |      100 |      100 |      100 |      100 |
  EventManager.sol       |      100 |      100 |      100 |      100 |
  ReventaMarketplace.sol |      100 |    95.24 |      100 |      100 |
 contracts/test/         |    83.33 |      100 |      100 |    88.89 |
  Atacante.sol           |    83.33 |      100 |      100 |    88.89 |
-------------------------|----------|----------|----------|----------|
All files                |    99.41 |    98.91 |      100 |    99.53 |
-------------------------|----------|----------|----------|----------|
```

---

## 8. Limitaciones del Prototipo

En cumplimiento con las pautas de transparencia técnica de la cátedra, se explicitan las limitaciones del prototipo:

1. **Dependencia del verificador para la unicidad del *salt* por DNI:** El contrato contabiliza el cupo por persona según el `compromisoIdentidad` (`keccak256(abi.encode(DNI, salt))`). Para que una misma persona no obtenga dos cupos distintos, el servicio verificador off-chain (*Tribuna Segura* / KYC) debe asignar un único `salt` determinístico por `(DNI, idEvento)` y no emitir firmas para compromisos duplicados de un mismo documento.
2. **Reembolso del `precioOriginal` en entradas adquiridas en reventa:** Ante la cancelación de un evento, `reclamarReembolso` devuelve el `precioOriginal` retenido en el *escrow* del evento. El sobreprecio de hasta +20% abonado en una reventa secundaria ya fue liquidado entre el vendedor anterior, el artista y la plataforma en el momento de la reventa.
3. **Alcance de atributos de ubicación y metadata off-chain (`tokenURI`):** En este prototipo se unificó un `precioBase` por evento y se omitieron los campos `sector`, `ubicacion` y la generación de JSON en IPFS (`tokenURI`), dado que no alteran las reglas financieras ni las transiciones de estado del contrato. Asimismo, el booleano `requiereAdmision` se almacena en el evento pero el prototipo exige firma del verificador para todos los eventos por igual, y `validarIngreso` se puede ejecutar antes del cierre sin restringirlo exclusivamente al día del evento.
4. **Venta de la billetera completa fuera de la cadena:** El candado en `_update` impide transferir el NFT entre billeteras, pero no puede impedir que dos personas se entreguen físicamente la clave privada de una billetera. Este vector se mitiga en el acceso mediante la verificación presencial del DNI contra el `compromisoIdentidad` registrado en la entrada.
5. **Tope de reventa del 0% vs. prohibición total de reventa:** Fijar `topeReventaBps = 0` permite revender la entrada sin sobreprecio (a su `precioOriginal`). Si una jurisdicción u organizador desea prohibir por completo cualquier reventa secundaria, debe configurar `maxTransferencias = 0`.
6. **Gobernanza y componentes fuera de la cadena simulados:** En el entorno local, los roles de Administrador (`DEFAULT_ADMIN_ROLE`), Organizador (`ORGANIZADOR_ROLE`), Oráculo (`ORACULO_ROLE`), Verificador (`VERIFICADOR_ROLE`) y Validador (`VALIDADOR_ROLE`) están representados por cuentas EOA individuales, y en la red de prueba pública (Polygon Amoy) son operados por una única billetera administradora (con opción de delegarlos mediante variables en `.env`) para simplificar la gestión de claves y gas durante la demostración. Asimismo, los pagos se realizan en la moneda nativa de la red EVM (`ETH` / `POL`) en lugar de una pasarela fiat en pesos, y la validación del QR se ejecuta como transacción on-chain. En un despliegue productivo, cada rol pertenecería a la entidad correspondiente, el administrador sería una billetera *multisig* con *timelock* y el oráculo un consorcio descentralizado.

---

## 9. Fuentes Consultadas y Declaración de Uso de Inteligencia Artificial

### 9.1 Fuentes y Bibliografía (Formato APA)

* Anthropic. (2026). *Claude* [Modelo de lenguaje de gran tamaño]. https://claude.ai
* Burks, Z., Morgan, J., Malone, B. y Seibel, J. (2020). *ERC-2981: NFT royalty standard*. Ethereum Improvement Proposals. https://eips.ethereum.org/EIPS/eip-2981
* Ciudad Magazine. (s.f.). *Ayelén Paleo promocionó una reventa de entradas para el partido de la Selección Argentina y se defendió*. https://www.ciudad.com.ar/espectaculos/ayelen-paleo-promociono-reventa-entradas-partido-seleccion-argentina-defendio-mi_88519
* Datawallet. (s.f.). *Cómo obtener tokens testnet de Polygon: faucets de Amoy y límites*. https://www.datawallet.com/es/crypto/how-to-get-polygon-testnet-tokens
* Decrypt. (2023). *Ticketmaster debuts NFT-gated ticket sales, starting with Avenged Sevenfold*. https://decrypt.co/124607/ticketmaster-debuts-nft-gated-ticket-sales-starting-avenged-sevenfold
* Dune. (s.f.). *Polygon PoS* [Documentación]. https://docs.dune.com/data-catalog/evm/polygon/overview
* Entriken, W., Shirley, D., Evans, J. y Sachs, N. (2018). *ERC-721: Non-fungible token standard*. Ethereum Improvement Proposals. https://eips.ethereum.org/EIPS/eip-721
* Etherscan. (s.f.). *Verify with Hardhat (Etherscan API V2)*. https://docs.etherscan.io/etherscan-v2/contract-verification/verify-with-hardhat
* Gobierno de la Provincia de Santa Fe. (2024, 10 de abril). *Tenían pedido de captura y los detuvieron cuando intentaban ingresar a partidos de fútbol*. https://www.santafe.gob.ar/noticias/noticia/280056/
* Google DeepMind. (2026). *Gemini* [Modelo de lenguaje de gran tamaño]. https://gemini.google.com
* iProfesional. (2025, 27 de marzo). *Entradas de partidos y recitales: buscan por ley regular la reventa para evitar mega estafas como en Argentina - Brasil*. https://www.iprofesional.com/economia/425203-buscan-regular-reventa-entradas-tras-mega-estafa-en-partido-argentina-versus-brasil
* Ley 25.326. (2000). *Protección de los datos personales*. Boletín Oficial de la República Argentina. https://servicios.infoleg.gob.ar/infolegInternet/anexos/60000-64999/64790/texact.htm
* Medina, O., Marciszack, M., Romero, R., Meloni, B., Strub, A., Romero, M., Morardo, D. y Nájera, J. (2024). Una aproximación al uso de patrones de eventos para el modelado de contratos inteligentes. *Realidad Empresarial*, (19, especial), 7–18.
* Medina, O. C. y Romero, R. A. (s.f.-a). *Casos de uso de contratos inteligentes* [Diapositivas de clase]. Desarrollo con tecnologías Blockchain, Universidad Tecnológica Nacional, Facultad Regional Córdoba.
* Medina, O. C. y Romero, R. A. (s.f.-b). *Modelado de un contrato inteligente* [Diapositivas de clase]. Desarrollo con tecnologías Blockchain, Universidad Tecnológica Nacional, Facultad Regional Córdoba.
* Medina, O. C. y Romero, R. A. (s.f.-c). *Modelado de un contrato inteligente (continuación 2)* [Diapositivas de clase]. Desarrollo con tecnologías Blockchain, Universidad Tecnológica Nacional, Facultad Regional Córdoba.
* Medina, O. C. y Romero, R. A. (s.f.-d). *Modelado de un contrato inteligente (continuación 3)* [Diapositivas de clase]. Desarrollo con tecnologías Blockchain, Universidad Tecnológica Nacional, Facultad Regional Córdoba.
* OpenZeppelin. (2024). *OpenZeppelin Contracts v5.x Documentation*. https://docs.openzeppelin.com/contracts/5.x/
* Polygon. (s.f.). *RPC endpoints*. https://docs.polygon.technology/pos/reference/rpc-endpoints/

### 9.2 Declaración de Uso de Inteligencia Artificial

En cumplimiento con los lineamientos de integridad académica de la cátedra, declaramos el uso de herramientas de Inteligencia Artificial generativa (Claude de Anthropic y Gemini de Google DeepMind) como asistentes durante el desarrollo del prototipo:

1. **Cómo se utilizó la IA:**
   * **Revisión de arquitectura EVM:** A partir del modelo conceptual de la Actividad 4, se utilizó IA para identificar riesgos propios de la EVM (como bucles sin cota de gas en cancelaciones/cierres, vulnerabilidad del hash simple de DNI frente a fuerza bruta y ataques de reentrancia en retiros) y diseñar sus mitigaciones (*Lazy Minting*, estados lógicos, compromisos con `salt` + firmas EIP-712 y patrón *Pull* con CEI).
   * **Asistencia en codificación y pruebas:** Apoyo en la redacción de los contratos en Solidity `0.8.24` integrando OpenZeppelin v5 (`ERC721`, `ERC2981`, `AccessControl`, `ReentrancyGuard`, `EIP712`), en la construcción de la suite de 34 pruebas automatizadas con Mocha/Chai, en los scripts de despliegue y demostración para nodo local y Polygon Amoy, y en la estructuración de la documentación técnica.
2. **Cómo se verificaron los resultados:**
   * **Pruebas automatizadas y cobertura de código:** Cada función, transición del DTE, cálculo de *split* en *basis points* y restricción de permisos fue verificada ejecutando `npx hardhat test` (34/34 tests aprobados) y `npx hardhat coverage` (100% de cobertura de sentencias, funciones y líneas en los tres contratos de negocio).
   * **Auditoría cruzada contra la consigna y el modelo:** El equipo contrastó manualmente cada atributo, estado y transacción frente al informe entregado en la Actividad 4, verificando que todos los cambios técnicos estén documentados y que el funcionamiento en vivo (`scripts/demo.js` y `scripts/demo-red.js`) refleje fielmente el caso de uso original.
