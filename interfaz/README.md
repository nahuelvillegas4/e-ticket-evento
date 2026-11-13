# Interfaz web de e-TicketEvento

Dos aplicaciones para mostrar el recorrido completo del sistema, como lo vería un usuario final:

| Archivo | Para quién | Qué hace |
| --- | --- | --- |
| `organizador.html` | Organizador | Revisa permisos, crea el evento paso a paso, sigue las ventas, valida ingresos en la puerta y cierra o cancela el evento. |
| `comprador.html` | Comprador | Compra con identidad verificada (DNI → Tribuna Segura → pago), muestra el QR dinámico, revende con tope e intenta vender por fuera. |

Cada acción firma una transacción contra los contratos y muestra el hash, el bloque, el gas, los eventos emitidos y, en Amoy, el enlace a amoy.polygonscan.com. El panel "Mostrar blockchain" explica qué función se llama, qué valida el contrato y cómo cambia el estado.

## Cómo levantarla

Desde la raíz del repositorio, una vez que instalaste las dependencias con `npm install`:

```bash
npm run interfaz:amoy
```

Usa `deployments/amoy.json` y la `PRIVATE_KEY` del `.env`. Esa billetera tiene que tener los roles operativos (los asigna `scripts/deploy-red.js`). Los compradores son las mismas cuentas derivadas que usa `scripts/demo-red.js`. Si no les alcanza el saldo, la interfaz les carga POL desde la billetera admin y lo muestra como una transacción más.

Después abrí `http://localhost:3000`. Para la presentación conviene tener `organizador.html` y `comprador.html` en dos ventanas, una al lado de la otra.

Otras redes:

```bash
npm run interfaz          # red en memoria de Hardhat: despliega todo al arrancar (ensayo sin internet)
npm run interfaz:local    # nodo local: antes `npm run nodo` y `npm run deploy:local`
```

En las redes locales aparece el botón "Adelantar el reloj de la red", que sirve para mostrar el cierre del evento y las entradas vencidas. En Amoy no se puede adelantar el tiempo.

Variables opcionales del `.env`: `PUERTO_INTERFAZ` (por defecto 3000), `PRECIO_ENTRADA` (precio sugerido, por defecto 0.001 en Amoy) y `RESERVA_GAS` (saldo mínimo que se deja a cada comprador para gas, por defecto 0.03 POL).

## Rechazos del contrato

Antes de enviar, el servidor simula la transacción (`staticCall`). Si el contrato la rechaza, la interfaz muestra el error custom real (por ejemplo `PrecioSuperaTope()` con su selector) sin gastar gas. Con el botón "Enviarla igual" se manda con gas fijo, para que quede registrada como fallida en Polygonscan.

## Sin servidor

Si las páginas se abren sin el servidor (por ejemplo, la vista previa publicada), `simulador.js` reproduce los contratos en el navegador con las mismas reglas y los mismos errores. Las firmas EIP-712 son reales, pero la red y los pagos son ficticios. El estado se comparte entre las dos pestañas mediante `localStorage`.

## Seguridad

Las claves privadas nunca llegan al navegador: las usa solamente `servidor.js`, que corre en tu máquina y escucha en `localhost`. No lo expongas a internet.
