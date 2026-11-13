/**
 * Otorga los roles operativos (organizador, oráculo, verificador y validador) a otra billetera.
 * Lo ejecuta quien tiene DEFAULT_ADMIN_ROLE (la billetera que desplegó los contratos).
 *
 *   En el .env del admin:  ROLES_PARA=0xDireccionQueVaAFirmarEnLaInterfaz
 *   npm run roles:amoy
 */
const hre = require("hardhat");
const { ethers } = hre;
const dep = require(`../deployments/${hre.network.name}.json`);

(async () => {
  const destino = process.env.ROLES_PARA;
  if (!destino || !ethers.isAddress(destino)) throw new Error("Definí ROLES_PARA=0x… en el .env con la dirección que va a recibir los roles.");
  const [admin] = await ethers.getSigners();
  if (!admin) throw new Error("Falta PRIVATE_KEY en el .env");
  const em = await ethers.getContractAt("EventManager", dep.contratos.EventManager);
  const nft = await ethers.getContractAt("EntradaNFT", dep.contratos.EntradaNFT);
  if (!(await em.hasRole(await em.DEFAULT_ADMIN_ROLE(), admin.address))) {
    throw new Error(`${admin.address} no es administrador de los contratos: tiene que ejecutarlo ${dep.admin}`);
  }
  const exp = hre.network.name === "amoy" ? "https://amoy.polygonscan.com/tx/" : "tx ";
  for (const [c, rol] of [[em, "ORGANIZADOR_ROLE"], [em, "ORACULO_ROLE"], [em, "VERIFICADOR_ROLE"], [nft, "VALIDADOR_ROLE"]]) {
    const r = await c[rol]();
    if (await c.hasRole(r, destino)) { console.log(`= ${rol} ya estaba otorgado`); continue; }
    const tx = await c.grantRole(r, destino);
    await tx.wait();
    console.log(`✔ ${rol} → ${destino} (${exp}${tx.hash})`);
  }
})().catch((e) => { console.error(e.message || e); process.exit(1); });
