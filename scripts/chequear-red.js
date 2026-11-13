/**
 * Chequeo previo a la demo (solo lectura, no envía transacciones):
 * billetera del .env, saldo suficiente para desplegar y, si existen, los contratos
 * del último arranque de la interfaz (deployments/interfaz-<red>.json).
 *   npm run chequear:amoy
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;

(async () => {
  const p = ethers.provider;
  const red = hre.network.name;
  console.log(`Red ${red} (chainId ${(await p.getNetwork()).chainId}) · bloque ${await p.getBlockNumber()}`);
  const [firmante] = await ethers.getSigners();
  if (!firmante) {
    console.log("\n✘ No hay PRIVATE_KEY en el .env: la interfaz no va a poder firmar.");
    process.exit(1);
  }
  const saldo = await p.getBalance(firmante.address);
  const minimo = ethers.parseEther(process.env.MINIMO_DESPLIEGUE || "0.3");
  console.log(`\nBilletera del .env (organizador, oráculo, verificador y validador): ${firmante.address}`);
  console.log(`  Saldo: ${ethers.formatEther(saldo)} POL ${saldo >= minimo ? "✔" : `✘ (mínimo ${ethers.formatEther(minimo)}: cargá en https://faucet.polygon.technology)`}`);

  const archivo = path.join(__dirname, "..", "deployments", `interfaz-${red}.json`);
  if (fs.existsSync(archivo)) {
    const reg = JSON.parse(fs.readFileSync(archivo, "utf8"));
    console.log(`\nÚltimo arranque de la interfaz (${reg.fecha}), admin ${reg.admin}:`);
    for (const [n, a] of Object.entries(reg.contratos || {})) console.log(`  ${n.padEnd(19)} ${a}  ${(await p.getCode(a)).length > 2 ? "desplegado" : "SIN CÓDIGO"}`);
    console.log(`  Eventos creados desde la interfaz: ${(reg.eventos || []).length}`);
  }
  console.log(saldo >= minimo
    ? `\n✔ Listo. "npm run interfaz:${red}" despliega contratos nuevos y abre la demo.`
    : "\n✘ Falta saldo para desplegar.");
})().catch((e) => { console.error(e); process.exit(1); });
