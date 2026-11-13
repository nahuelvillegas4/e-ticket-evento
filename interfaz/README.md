# Interfaz web de e-TicketEvento

Dos aplicaciones para mostrar el recorrido completo del sistema, como lo vería un usuario final:

| Archivo | Para quién | Qué hace |
| --- | --- | --- |
| `organizador.html` | Organizador | Revisa permisos, crea el evento paso a paso, sigue las ventas, valida ingresos en la puerta y cierra o cancela el evento. |
| `comprador.html` | Comprador | Compra con identidad verificada (DNI → Tribuna Segura → pago), muestra el QR dinámico, revende con tope e intenta vender por fuera. |

Cada acción firma una transacción contra los contratos y muestra el hash, el bloque, el gas, los eventos emitidos y, en Amoy, el enlace a amoy.polygonscan.com. El panel "Mostrar blockchain" explica qué función se llama, qué valida el contrato y cómo cambia el estado.

## Cómo levantarla

Desde la raíz del repositorio, con `npm install` hecho y la `PRIVATE_KEY` en el `.env`:

```bash
npm run chequear:amoy
```

Ese comando muestra la billetera del `.env` y si tiene saldo suficiente (al menos 0,3 POL; si no alcanza, se carga gratis en https://faucet.polygon.technology).

```bash
npm run interfaz:amoy
```

**Cada arranque despliega los tres contratos desde cero** con la billetera del `.env`, que queda como administradora y con los roles de organizador, oráculo, Tribuna Segura y validador. No depende de `deployments/amoy.json` ni de despliegues anteriores. Las 12 transacciones del despliegue se muestran en el paso 1 del organizador, cada una con su enlace a amoy.polygonscan.com. El despliegue tarda alrededor de un minuto y cuesta unos 0,2 POL.

Si se reinicia el servidor en medio de la demo y querés seguir con los mismos contratos:

```bash
npm run interfaz:amoy:continuar
```

Después abrí `http://localhost:3000`. Para la presentación conviene tener `organizador.html` y `comprador.html` en dos ventanas, una al lado de la otra. Los compradores son cuentas derivadas de la `PRIVATE_KEY`. Si no les alcanza el saldo, la interfaz les carga POL desde la billetera del organizador y lo muestra como una transacción más.

Otras redes:

```bash
npm run interfaz          # red en memoria de Hardhat (ensayo sin internet)
npm run interfaz:local    # nodo local: antes `npm run nodo` en otra terminal
```

En las redes locales aparece el botón "Adelantar el reloj de la red", que sirve para mostrar el cierre del evento y las entradas vencidas. En Amoy no se puede adelantar el tiempo.

Variables opcionales del `.env`: `PUERTO_INTERFAZ` (por defecto 3000), `PRECIO_ENTRADA` (precio sugerido, por defecto 0.001 en Amoy), `RESERVA_GAS` (saldo mínimo que se deja a cada comprador para gas, por defecto 0.03 POL) y `MINIMO_DESPLIEGUE` (saldo mínimo para arrancar, por defecto 0.3 POL).

## Rechazos del contrato

Antes de enviar, el servidor simula la transacción (`staticCall`). Si el contrato la rechaza, la interfaz muestra el error custom real (por ejemplo `PrecioSuperaTope()` con su selector) sin gastar gas. Con el botón "Enviarla igual" se manda con gas fijo, para que quede registrada como fallida en Polygonscan.

## Sin servidor

Si las páginas se abren sin el servidor (por ejemplo, la vista previa publicada), `simulador.js` reproduce los contratos en el navegador con las mismas reglas y los mismos errores. Las firmas EIP-712 son reales, pero la red y los pagos son ficticios. El estado se comparte entre las dos pestañas mediante `localStorage`.

## Seguridad

Las claves privadas nunca llegan al navegador: las usa solamente `servidor.js`, que corre en tu máquina y escucha en `localhost`. No lo expongas a internet.
