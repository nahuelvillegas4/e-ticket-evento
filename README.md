# e-TicketEvento — Entradas Tokenizadas para Eventos Masivos 🎟️⛓️

**Trabajo Práctico:** Desarrollo con Tecnologías Blockchain  
**Institución:** Universidad Tecnológica Nacional – Facultad Regional Córdoba (UTN-FRC)  
**Comisión:** 5K3A  
**Docentes:** Dr. Oscar Carlos Medina | Esp. Rubén Aníbal Romero  
**Fecha de Demo Day:** Lunes 16 de noviembre de 2026  

---

## 👥 Integrantes

* **95346** – Chas Díaz, Lucas Martín
* **95345** – Tombesi, Gino Paolo
* **94837** – Villegas, Angel Nahuel
* **94543** – Rottino, Juan Ignacio

---

## 🚀 Descripción del Proyecto

`e-TicketEvento` es una solución basada en contratos inteligentes para la **EVM (Polygon PoS)** que moderniza y asegura la emisión, comercialización, reventa y control de acceso de entradas para eventos masivos (recitales, espectáculos y fútbol).

### Principales Características:
* **Entradas como NFTs (ERC-721 + ERC-2981):** Titularidad verificable, trazabilidad y cobro automático de regalías para artistas o clubes en cada reventa.
* **Candado Antifraude P2P:** Prohibición a nivel de contrato (`_update`) de transferencias directas o mercados negros por fuera de la plataforma oficial.
* **Tope Máximo de Reventa en Código:** Límite infranqueable de precio en el mercado secundario (cumpliendo con Ley CABA 5174 y Ley Nacional 23.184).
* **Privacidad y Seudonimización (Ley 25.326):** El DNI nunca se expone en la blockchain; se valida mediante compromisos criptográficos `keccak256(abi.encode(DNI, salt))` y firmas tipificadas EIP-712 de *Tribuna Segura* o KYC.
* **Control de Acceso con QR Dinámico:** Firma EIP-712 efímera generada por la billetera del titular que caduca en 60 segundos, imposibilitando el fraude por captura de pantalla.
* **Escrow Descentralizado y Reembolsos Pull:** Fondos primarios custodiados hasta la confirmación del evento por un oráculo imparcial; reembolsos inmediatos ante suspensiones.

---

## 📂 Estructura del Repositorio

```
e-ticket-evento/
├── contracts/
│   ├── EntradaNFT.sol             # ERC-721 + ERC-2981, candado _update y QR dinámico
│   ├── EventManager.sol           # Gestión de eventos, escrow, límites y reembolsos pull
│   ├── ReventaMarketplace.sol     # Reventa regulada con tope de precio y split de fondos
│   └── test/
│       └── Atacante.sol           # Contrato malicioso para prueba de reentrancia (CP-27)
├── test/
│   ├── helpers.js                        # Fixtures, compromisos criptográficos y firmas EIP-712
│   ├── 01_CreacionYCompra.test.js        # CP-01 a CP-06
│   ├── 02_Reventa.test.js                # CP-07 a CP-13
│   ├── 03_CandadoP2P.test.js             # CP-14 y CP-15
│   ├── 04_ControlAcceso.test.js          # CP-16 a CP-19
│   ├── 05_CicloFinal.test.js             # CP-20 a CP-27
│   └── 06_ValidacionesYCobertura.test.js # Validaciones negativas, bordes y reentrancia extendida
├── scripts/
│   ├── utils.js                   # Funciones criptográficas reutilizables
│   ├── errores.js                 # Muestra el error real devuelto por el contrato
│   ├── deploy.js                  # Despliegue con varias cuentas (red local)
│   ├── deploy-red.js              # Despliegue con una sola billetera (localhost o Amoy)
│   ├── demo.js                    # Demo rápida en red en memoria
│   └── demo-red.js                # Demo completa sobre localhost o Amoy (incluye cancelación y cierre)
├── deployments/                   # Direcciones desplegadas por red (amoy.json)
├── docs/
│   ├── INFORME_DESARROLLO_5K3A.md # Informe técnico académico completo
│   └── GUIA_PRESENTACION_DEMO.md  # Guion del pitch de 7 min para los 4 integrantes
├── .env.example                   # Variables para Amoy (copiar como .env)
├── hardhat.config.js              # Solidity 0.8.24, Cancun, optimizador; redes hardhat, localhost y amoy
└── package.json                   # Dependencias fijas del proyecto
```

---

## 🛠️ Requisitos Previos

* **Node.js:** v18.0.0 o superior (verificado con v22.14.0)
* **npm:** v9.0.0 o superior

---

## ⚡ Comandos Rápidos

Dentro de la carpeta `e-ticket-evento/`:

```bash
# 1. Instalar dependencias (no copiar node_modules de otra PC)
npm install

# 2. Compilar contratos inteligentes (la primera vez descarga el compilador: requiere internet)
npm run compile

# 3. Ejecutar las 34 pruebas automatizadas (27 CP + 7 suites de borde)
npm test

# 4. Medir la cobertura de pruebas
npm run coverage

# 5. Demo rápida en una red en memoria (se borra al terminar)
npm run demo
```

### Demo sobre un nodo local persistente (dos terminales)

```bash
# Terminal 1: blockchain local (muestra cada transacción)
npm run nodo

# Terminal 2: desplegar y ejecutar la demo completa
npm run deploy:local
npm run demo:local
```

### Despliegue en Polygon Amoy (red de prueba pública)

```bash
cp .env.example .env      # completar PRIVATE_KEY (billetera nueva, solo para el TP)
npm run deploy:amoy       # guarda las direcciones en deployments/amoy.json
npm run demo:amoy         # cada transacción imprime su enlace a amoy.polygonscan.com
npx hardhat verify --network amoy <dirección> <argumentos>   # opcional: publica el código fuente
```

---

## 📊 Métricas de Cobertura de Código

* **Sentencias:** 99.41%
* **Ramas (Branch):** 98.91%
* **Funciones:** 100%
* **Líneas de código:** 99.52%
* **Pruebas automatizadas:** 34 de 34 aprobadas (27 casos de la matriz CP-01 a CP-27 + 7 suites de validaciones de borde)
