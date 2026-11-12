const { ethers } = require("hardhat");

/**
 * Genera el compromiso de identidad seudonimizado keccak256(abi.encode(dni, salt)).
 * El DNI y el salt nunca se revelan on-chain.
 */
function generarCompromiso(dni, salt) {
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const encoded = abiCoder.encode(["uint256", "bytes32"], [dni, salt]);
  return ethers.keccak256(encoded);
}

/**
 * Genera un salt aleatorio en formato bytes32.
 */
function generarSalt() {
  return ethers.hexlify(ethers.randomBytes(32));
}

/**
 * Firma EIP-712 emitida por una entidad verificadora (Tribuna Segura / KYC)
 * para validar la asociación entre el comprador y su compromiso de identidad.
 */
async function firmarVerificacionIdentidad(verificadorSigner, eventManagerAddress, compromiso, compradorAddress, idEvento) {
  const network = await ethers.provider.getNetwork();
  const domain = {
    name: "EventManager",
    version: "1",
    chainId: network.chainId,
    verifyingContract: eventManagerAddress,
  };

  const types = {
    VerificarIdentidad: [
      { name: "compromiso", type: "bytes32" },
      { name: "comprador", type: "address" },
      { name: "idEvento", type: "uint256" },
    ],
  };

  const value = {
    compromiso,
    comprador: compradorAddress,
    idEvento,
  };

  return await verificadorSigner.signTypedData(domain, types, value);
}

/**
 * Firma EIP-712 del titular para generar el código QR dinámico de acceso al evento.
 */
async function firmarAccesoQR(titularSigner, entradaNFTAddress, tokenId, timestamp) {
  const network = await ethers.provider.getNetwork();
  const domain = {
    name: "EntradaNFT",
    version: "1",
    chainId: network.chainId,
    verifyingContract: entradaNFTAddress,
  };

  const types = {
    ValidarAcceso: [
      { name: "tokenId", type: "uint256" },
      { name: "timestamp", type: "uint64" },
    ],
  };

  const value = {
    tokenId,
    timestamp,
  };

  return await titularSigner.signTypedData(domain, types, value);
}

module.exports = {
  generarCompromiso,
  generarSalt,
  firmarVerificacionIdentidad,
  firmarAccesoQR,
};
