/**
 * Muestra las cuentas que usa la interfaz (las mismas que derivan interfaz/servidor.js y
 * scripts/demo-red.js a partir de PRIVATE_KEY), con sus claves privadas, para importarlas
 * en MetaMask y ver los saldos y las entradas NFT en tiempo real.
 *
 *   npm run cuentas:amoy
 *
 * Son claves de una red de PRUEBA derivadas de tu PRIVATE_KEY: no las compartas ni las subas al repo.
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;

(async () => {
  const base = process.env.PRIVATE_KEY;
  if (!base) throw new Error("Falta PRIVATE_KEY en el .env");
  const red = hre.network.name;
  const derivar = (etq) => new ethers.Wallet(ethers.keccak256(ethers.toUtf8Bytes(`${base}:e-ticket-evento:${etq}`)));
  const admin = new ethers.Wallet(base);
  const cuentas = [
    ["Organizador (admin)", admin, false],
    ["Comprador 1 · Ana Ferreyra", derivar("comprador1"), true],
    ["Comprador 2 · Bruno Quiroga", derivar("comprador2"), true],
    ["Artista (cobra regalías)", derivar("artista"), true],
    ["Ticketera (cobra comisiones)", derivar("plataforma"), true],
  ];
  console.log(`\nCuentas de la demo en '${red}'\n`);
  for (const [nombre, w, mostrarClave] of cuentas) {
    const saldo = await ethers.provider.getBalance(w.address);
    console.log(`${nombre}`);
    console.log(`  Dirección:     ${w.address}`);
    console.log(`  Saldo:         ${ethers.formatEther(saldo)} POL`);
    if (mostrarClave) console.log(`  Clave privada: ${w.privateKey}`);
    else console.log("  Clave privada: la de tu .env");
    console.log("");
  }
  const reg = path.join(__dirname, "..", "deployments", `interfaz-${red}.json`);
  if (fs.existsSync(reg)) {
    const r = JSON.parse(fs.readFileSync(reg, "utf8"));
    console.log(`Contrato de las entradas (para importar NFTs en MetaMask): ${r.contratos.EntradaNFT}`);
    console.log(`Saldos por cobrar (reventas y reembolsos) en EventManager: ${r.contratos.EventManager}\n`);
  } else {
    console.log("Todavía no arrancaste la interfaz en esta red: la dirección del contrato de entradas aparece después de `npm run interfaz:amoy`.\n");
  }
  console.log("⚠ Claves de red de prueba: no las compartas ni las subas al repositorio.\n");
})().catch((e) => { console.error(e.message || e); process.exit(1); });
