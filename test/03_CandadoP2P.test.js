const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deploySistemaFixture } = require("./helpers");

describe("03. Candado Antifraude y Bloqueo de Transferencias P2P (CP-14 y CP-15)", function () {
  async function setupConEntrada() {
    const fixture = await deploySistemaFixture();
    const {
      organizador,
      artista,
      plataforma,
      verificador,
      comprador1,
      eventManager,
      eventManagerAddress,
      DEFAULT_EVENT_PARAMS,
      generarCompromiso,
      generarSalt,
      firmarVerificacionIdentidad,
    } = fixture;

    const latestTime = await time.latest();
    const fechaEvento = latestTime + DEFAULT_EVENT_PARAMS.fechaHoraOffset;

    await eventManager.connect(organizador).crearEvento(
      DEFAULT_EVENT_PARAMS.idEvento,
      DEFAULT_EVENT_PARAMS.nombre,
      DEFAULT_EVENT_PARAMS.tipoEvento,
      fechaEvento,
      DEFAULT_EVENT_PARAMS.lugar,
      artista.address,
      plataforma.address,
      DEFAULT_EVENT_PARAMS.precioBase,
      DEFAULT_EVENT_PARAMS.capacidad,
      DEFAULT_EVENT_PARAMS.topeReventaBps,
      DEFAULT_EVENT_PARAMS.regaliaArtistaBps,
      DEFAULT_EVENT_PARAMS.comisionPlataformaBps,
      DEFAULT_EVENT_PARAMS.limitePorPersona,
      DEFAULT_EVENT_PARAMS.maxTransferencias,
      DEFAULT_EVENT_PARAMS.requiereAdmision
    );

    const comp1 = generarCompromiso(10000001, generarSalt());
    const firma1 = await firmarVerificacionIdentidad(
      verificador,
      eventManagerAddress,
      comp1,
      comprador1.address,
      DEFAULT_EVENT_PARAMS.idEvento
    );

    await eventManager.connect(comprador1).comprarEntrada(
      DEFAULT_EVENT_PARAMS.idEvento,
      comp1,
      firma1,
      { value: DEFAULT_EVENT_PARAMS.precioBase }
    );

    return { ...fixture, tokenId: 1 };
  }

  it("CP-14: [Seguridad] transferFrom directo entre usuarios revierte con TransferenciaDirectaBloqueada", async function () {
    const { comprador1, comprador2, entradaNFT, tokenId } = await loadFixture(setupConEntrada);

    await expect(
      entradaNFT.connect(comprador1).transferFrom(comprador1.address, comprador2.address, tokenId)
    ).to.be.revertedWithCustomError(entradaNFT, "TransferenciaDirectaBloqueada");
  });

  it("CP-15: [Seguridad] approve y setApprovalForAll revierten con TransferenciaDirectaBloqueada", async function () {
    const { comprador1, comprador2, entradaNFT, tokenId } = await loadFixture(setupConEntrada);

    await expect(
      entradaNFT.connect(comprador1).approve(comprador2.address, tokenId)
    ).to.be.revertedWithCustomError(entradaNFT, "TransferenciaDirectaBloqueada");

    await expect(
      entradaNFT.connect(comprador1).setApprovalForAll(comprador2.address, true)
    ).to.be.revertedWithCustomError(entradaNFT, "TransferenciaDirectaBloqueada");
  });
});
