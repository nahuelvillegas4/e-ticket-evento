# Guía de Exposición para el Demo Day (7 Minutos - Formato TED)
## e-TicketEvento: Entradas Tokenizadas para Eventos Masivos
### Asignatura: Desarrollo con Tecnologías Blockchain — UTN FRC (Comisión 5K3A)
**Fecha del Demo Day:** Lunes 16 de noviembre de 2026  
**Docentes:** Dr. Oscar Carlos Medina | Esp. Rubén Aníbal Romero  

---

### Integrantes y Distribución de Roles:
1. **Lucas Martín Chas Díaz** (Legajo 95346) — *Introducción, problemática y valor de Blockchain.*
2. **Gino Paolo Tombesi** (Legajo 95345) — *Arquitectura de smart contracts y modelo de datos.*
3. **Angel Nahuel Villegas** (Legajo 94837) — *Seguridad criptográfica, privacidad y demostración en vivo.*
4. **Juan Ignacio Rottino** (Legajo 94543) — *Modelo de negocio, liquidación, impacto y conclusiones.*

---

## Estructura Temporal del Pitch (Total: 7:00 min)

```
0:00 - 1:30 | Bloque 1: El Dolor del Mercado y la Propuesta de Valor (Lucas)
1:30 - 3:00 | Bloque 2: Arquitectura Técnica y Contratos Coordinados (Gino)
3:00 - 5:15 | Bloque 3: Demostración en Vivo y Pruebas de Ataque (Nahuel)
5:15 - 7:00 | Bloque 4: Economía del Protocolo, Gobernanza y Cierre (Juan)
```

---

### Minuto 0:00 a 1:30 — Lucas Martín Chas Díaz
**Tema:** *El dolor del mercado tradicional y por qué Blockchain transforma las entradas.*

* **Gancho de inicio (Hook):**
  > "¿Cuántas veces escucharon en las noticias que miles de personas se quedaron afuera de un recital o de un clásico de fútbol con entradas falsas o duplicadas por QR en un PDF? ¿O vieron reventas a precios absurdos donde el organizador y el artista no ven un solo peso?"
* **Problemática clave:**
  * Duplicación masiva por capturas de pantalla de QR estáticos.
  * Reventa especulativa informal (contravención en CABA Ley 5174, Ley Nacional 23.184).
  * Desarticulación con controles de admisión del Estado (*Tribuna Segura*).
  * Retención abusiva de fondos por ticketeras tradicionales ante cancelaciones.
* **Nuestra Solución (`e-TicketEvento`):**
  * Cada entrada es un **NFT (ERC-721)** con regalías integradas (**ERC-2981**) sobre una red pública (Polygon PoS).
  * La regla de negocio ya no depende de la buena voluntad de un tercero: **está grabada en el código**.

---

### Minuto 1:30 a 3:00 — Gino Paolo Tombesi
**Tema:** *Arquitectura de smart contracts y mitigaciones de ingeniería EVM.*

* **Los Tres Contratos Coordinados:**
  1. `EventManager.sol`: Administra eventos, custodia de fondos (Escrow) y retiros seguros.
  2. `EntradaNFT.sol`: Implementa el activo digital, el candado de transferencias y la validación en puerta.
  3. `ReventaMarketplace.sol`: Canal único regulado que garantiza topes de precio y splits automáticos.
* **Aportes de Ingeniería (Del modelo teórico al código real):**
  * **Lazy Minting:** No se emiten 50.000 tokens vacíos al inicio (ahorro masivo de gas); se acuñan al comprar.
  * **Eliminación de Bucles Peligrosos (DoS por Gas):** Los estados `Emitida` y `Vencida` se resuelven como estados lógicos.
  * **Patrón Pull (Retiro individual):** Reembolsos y pagos se retiran por demanda (`retirarFondos`), evitando que contratos maliciosos bloqueen transacciones.

---

### Minuto 3:00 a 5:15 — Angel Nahuel Villegas
**Tema:** *Demostración en vivo en consola y validaciones de seguridad.*

