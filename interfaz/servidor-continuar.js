/**
 * Igual que servidor.js, pero retoma los contratos desplegados en el último arranque
 * (deployments/interfaz-<red>.json) en lugar de desplegar nuevos. Útil si se reinicia
 * el servidor en medio de la demo.
 */
process.env.REUSAR_CONTRATOS = "1";
require("./servidor.js");
