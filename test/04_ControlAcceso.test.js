const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deploySistemaFixture } = require("./helpers");

describe("04. Control de Acceso y QR Dinámico en Puerta (CP-16 a CP-19)", function () {
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

    return { ...fixture, comp1, tokenId: 1 };
  }

  it("CP-16: [Permisos] validarIngreso invocado por usuario sin VALIDADOR_ROLE revierte", async function () {
    const { comprador1, otroUsuario, entradaNFT, entradaNFTAddress, comp1, tokenId, firmarAccesoQR } =
      await loadFixture(setupConEntrada);

    const timestampActual = await time.latest();
    const firmaQR = await firmarAccesoQR(comprador1, entradaNFTAddress, tokenId, timestampActual);

    await expect(
      entradaNFT.connect(otroUsuario).validarIngreso(tokenId, comp1, timestampActual, firmaQR)
    ).to.be.revertedWithCustomError(entradaNFT, "AccessControlUnauthorizedAccount");
  });

  it("CP-17: [Happy Path] validarIngreso valida compromiso y QR dinámico, pasando a Utilizada", async function () {
    const { comprador1, validador, entradaNFT, entradaNFTAddress, comp1, tokenId, firmarAccesoQR } =
      await loadFixture(setupConEntrada);

    const timestampActual = await time.latest();
    const firmaQR = await firmarAccesoQR(comprador1, entradaNFTAddress, tokenId, timestampActual);

    await expect(
      entradaNFT.connect(validador).validarIngreso(tokenId, comp1, timestampActual, firmaQR)
    )
      .to.emit(entradaNFT, "IngresoValidado")
      .withArgs(tokenId, comprador1.address, (t) => t >= timestampActual);

    const entrada = await entradaNFT.obtenerEntrada(tokenId);
    expect(entrada.estado).to.equal(2); // Utilizada
    expect(entrada.fechaValidacion).to.be.gt(0);
    expect(await entradaNFT.estadoEfectivo(tokenId)).to.equal("Utilizada");
  });

  it("CP-18: [Regla Negocio] Replay en puerta revierte con EntradaNoValidaParaIngreso", async function () {
    const { comprador1, validador, entradaNFT, entradaNFTAddress, comp1, tokenId, firmarAccesoQR } =
      await loadFixture(setupConEntrada);

    const timestampActual = await time.latest();
    const firmaQR = await firmarAccesoQR(comprador1, entradaNFTAddress, tokenId, timestampActual);

    // Primer ingreso: OK
    await entradaNFT.connect(validador).validarIngreso(tokenId, comp1, timestampActual, firmaQR);

    // Segundo intento con la misma entrada ya usada: Revert
    await expect(
      entradaNFT.connect(validador).validarIngreso(tokenId, comp1, timestampActual, firmaQR)
    ).to.be.revertedWithCustomError(entradaNFT, "EntradaNoValidaParaIngreso");
  });

  it("CP-19: [Seguridad] QR expirado (> 60s) o firma de otra cuenta revierte con QRExpirado / FirmaInvalida", async function () {
    const {
      comprador1,
      otroUsuario,
      validador,
      entradaNFT,
      entradaNFTAddress,
      comp1,
      tokenId,
      firmarAccesoQR,
    } = await loadFixture(setupConEntrada);

    // Caso A: QR viejo (timestamp de hace 10 minutos)
    const timestampViejo = (await time.latest()) - 600;
    const firmaVieja = await firmarAccesoQR(comprador1, entradaNFTAddress, tokenId, timestampViejo);

    await expect(
      entradaNFT.connect(validador).validarIngreso(tokenId, comp1, timestampViejo, firmaVieja)
    ).to.be.revertedWithCustomError(entradaNFT, "QRExpirado");

    // Caso B: QR firmado por un impostor (otroUsuario en lugar del titular comprador1)
    const timestampValido = await time.latest();
    const firmaImpostor = await firmarAccesoQR(otroUsuario, entradaNFTAddress, tokenId, timestampValido);

    await expect(
      entradaNFT.connect(validador).validarIngreso(tokenId, comp1, timestampValido, firmaImpostor)
    ).to.be.revertedWithCustomError(entradaNFT, "FirmaInvalida");
  });
});