* **Ejecución en pantalla (Opción A recomendada: nodo local con DTE completo o demo rápida; más vista en Polygonscan Amoy):**
  ```bash
  # Opción rápida (1 terminal):
  npm run demo

  # Opción completa con nodo en vivo (2 terminales: incluye estados Reembolsada y Vencida):
  # Terminal 1: npm run nodo
  # Terminal 2: npm run deploy:local && npm run demo:local

  # Red pública Polygon Amoy:
  # npm run deploy:amoy && npm run demo:amoy
  ```
* **Puntos a relatar durante la ejecución:**
  1. **Privacidad y Ley 25.326:**
     * Explicar el compromiso criptográfico: `keccak256(abi.encode(DNI, salt))`.
     * El DNI nunca se almacena en la blockchain. La firma EIP-712 de *Tribuna Segura* garantiza la autenticidad sin violar la privacidad.
  2. **Ataque 1: Intento de Reventa P2P fuera de la plataforma:**
     * Mostrar cómo la EVM revierte y `errores.js` decodifica con el ABI el error real `TransferenciaDirectaBloqueada` (`0x9f255784`). El hook `_update` impide la reventa en el mercado negro.
  3. **Ataque 2: Intento de sobreprecio:**
     * Mostrar el intento de publicar a +50% y el rechazo real del contrato por `PrecioSuperaTope` (`0x4f7614ee`).
  4. **Control de Acceso en Puerta, Permisos y QR Dinámico:**
     * Mostrar el rechazo por falta de permisos (`AccessControlUnauthorizedAccount`, `0xe2517d3f`) cuando un usuario sin `VALIDADOR_ROLE` intenta validar un ingreso.
     * La app del titular firma `(tokenId, timestamp)`. Mostrar cómo el validador autorizado valida el ingreso y la entrada pasa al estado final **`Utilizada`**.
     * Mostrar el intento inmediato de volver a usar la misma entrada (replay) y el rechazo por `EntradaNoValidaParaIngreso` (`0xfb491662`).
  5. **Recorrido completo del DTE (`Reembolsada` y `Vencida`) y Pruebas Automatizadas:**
     * En `demo:local` / `demo:amoy`, señalar el paso de cancelación por el oráculo con reembolso al comprador (estado final **`Reembolsada`**) y el cierre con avance del reloj donde la entrada no usada pasa a **`Vencida`**.
     * Mostrar 30 segundos en el navegador los contratos y logs de eventos en `amoy.polygonscan.com` y recordar al jurado: *"Contamos con una suite automatizada de 34 pruebas (los 27 casos CP-01 a CP-27 más 7 suites de validaciones de borde) corriendo al 100% en verde."*

---

### Minuto 5:15 a 7:00 — Juan Ignacio Rottino
**Tema:** *Economía del protocolo, incentivos alineados y conclusiones.*

* **El Split Automático de Fondos:**
  * Explicar la distribución transparente en cada reventa:
    * 10% para el Artista / Club (derecho de autor por ERC-2981).
    * 5% para la Plataforma tecnológica.
    * 85% para el titular que no pudo asistir.
  * Todos ganan: el artista genera nuevos ingresos, la ticketera monetiza el mercado secundario y el público compra con garantía de autenticidad.
* **Seguridad Financiera y Oráculo Independiente:**
  * Los fondos primarios están en un **Escrow protegido**. El organizador no puede cobrar hasta que el oráculo confirma que el espectáculo se realizó.
  * Si el evento se cancela, el contrato devuelve el 100% del valor original de forma automática e imparcial.
* **Cierre Contundente:**
  > "e-TicketEvento demuestra que la tecnología blockchain no es solo para finanzas especulativas: resuelve un problema real, protege al consumidor, respeta la legislación argentina y devuelve la transparencia a los espectáculos masivos. Muchas gracias."

---

### Consejos para la Presentación:
* Mantener la terminal abierta y visible con tipografía legible antes de comenzar.
* Tener corriendo en una pestaña paralela `npx hardhat test` para proyectar las 34 pruebas en verde ante cualquier consulta técnica de los docentes.
* Respetar los tiempos estrictos para no exceder los 7 minutos asignados por la cátedra.
