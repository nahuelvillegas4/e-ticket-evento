/**
 * Chequeo previo a la demo (solo lectura): contratos desplegados, roles y saldo
 * de la billetera admin del despliegue y de la billetera del .env (la que va a firmar).
 *   npm run chequear:amoy
 */
const hre = require("hardhat");
const { ethers } = hre;
const dep = require(`../deployments/${hre.network.name}.json`);

async function roles(em, nft, dir) {
  return {
    ORGANIZADOR_ROLE: await em.hasRole(await em.ORGANIZADOR_ROLE(), dir),
    ORACULO_ROLE: await em.hasRole(await em.ORACULO_ROLE(), dir),
    VERIFICADOR_ROLE: await em.hasRole(await em.VERIFICADOR_ROLE(), dir),
    VALIDADOR_ROLE: await nft.hasRole(await nft.VALIDADOR_ROLE(), dir),
  };
}

(async () => {
  const p = ethers.provider;
  console.log(`Red ${hre.network.name} · bloque ${await p.getBlockNumber()}\n`);
  for (const [n, a] of Object.entries(dep.contratos)) console.log(`  ${n.padEnd(19)} ${a}  ${(await p.getCode(a)).length > 2 ? "desplegado" : "SIN CÓDIGO"}`);
  const em = await ethers.getContractAt("EventManager", dep.contratos.EventManager);
  const nft = await ethers.getContractAt("EntradaNFT", dep.contratos.EntradaNFT);
  const mk = await ethers.getContractAt("ReventaMarketplace", dep.contratos.ReventaMarketplace);
  console.log(`\n  Entradas emitidas: ${Number(await nft.nextTokenId()) - 1} · publicaciones: ${Number(await mk.nextPublicacionId()) - 1}`);

  const mostrar = async (titulo, dir) => {
    const r = await roles(em, nft, dir);
    console.log(`\n${titulo}: ${dir}`);
    console.log(`  Saldo: ${ethers.formatEther(await p.getBalance(dir))} POL`);
    for (const [k, v] of Object.entries(r)) console.log(`  ${v ? "✔" : "✘"} ${k}`);
    return Object.values(r).every(Boolean);
  };

  await mostrar("Admin del despliegue (deployments/" + hre.network.name + ".json)", dep.admin);
  const [firmante] = await ethers.getSigners();
  if (!firmante) {
    console.log("\n✘ No hay PRIVATE_KEY en el .env: la interfaz no va a poder firmar.");
    return;
  }
  const ok = await mostrar("Billetera del .env (la que firma en la interfaz)", firmante.address);
  if (ok) {
    console.log("\n✔ Todo listo: npm run interfaz:amoy");
  } else {
    console.log(`\n✘ La billetera del .env no tiene todos los roles operativos. Opciones:`);
    console.log(`  1) Poner en el .env la PRIVATE_KEY de ${dep.admin} (la que desplegó).`);
    console.log(`  2) Que el dueño de esa clave ejecute: npm run roles:amoy  con ROLES_PARA=${firmante.address} en su .env`);
    console.log(`  3) Desplegar contratos nuevos con tu billetera: npm run deploy:amoy (necesita ~0,3 POL)`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
