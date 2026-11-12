const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deploySistemaFixture } = require("./helpers");

describe("02. Reventa Regulada en Marketplace y Split de Fondos (CP-07 a CP-13)", function () {
  async function setupConEntradaComprada() {
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

  it("CP-07: [Happy Path] publicarReventa publica dentro del tope y transfiere NFT en custodia", async function () {
    const { comprador1, marketplace, entradaNFT, marketplaceAddress, DEFAULT_EVENT_PARAMS, tokenId } =
      await loadFixture(setupConEntradaComprada);

    // Precio original = 0.1 ETH. Tope = +20% -> 0.12 ETH. Publicamos a 0.115 ETH (115 wei proporcionales)
    const precioReventa = ethers.parseEther("0.115");

    await expect(marketplace.connect(comprador1).publicarReventa(tokenId, precioReventa))
      .to.emit(marketplace, "ReventaPublicada")
      .withArgs(1, tokenId, comprador1.address, precioReventa);

    // Verificaciones
    expect(await entradaNFT.ownerOf(tokenId)).to.equal(marketplaceAddress);
    const entrada = await entradaNFT.obtenerEntrada(tokenId);
    expect(entrada.estado).to.equal(1); // EnReventa
    expect(await entradaNFT.estadoEfectivo(tokenId)).to.equal("En reventa");

    const pub = await marketplace.obtenerPublicacion(1);
    expect(pub.vendedor).to.equal(comprador1.address);
    expect(pub.precioReventa).to.equal(precioReventa);
    expect(pub.estado).to.equal(0); // Activa
  });

  it("CP-08: [Regla Negocio] Exceso de tope revierte con PrecioSuperaTope", async function () {
    const { comprador1, marketplace, tokenId } = await loadFixture(setupConEntradaComprada);

    // Precio original = 0.1 ETH. Tope = 0.12 ETH (+20%). Intento a 0.15 ETH (+50%)
    const precioExcesivo = ethers.parseEther("0.15");

    await expect(
      marketplace.connect(comprador1).publicarReventa(tokenId, precioExcesivo)
    ).to.be.revertedWithCustomError(marketplace, "PrecioSuperaTope");
  });

  it("CP-09: [Happy Path] retirarPublicacion devuelve el NFT al titular y marca estado Asignada", async function () {
    const { comprador1, marketplace, entradaNFT, tokenId } = await loadFixture(setupConEntradaComprada);

    const precioReventa = ethers.parseEther("0.115");
    await marketplace.connect(comprador1).publicarReventa(tokenId, precioReventa);

    await expect(marketplace.connect(comprador1).retirarPublicacion(1))
      .to.emit(marketplace, "PublicacionRetirada")
      .withArgs(1, tokenId);

    expect(await entradaNFT.ownerOf(tokenId)).to.equal(comprador1.address);
    const entrada = await entradaNFT.obtenerEntrada(tokenId);
    expect(entrada.estado).to.equal(0); // Asignada
    expect(await entradaNFT.estadoEfectivo(tokenId)).to.equal("Asignada");

    const pub = await marketplace.obtenerPublicacion(1);
    expect(pub.estado).to.equal(2); // Retirada
  });

  it("CP-10: [Happy Path] revenderEntrada transfiere NFT y acredita splits (artista, plataforma, vendedor)", async function () {
    const {
      comprador1,
      comprador2,
      artista,
      plataforma,
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
    } = await loadFixture(setupConEntradaComprada);

    const precioReventa = ethers.parseEther("0.115"); // 115
    await marketplace.connect(comprador1).publicarReventa(tokenId, precioReventa);

    const comp2 = generarCompromiso(20000002, generarSalt());
    const firma2 = await firmarVerificacionIdentidad(
      verificador,
      eventManagerAddress,
      comp2,
      comprador2.address,
      DEFAULT_EVENT_PARAMS.idEvento
    );

    // Ejecución de la reventa
    await expect(
      marketplace.connect(comprador2).revenderEntrada(1, comp2, firma2, { value: precioReventa })
    )
      .to.emit(marketplace, "EntradaRevendida")
      .withArgs(1, tokenId, comprador1.address, comprador2.address, precioReventa);

    // Titularidad y estado
    expect(await entradaNFT.ownerOf(tokenId)).to.equal(comprador2.address);
    const entrada = await entradaNFT.obtenerEntrada(tokenId);
    expect(entrada.estado).to.equal(0); // Asignada
    expect(entrada.cantTransferencias).to.equal(1);
    expect(entrada.compromisoIdentidad).to.equal(comp2);

    // Split de pagos esperados:
    // 10% regalía artista = 0.0115 ETH
    // 5% comisión plataforma = 0.00575 ETH
    // Neto vendedor = 0.115 - 0.0115 - 0.00575 = 0.09775 ETH
    const regaliaEsperada = (precioReventa * 1000n) / 10000n;
    const comisionEsperada = (precioReventa * 500n) / 10000n;
    const netoEsperado = precioReventa - regaliaEsperada - comisionEsperada;

    expect(await eventManager.saldosPendientes(artista.address)).to.equal(regaliaEsperada);
    expect(await eventManager.saldosPendientes(plataforma.address)).to.equal(comisionEsperada);
    expect(await eventManager.saldosPendientes(comprador1.address)).to.equal(netoEsperado);
  });

  it("CP-11: [Regla Negocio] Límite por persona aplica en el mercado secundario", async function () {
    const {
      comprador1,
      comprador2,
      verificador,
      eventManager,
      marketplace,
      eventManagerAddress,
      DEFAULT_EVENT_PARAMS,
      tokenId,
      generarCompromiso,
      generarSalt,
      firmarVerificacionIdentidad,
    } = await loadFixture(setupConEntradaComprada);

    // Comprador 2 compra 2 entradas primarias (alcanza el límite de 2)
    const comp2 = generarCompromiso(20000002, generarSalt());
    const firma2 = await firmarVerificacionIdentidad(
      verificador,
      eventManagerAddress,
      comp2,
      comprador2.address,
      DEFAULT_EVENT_PARAMS.idEvento
    );

    await eventManager.connect(comprador2).comprarEntrada(
      DEFAULT_EVENT_PARAMS.idEvento,
      comp2,
      firma2,
      { value: DEFAULT_EVENT_PARAMS.precioBase }
    );
    await eventManager.connect(comprador2).comprarEntrada(
      DEFAULT_EVENT_PARAMS.idEvento,
      comp2,
      firma2,
      { value: DEFAULT_EVENT_PARAMS.precioBase }
    );

    // Comprador 1 publica su entrada
    const precioReventa = ethers.parseEther("0.115");
    await marketplace.connect(comprador1).publicarReventa(tokenId, precioReventa);

    // Comprador 2 intenta comprar una 3ra entrada por reventa: debe revertir
    await expect(
      marketplace.connect(comprador2).revenderEntrada(1, comp2, firma2, { value: precioReventa })
    ).to.be.revertedWithCustomError(eventManager, "LimitePorPersonaExcedido");
  });

  it("CP-12: [Regla Negocio] Máximo de transferencias superado revierte con MaxTransferenciasAlcanzado", async function () {
    const {
      comprador1,
      comprador2,
      comprador3,
      verificador,
      marketplace,
      eventManagerAddress,
      DEFAULT_EVENT_PARAMS,
      tokenId,
      generarCompromiso,
      generarSalt,
      firmarVerificacionIdentidad,
    } = await loadFixture(setupConEntradaComprada);

    const precioReventa = ethers.parseEther("0.11");

    // Reventa 1: Comprador 1 -> Comprador 2
    await marketplace.connect(comprador1).publicarReventa(tokenId, precioReventa);
    const comp2 = generarCompromiso(22222222, generarSalt());
    const firma2 = await firmarVerificacionIdentidad(
      verificador,
      eventManagerAddress,
      comp2,
      comprador2.address,
      DEFAULT_EVENT_PARAMS.idEvento
    );
    await marketplace.connect(comprador2).revenderEntrada(1, comp2, firma2, { value: precioReventa });

    // Reventa 2: Comprador 2 -> Comprador 3 (alcanza maxTransferencias = 2)
    await marketplace.connect(comprador2).publicarReventa(tokenId, precioReventa);
    const comp3 = generarCompromiso(33333333, generarSalt());
    const firma3 = await firmarVerificacionIdentidad(
      verificador,
      eventManagerAddress,
      comp3,
      comprador3.address,
      DEFAULT_EVENT_PARAMS.idEvento
    );
    await marketplace.connect(comprador3).revenderEntrada(2, comp3, firma3, { value: precioReventa });

    // Intento de Reventa 3: Comprador 3 intenta publicar habiendo alcanzado el máximo (2)
    await expect(
      marketplace.connect(comprador3).publicarReventa(tokenId, precioReventa)
    ).to.be.revertedWithCustomError(marketplace, "MaxTransferenciasAlcanzado");
  });

  it("CP-13: [Regla Negocio] Pago incorrecto en reventa revierte con MontoIncorrecto", async function () {
    const {
      comprador1,
      comprador2,
      verificador,
      marketplace,
      eventManagerAddress,
      DEFAULT_EVENT_PARAMS,
      tokenId,
      generarCompromiso,
      generarSalt,
      firmarVerificacionIdentidad,
    } = await loadFixture(setupConEntradaComprada);

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

    // Paga 0.10 ETH en vez de 0.115 ETH
    const pagoMenor = ethers.parseEther("0.10");

    await expect(
      marketplace.connect(comprador2).revenderEntrada(1, comp2, firma2, { value: pagoMenor })
    ).to.be.revertedWithCustomError(marketplace, "MontoIncorrecto");
  });
});
