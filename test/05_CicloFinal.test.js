const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deploySistemaFixture } = require("./helpers");

describe("05. Ciclo Final: Cancelación, Cierre, Liquidación y Seguridad (CP-20 a CP-27)", function () {
  async function setupConEventoYEntrada() {
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

    return { ...fixture, comp1, tokenId: 1, fechaEvento };
  }

  it("CP-20: [Permisos] Cierre de evento por organizador sin ORACULO_ROLE revierte", async function () {
    const { organizador, eventManager, DEFAULT_EVENT_PARAMS } = await loadFixture(setupConEventoYEntrada);

    await expect(
      eventManager.connect(organizador).cerrarEvento(DEFAULT_EVENT_PARAMS.idEvento)
    ).to.be.revertedWithCustomError(eventManager, "AccessControlUnauthorizedAccount");
  });

  it("CP-21: [Cancelación] cancelarEvento por oráculo y reclamo de reembolso por el titular actual", async function () {
    const {
      oraculo,
      comprador1,
      comprador2,
      verificador,
      eventManager,
      marketplace,
      entradaNFT,
      eventManagerAddress,
      DEFAULT_EVENT_PARAMS,
      tokenId,
      generarCompromiso,
      generarSalt,
      firmarVerificacionIdentidad,
    } = await loadFixture(setupConEventoYEntrada);

    // Reventa a Comprador 2
    const precioReventa = ethers.parseEther("0.115");
    await marketplace.connect(comprador1).publicarReventa(tokenId, precioReventa);

    const comp2 = generarCompromiso(20000002, generarSalt());
    const firma2 = await firmarVerificacionIdentidad(
      verificador,
      eventManagerAddress,
      comp2,
      comprador2.address,
      DEFAULT_EVENT_PARAMS.idEvento
    );
    await marketplace.connect(comprador2).revenderEntrada(1, comp2, firma2, { value: precioReventa });

    // Oráculo cancela el evento
    await expect(eventManager.connect(oraculo).cancelarEvento(DEFAULT_EVENT_PARAMS.idEvento))
      .to.emit(eventManager, "EventoCancelado")
      .withArgs(DEFAULT_EVENT_PARAMS.idEvento);

    // Comprador 2 (titular actual) reclama reembolso
    await expect(eventManager.connect(comprador2).reclamarReembolso(tokenId))
      .to.emit(eventManager, "ReembolsoReclamado")
      .withArgs(tokenId, comprador2.address, DEFAULT_EVENT_PARAMS.precioBase);

    // Saldo acreditado para retiro
    expect(await eventManager.saldosPendientes(comprador2.address)).to.equal(DEFAULT_EVENT_PARAMS.precioBase);
    const entrada = await entradaNFT.obtenerEntrada(tokenId);
    expect(entrada.estado).to.equal(3); // Reembolsada
    expect(await entradaNFT.estadoEfectivo(tokenId)).to.equal("Reembolsada");
  });

  it("CP-22: [Cancelación] Doble reembolso sobre la misma entrada revierte con YaReembolsada", async function () {
    const { oraculo, comprador1, eventManager, DEFAULT_EVENT_PARAMS, tokenId } =
      await loadFixture(setupConEventoYEntrada);

    await eventManager.connect(oraculo).cancelarEvento(DEFAULT_EVENT_PARAMS.idEvento);
    await eventManager.connect(comprador1).reclamarReembolso(tokenId);

    await expect(
      eventManager.connect(comprador1).reclamarReembolso(tokenId)
    ).to.be.revertedWithCustomError(eventManager, "YaReembolsada");
  });

  it("CP-23: [Cancelación] Reembolso de entrada en reventa activa acredita al vendedor y cierra publicación", async function () {
    const { oraculo, comprador1, eventManager, marketplace, entradaNFT, DEFAULT_EVENT_PARAMS, tokenId } =
      await loadFixture(setupConEventoYEntrada);

    const precioReventa = ethers.parseEther("0.115");
    await marketplace.connect(comprador1).publicarReventa(tokenId, precioReventa);

    // Evento cancelado mientras la entrada está en el marketplace
    await eventManager.connect(oraculo).cancelarEvento(DEFAULT_EVENT_PARAMS.idEvento);

    // El vendedor reclama directamente el reembolso
    await expect(eventManager.connect(comprador1).reclamarReembolso(tokenId))
      .to.emit(eventManager, "ReembolsoReclamado")
      .withArgs(tokenId, comprador1.address, DEFAULT_EVENT_PARAMS.precioBase);

    expect(await eventManager.saldosPendientes(comprador1.address)).to.equal(DEFAULT_EVENT_PARAMS.precioBase);
    const entrada = await entradaNFT.obtenerEntrada(tokenId);
    expect(entrada.estado).to.equal(3); // Reembolsada

    const pub = await marketplace.obtenerPublicacion(1);
    expect(pub.estado).to.equal(2); // Retirada/Cerrada

    // El NFT reembolsado vuelve al vendedor y no queda en custodia del marketplace
    expect(await entradaNFT.ownerOf(tokenId)).to.equal(comprador1.address);
  });

  it("CP-24: [Liquidación] Cierre de evento antes de transcurrido el margen revierte con FueraDeTermino", async function () {
    const { oraculo, eventManager, DEFAULT_EVENT_PARAMS } = await loadFixture(setupConEventoYEntrada);

    // Aún no transcurrió fechaHora + margen
    await expect(
      eventManager.connect(oraculo).cerrarEvento(DEFAULT_EVENT_PARAMS.idEvento)
    ).to.be.revertedWithCustomError(eventManager, "FueraDeTermino");
  });

  it("CP-25: [Liquidación] cerrarEvento tras margen libera fondos y entradas sin usar quedan Vencida", async function () {
    const { oraculo, organizador, eventManager, entradaNFT, DEFAULT_EVENT_PARAMS, tokenId, fechaEvento } =
      await loadFixture(setupConEventoYEntrada);

    // Avanzamos el tiempo: fechaEvento + margen (24h) + 1 hora
    await time.increaseTo(fechaEvento + 25 * 3600);

    await expect(eventManager.connect(oraculo).cerrarEvento(DEFAULT_EVENT_PARAMS.idEvento))
      .to.emit(eventManager, "EventoCerrado")
      .withArgs(DEFAULT_EVENT_PARAMS.idEvento, organizador.address, DEFAULT_EVENT_PARAMS.precioBase);

    // Fondos acreditados al organizador
    expect(await eventManager.saldosPendientes(organizador.address)).to.equal(DEFAULT_EVENT_PARAMS.precioBase);

    // Estado efectivo del NFT sin uso pasa lógicamente a "Vencida"
    expect(await entradaNFT.estadoEfectivo(tokenId)).to.equal("Vencida");
  });

  it("CP-26: [Liquidación] retirarFondos liquida saldos a billeteras y segundo retiro revierte SinSaldo", async function () {
    const { oraculo, organizador, eventManager, DEFAULT_EVENT_PARAMS, fechaEvento } =
      await loadFixture(setupConEventoYEntrada);

    await time.increaseTo(fechaEvento + 25 * 3600);
    await eventManager.connect(oraculo).cerrarEvento(DEFAULT_EVENT_PARAMS.idEvento);

    const saldoEsperado = DEFAULT_EVENT_PARAMS.precioBase;

    // Primer retiro: confirma transferencia de ether
    await expect(eventManager.connect(organizador).retirarFondos()).to.changeEtherBalances(
      [eventManager, organizador],
      [-saldoEsperado, saldoEsperado]
    );

    expect(await eventManager.saldosPendientes(organizador.address)).to.equal(0);

    // Segundo retiro: sin saldo
    await expect(
      eventManager.connect(organizador).retirarFondos()
    ).to.be.revertedWithCustomError(eventManager, "SinSaldo");
  });

  it("CP-27: [Seguridad] Contrato atacante intenta reentrar en retirarFondos y la EVM revierte", async function () {
    const { eventManager, eventManagerAddress, marketplaceAddress } = await loadFixture(setupConEventoYEntrada);

    // Desplegar contrato atacante
    const AtacanteFactory = await ethers.getContractFactory("Atacante");
    const atacante = await AtacanteFactory.deploy(eventManagerAddress);
    await atacante.waitForDeployment();
    const atacanteAddress = await atacante.getAddress();

    // Acreditamos saldo al atacante usando la cuenta con rol MARKETPLACE_ROLE (o admin)
    // Para simular que el atacante tiene fondos por cobrar
    const [admin] = await ethers.getSigners();
    const MARKETPLACE_ROLE = await eventManager.MARKETPLACE_ROLE();
    await eventManager.grantRole(MARKETPLACE_ROLE, admin.address);

    const montoAcreditar = ethers.parseEther("0.1");
    await eventManager.connect(admin).acreditar(atacanteAddress, { value: montoAcreditar });

    // El atacante inicia el retiro esperando reentrar
    // La reentrancia es bloqueada por ReentrancyGuard o CEI provocando fallo de transferencia
    await expect(atacante.iniciarAtaqueRetiro()).to.be.reverted;

    // El saldo retenido en eventManager permanece intacto
    expect(await eventManager.saldosPendientes(atacanteAddress)).to.equal(montoAcreditar);
  });
});
