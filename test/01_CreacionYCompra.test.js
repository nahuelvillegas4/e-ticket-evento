const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deploySistemaFixture } = require("./helpers");

describe("01. Creación de Eventos y Compra Primaria (CP-01 a CP-06)", function () {
  it("CP-01: [Happy Path] crearEvento registra el evento correctamente y queda Programado", async function () {
    const { organizador, artista, plataforma, eventManager, entradaNFT, DEFAULT_EVENT_PARAMS } =
      await loadFixture(deploySistemaFixture);

    const latestTime = await time.latest();
    const fechaEvento = latestTime + DEFAULT_EVENT_PARAMS.fechaHoraOffset;

    await expect(
      eventManager.connect(organizador).crearEvento(
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
      )
    )
      .to.emit(eventManager, "EventoCreado")
      .withArgs(
        DEFAULT_EVENT_PARAMS.idEvento,
        DEFAULT_EVENT_PARAMS.nombre,
        organizador.address,
        DEFAULT_EVENT_PARAMS.precioBase,
        DEFAULT_EVENT_PARAMS.capacidad
      );

    const evento = await eventManager.obtenerEvento(DEFAULT_EVENT_PARAMS.idEvento);
    expect(evento.nombre).to.equal(DEFAULT_EVENT_PARAMS.nombre);
    expect(evento.estado).to.equal(0); // Programado
    expect(evento.vendidas).to.equal(0);
    expect(evento.capacidad).to.equal(DEFAULT_EVENT_PARAMS.capacidad);
  });

  it("CP-02: [Happy Path] comprarEntrada acuña el NFT (Asignada) y retiene fondos en custodia", async function () {
    const {
      organizador,
      artista,
      plataforma,
      verificador,
      comprador1,
      eventManager,
      entradaNFT,
      eventManagerAddress,
      DEFAULT_EVENT_PARAMS,
      generarCompromiso,
      generarSalt,
      firmarVerificacionIdentidad,
    } = await loadFixture(deploySistemaFixture);

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

    const dni = 40123456;
    const salt = generarSalt();
    const compromiso = generarCompromiso(dni, salt);

    const firma = await firmarVerificacionIdentidad(
      verificador,
      eventManagerAddress,
      compromiso,
      comprador1.address,
      DEFAULT_EVENT_PARAMS.idEvento
    );

    await expect(
      eventManager.connect(comprador1).comprarEntrada(
        DEFAULT_EVENT_PARAMS.idEvento,
        compromiso,
        firma,
        { value: DEFAULT_EVENT_PARAMS.precioBase }
      )
    )
      .to.emit(eventManager, "EntradaComprada")
      .withArgs(DEFAULT_EVENT_PARAMS.idEvento, 1, comprador1.address, compromiso);

    // Verificaciones de estado
    expect(await entradaNFT.ownerOf(1)).to.equal(comprador1.address);
    const entrada = await entradaNFT.obtenerEntrada(1);
    expect(entrada.estado).to.equal(0); // Asignada
    expect(entrada.precioOriginal).to.equal(DEFAULT_EVENT_PARAMS.precioBase);
    expect(entrada.compromisoIdentidad).to.equal(compromiso);

    const evento = await eventManager.obtenerEvento(DEFAULT_EVENT_PARAMS.idEvento);
    expect(evento.vendidas).to.equal(1);
    expect(evento.balanceCustodia).to.equal(DEFAULT_EVENT_PARAMS.precioBase);
    expect(await entradaNFT.estadoEfectivo(1)).to.equal("Asignada");
  });

  it("CP-03: [Regla Negocio] Límite por persona impide comprar más del cupo por identidad", async function () {
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
    } = await loadFixture(deploySistemaFixture);

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
      2, // Límite por persona: 2
      DEFAULT_EVENT_PARAMS.maxTransferencias,
      DEFAULT_EVENT_PARAMS.requiereAdmision
    );

    const compromiso = generarCompromiso(40123456, generarSalt());
    const firma = await firmarVerificacionIdentidad(
      verificador,
      eventManagerAddress,
      compromiso,
      comprador1.address,
      DEFAULT_EVENT_PARAMS.idEvento
    );

    // Compra 1: OK
    await eventManager.connect(comprador1).comprarEntrada(
      DEFAULT_EVENT_PARAMS.idEvento,
      compromiso,
      firma,
      { value: DEFAULT_EVENT_PARAMS.precioBase }
    );

    // Compra 2: OK
    await eventManager.connect(comprador1).comprarEntrada(
      DEFAULT_EVENT_PARAMS.idEvento,
      compromiso,
      firma,
      { value: DEFAULT_EVENT_PARAMS.precioBase }
    );

    // Compra 3: Debe revertir por LimitePorPersonaExcedido
    await expect(
      eventManager.connect(comprador1).comprarEntrada(
        DEFAULT_EVENT_PARAMS.idEvento,
        compromiso,
        firma,
        { value: DEFAULT_EVENT_PARAMS.precioBase }
      )
    ).to.be.revertedWithCustomError(eventManager, "LimitePorPersonaExcedido");
  });

  it("CP-04: [Regla Negocio] Capacidad agotada revierte con CapacidadAgotada", async function () {
    const {
      organizador,
      artista,
      plataforma,
      verificador,
      comprador1,
      comprador2,
      eventManager,
      eventManagerAddress,
      DEFAULT_EVENT_PARAMS,
      generarCompromiso,
      generarSalt,
      firmarVerificacionIdentidad,
    } = await loadFixture(deploySistemaFixture);

    const latestTime = await time.latest();
    const fechaEvento = latestTime + DEFAULT_EVENT_PARAMS.fechaHoraOffset;

    // Capacidad: 1
    await eventManager.connect(organizador).crearEvento(
      DEFAULT_EVENT_PARAMS.idEvento,
      DEFAULT_EVENT_PARAMS.nombre,
      DEFAULT_EVENT_PARAMS.tipoEvento,
      fechaEvento,
      DEFAULT_EVENT_PARAMS.lugar,
      artista.address,
      plataforma.address,
      DEFAULT_EVENT_PARAMS.precioBase,
      1, // Capacidad = 1
      DEFAULT_EVENT_PARAMS.topeReventaBps,
      DEFAULT_EVENT_PARAMS.regaliaArtistaBps,
      DEFAULT_EVENT_PARAMS.comisionPlataformaBps,
      DEFAULT_EVENT_PARAMS.limitePorPersona,
      DEFAULT_EVENT_PARAMS.maxTransferencias,
      DEFAULT_EVENT_PARAMS.requiereAdmision
    );

    const comp1 = generarCompromiso(11111111, generarSalt());
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

    // Comprador 2 intenta comprar habiéndose agotado el cupo
    const comp2 = generarCompromiso(22222222, generarSalt());
    const firma2 = await firmarVerificacionIdentidad(
      verificador,
      eventManagerAddress,
      comp2,
      comprador2.address,
      DEFAULT_EVENT_PARAMS.idEvento
    );

    await expect(
      eventManager.connect(comprador2).comprarEntrada(
        DEFAULT_EVENT_PARAMS.idEvento,
        comp2,
        firma2,
        { value: DEFAULT_EVENT_PARAMS.precioBase }
      )
    ).to.be.revertedWithCustomError(eventManager, "CapacidadAgotada");
  });

  it("CP-05: [Regla Negocio] Monto incorrecto revierte con MontoIncorrecto", async function () {
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
    } = await loadFixture(deploySistemaFixture);

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

    const comp = generarCompromiso(33333333, generarSalt());
    const firma = await firmarVerificacionIdentidad(
      verificador,
      eventManagerAddress,
      comp,
      comprador1.address,
      DEFAULT_EVENT_PARAMS.idEvento
    );

    const pagoInsuficiente = DEFAULT_EVENT_PARAMS.precioBase - ethers.parseEther("0.01");

    await expect(
      eventManager.connect(comprador1).comprarEntrada(
        DEFAULT_EVENT_PARAMS.idEvento,
        comp,
        firma,
        { value: pagoInsuficiente }
      )
    ).to.be.revertedWithCustomError(eventManager, "MontoIncorrecto");
  });

  it("CP-06: [Seguridad] Identidad sin firma de verificador revierte con FirmaInvalida", async function () {
    const {
      organizador,
      artista,
      plataforma,
      otroUsuario,
      comprador1,
      eventManager,
      eventManagerAddress,
      DEFAULT_EVENT_PARAMS,
      generarCompromiso,
      generarSalt,
      firmarVerificacionIdentidad,
    } = await loadFixture(deploySistemaFixture);

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

    const comp = generarCompromiso(44444444, generarSalt());

    // Firma emitida por una cuenta NO autorizada (otroUsuario en vez de verificador)
    const firmaFalsa = await firmarVerificacionIdentidad(
      otroUsuario,
      eventManagerAddress,
      comp,
      comprador1.address,
      DEFAULT_EVENT_PARAMS.idEvento
    );

    await expect(
      eventManager.connect(comprador1).comprarEntrada(
        DEFAULT_EVENT_PARAMS.idEvento,
        comp,
        firmaFalsa,
        { value: DEFAULT_EVENT_PARAMS.precioBase }
      )
    ).to.be.revertedWithCustomError(eventManager, "FirmaInvalida");
  });
});
