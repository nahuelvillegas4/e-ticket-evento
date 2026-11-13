/**
 * Chequeo previo a la demo (solo lectura, no necesita PRIVATE_KEY):
 * contratos desplegados, roles de la billetera admin y saldo disponible.
 *   npm run chequear:amoy
 */
const hre = require("hardhat"); const { ethers } = hre;
const dep = require(`../deployments/${hre.network.name}.json`);
(async () => {
  const p = ethers.provider;
  console.log("bloque", await p.getBlockNumber());
  for (const [n, a] of Object.entries(dep.contratos)) console.log(n, a, (await p.getCode(a)).length > 2 ? "desplegado" : "SIN CODIGO");
  const em = await ethers.getContractAt("EventManager", dep.contratos.EventManager);
  const nft = await ethers.getContractAt("EntradaNFT", dep.contratos.EntradaNFT);
  const mk = await ethers.getContractAt("ReventaMarketplace", dep.contratos.ReventaMarketplace);
  const a = dep.admin;
  console.log("admin", a, "saldo", ethers.formatEther(await p.getBalance(a)), "POL");
  for (const r of ["ORGANIZADOR_ROLE","ORACULO_ROLE","VERIFICADOR_ROLE"]) console.log(r, await em.hasRole(await em[r](), a));
  console.log("VALIDADOR_ROLE", await nft.hasRole(await nft.VALIDADOR_ROLE(), a));
  console.log("entradas emitidas", Number(await nft.nextTokenId()) - 1, "· publicaciones", Number(await mk.nextPublicacionId()) - 1);
})();
