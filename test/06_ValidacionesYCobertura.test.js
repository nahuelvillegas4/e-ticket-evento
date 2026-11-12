const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deploySistemaFixture } = require("./helpers");

describe("06. Validaciones Exhaustivas de Borde y Cobertura de Ramas", function () {
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

  describe("EntradaNFT: Permisos, Tokens Inexistentes y Ramas de Validación", function () {
    it("Rechaza llamadas sin rol en funciones administrativas y de operador", async function () {
      const { admin, otroUsuario, comprador1, entradaNFT, comp1, tokenId } =
        await loadFixture(setupConEventoYEntrada);

      await expect(
        entradaNFT.connect(otroUsuario).setEventManager(otroUsuario.address)
      ).to.be.revertedWithCustomError(entradaNFT, "AccessControlUnauthorizedAccount");

      await expect(
        entradaNFT.connect(otroUsuario).mint(otroUsuario.address, 1, 100, comp1, otroUsuario.address, 500)
      ).to.be.revertedWithCustomError(entradaNFT, "AccessControlUnauthorizedAccount");

      await expect(
        entradaNFT.connect(otroUsuario).actualizarCompromisoYTransferencias(tokenId, comp1)
      ).to.be.revertedWithCustomError(entradaNFT, "AccessControlUnauthorizedAccount");

      await expect(
        entradaNFT.connect(otroUsuario).cambiarEstado(tokenId, 2)
      ).to.be.revertedWithCustomError(entradaNFT, "AccessControlUnauthorizedAccount");

      await expect(
        entradaNFT.connect(otroUsuario).transferenciaRegulada(comprador1.address, otroUsuario.address, tokenId)
      ).to.be.revertedWithCustomError(entradaNFT, "AccessControlUnauthorizedAccount");

      // Otorgar OPERADOR_ROLE a admin para probar validaciones internas con rol válido
      const OPERADOR_ROLE = await entradaNFT.OPERADOR_ROLE();
      await entradaNFT.connect(admin).grantRole(OPERADOR_ROLE, admin.address);

      await expect(
        entradaNFT.connect(admin).actualizarCompromisoYTransferencias(999, comp1)
      ).to.be.revertedWithCustomError(entradaNFT, "TokenNoExiste");

      await expect(
        entradaNFT.connect(admin).cambiarEstado(999, 2)
      ).to.be.revertedWithCustomError(entradaNFT, "TokenNoExiste");

      await expect(
        entradaNFT.connect(admin).transferenciaRegulada(otroUsuario.address, admin.address, tokenId)
      ).to.be.revertedWithCustomError(entradaNFT, "TransferenciaDirectaBloqueada");
    });

    it("Cubre todas las ramas de validarIngreso, estadoEfectivo, obtenerEntrada y supportsInterface", async function () {
      const {
        admin,
        validador,
        oraculo,
        comprador1,
        entradaNFT,
        eventManager,
        entradaNFTAddress,
        DEFAULT_EVENT_PARAMS,
        comp1,
        tokenId,
        generarCompromiso,
        generarSalt,
        firmarAccesoQR,
      } = await loadFixture(setupConEventoYEntrada);

      const ahora = await time.latest();
      const firmaValida = await firmarAccesoQR(comprador1, entradaNFTAddress, tokenId, ahora);

      // Token inexistente en validarIngreso, estadoEfectivo y obtenerEntrada
      await expect(
        entradaNFT.connect(validador).validarIngreso(999, comp1, ahora, firmaValida)
      ).to.be.revertedWithCustomError(entradaNFT, "TokenNoExiste");

      await expect(entradaNFT.estadoEfectivo(999)).to.be.revertedWithCustomError(entradaNFT, "TokenNoExiste");
      await expect(entradaNFT.obtenerEntrada(999)).to.be.revertedWithCustomError(entradaNFT, "TokenNoExiste");

      // Compromiso distinto al registrado
      const otroComp = generarCompromiso(99999999, generarSalt());
      await expect(
        entradaNFT.connect(validador).validarIngreso(tokenId, otroComp, ahora, firmaValida)
      ).to.be.revertedWithCustomError(entradaNFT, "CompromisoNoCoincide");

      // Timestamp futuro (> block.timestamp + 5)
      const timestampFuturo = ahora + 100;
      const firmaFutura = await firmarAccesoQR(comprador1, entradaNFTAddress, tokenId, timestampFuturo);
      await expect(
        entradaNFT.connect(validador).validarIngreso(tokenId, comp1, timestampFuturo, firmaFutura)
      ).to.be.revertedWithCustomError(entradaNFT, "QRExpirado");

      // Rama con eventManager == address(0) en estadoEfectivo y validarIngreso
      await entradaNFT.connect(admin).setEventManager(ethers.ZeroAddress);
      expect(await entradaNFT.estadoEfectivo(tokenId)).to.equal("Asignada");

      // Restaurar eventManager y probar validarIngreso con evento Cancelado
      await entradaNFT.connect(admin).setEventManager(await eventManager.getAddress());
      await eventManager.connect(oraculo).cancelarEvento(DEFAULT_EVENT_PARAMS.idEvento);

      const ahora2 = await time.latest();
      const firmaValida2 = await firmarAccesoQR(comprador1, entradaNFTAddress, tokenId, ahora2);
      await expect(
        entradaNFT.connect(validador).validarIngreso(tokenId, comp1, ahora2, firmaValida2)
      ).to.be.revertedWithCustomError(entradaNFT, "EventoNoProgramado");

      // Validar ingreso sin eventManager configurado
      await entradaNFT.connect(admin).setEventManager(ethers.ZeroAddress);
      const ahora3 = await time.latest();
      const firmaValida3 = await firmarAccesoQR(comprador1, entradaNFTAddress, tokenId, ahora3);
      await entradaNFT.connect(validador).validarIngreso(tokenId, comp1, ahora3, firmaValida3);
      expect(await entradaNFT.estadoEfectivo(tokenId)).to.equal("Utilizada");

      // supportsInterface (ERC-721 y ERC-2981)
      expect(await entradaNFT.supportsInterface("0x80ac58cd")).to.equal(true);
      expect(await entradaNFT.supportsInterface("0x2a55205a")).to.equal(true);
    });
  });

  describe("EventManager: Validaciones de Creación, Ciclo de Vida, Reembolsos y Reentrancia", function () {
    it("Valida parámetros de constructor, setMarketplace y crearEvento", async function () {
      const {
        admin,
        organizador,
        artista,
        plataforma,
        otroUsuario,
        eventManager,
        DEFAULT_EVENT_PARAMS,
        fechaEvento,
      } = await loadFixture(setupConEventoYEntrada);

      const EventManagerFactory = await ethers.getContractFactory("EventManager");
      await expect(EventManagerFactory.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        eventManager,
        "DireccionInvalida"
      );

      await expect(
        eventManager.connect(otroUsuario).setMarketplace(otroUsuario.address)
      ).to.be.revertedWithCustomError(eventManager, "AccessControlUnauthorizedAccount");

      await expect(
        eventManager.connect(admin).setMarketplace(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(eventManager, "DireccionInvalida");

      // crearEvento sin rol
      await expect(
        eventManager
          .connect(otroUsuario)
          .crearEvento(2, "E2", 0, fechaEvento, "L", artista.address, plataforma.address, 100, 10, 1000, 500, 500, 2, 2, false)
      ).to.be.revertedWithCustomError(eventManager, "AccessControlUnauthorizedAccount");

      // idEvento duplicado
      await expect(
        eventManager
          .connect(organizador)
          .crearEvento(
            DEFAULT_EVENT_PARAMS.idEvento,
            "Dup",
            0,
            fechaEvento,
            "L",
            artista.address,
            plataforma.address,
            100,
            10,
            1000,
            500,
            500,
            2,
            2,
            false
          )
      ).to.be.revertedWithCustomError(eventManager, "EventoYaExiste");

      // Fecha pasada
      const ahora = await time.latest();
      await expect(
        eventManager
          .connect(organizador)
          .crearEvento(2, "E2", 0, ahora - 10, "L", artista.address, plataforma.address, 100, 10, 1000, 500, 500, 2, 2, false)
      ).to.be.revertedWithCustomError(eventManager, "FechaInvalida");

      // Capacidad 0
      await expect(
        eventManager
          .connect(organizador)
          .crearEvento(2, "E2", 0, fechaEvento, "L", artista.address, plataforma.address, 100, 0, 1000, 500, 500, 2, 2, false)
      ).to.be.revertedWithCustomError(eventManager, "CapacidadInvalida");

      // Precio 0
      await expect(
        eventManager
          .connect(organizador)
          .crearEvento(2, "E2", 0, fechaEvento, "L", artista.address, plataforma.address, 0, 10, 1000, 500, 500, 2, 2, false)
      ).to.be.revertedWithCustomError(eventManager, "PrecioInvalido");

      // Direcciones nulas (artista y plataforma)
      await expect(
        eventManager
          .connect(organizador)
          .crearEvento(2, "E2", 0, fechaEvento, "L", ethers.ZeroAddress, plataforma.address, 100, 10, 1000, 500, 500, 2, 2, false)
      ).to.be.revertedWithCustomError(eventManager, "DireccionInvalida");

      await expect(
        eventManager
          .connect(organizador)
          .crearEvento(2, "E2", 0, fechaEvento, "L", artista.address, ethers.ZeroAddress, 100, 10, 1000, 500, 500, 2, 2, false)
      ).to.be.revertedWithCustomError(eventManager, "DireccionInvalida");

      // Suma de porcentajes >= 10000
      await expect(
        eventManager
          .connect(organizador)
          .crearEvento(2, "E2", 0, fechaEvento, "L", artista.address, plataforma.address, 100, 10, 1000, 6000, 4000, 2, 2, false)
      ).to.be.revertedWithCustomError(eventManager, "SumaPorcentajesInvalida");

      // Límite por persona 0
      await expect(
        eventManager
          .connect(organizador)
          .crearEvento(2, "E2", 0, fechaEvento, "L", artista.address, plataforma.address, 100, 10, 1000, 500, 500, 0, 2, false)
      ).to.be.revertedWithCustomError(eventManager, "LimitePorPersonaInvalido");
    });

    it("Valida bordes en comprarEntrada, cancelarEvento, cerrarEvento, reclamarReembolso y acreditar", async function () {
      const {
        admin,
        oraculo,
        validador,
        comprador1,
        comprador2,
        otroUsuario,
        eventManager,
        marketplace,
        entradaNFT,
        entradaNFTAddress,
        DEFAULT_EVENT_PARAMS,
        comp1,
        tokenId,
        fechaEvento,
        firmarAccesoQR,
      } = await loadFixture(setupConEventoYEntrada);

      // comprarEntrada en evento inexistente
      await expect(
        eventManager.connect(comprador1).comprarEntrada(999, comp1, "0x", { value: 100 })
      ).to.be.revertedWithCustomError(eventManager, "EventoInexistente");

      // reclamarReembolso cuando el evento aún está Programado
      await expect(
        eventManager.connect(comprador1).reclamarReembolso(tokenId)
      ).to.be.revertedWithCustomError(eventManager, "EventoNoProgramado");

      // cancelarEvento sin rol y sobre evento inexistente
      await expect(
        eventManager.connect(otroUsuario).cancelarEvento(DEFAULT_EVENT_PARAMS.idEvento)
      ).to.be.revertedWithCustomError(eventManager, "AccessControlUnauthorizedAccount");

      await expect(
        eventManager.connect(oraculo).cancelarEvento(999)
      ).to.be.revertedWithCustomError(eventManager, "EventoInexistente");

      // cerrarEvento sobre evento inexistente
      await expect(
        eventManager.connect(oraculo).cerrarEvento(999)
      ).to.be.revertedWithCustomError(eventManager, "EventoInexistente");

      // Validar ingreso de tokenId 1 y luego cancelar para probar reembolso de entrada Utilizada
      const ahora = await time.latest();
      const firmaQR = await firmarAccesoQR(comprador1, entradaNFTAddress, tokenId, ahora);
      await entradaNFT.connect(validador).validarIngreso(tokenId, comp1, ahora, firmaQR);

      await eventManager.connect(oraculo).cancelarEvento(DEFAULT_EVENT_PARAMS.idEvento);

      // comprarEntrada, cancelarEvento y cerrarEvento cuando ya está Cancelado
      await expect(
        eventManager.connect(comprador1).comprarEntrada(DEFAULT_EVENT_PARAMS.idEvento, comp1, "0x", {
          value: DEFAULT_EVENT_PARAMS.precioBase,
        })
      ).to.be.revertedWithCustomError(eventManager, "EventoNoProgramado");

      await expect(
        eventManager.connect(oraculo).cancelarEvento(DEFAULT_EVENT_PARAMS.idEvento)
      ).to.be.revertedWithCustomError(eventManager, "EventoNoProgramado");

      await expect(
        eventManager.connect(oraculo).cerrarEvento(DEFAULT_EVENT_PARAMS.idEvento)
      ).to.be.revertedWithCustomError(eventManager, "EventoNoProgramado");

      // Reembolso de entrada ya Utilizada
      await expect(
        eventManager.connect(comprador1).reclamarReembolso(tokenId)
      ).to.be.revertedWithCustomError(eventManager, "EntradaNoValidaParaIngreso");

      // Permisos y validaciones en registrarTransferenciaIdentidad y acreditar
      await expect(
        eventManager.connect(otroUsuario).registrarTransferenciaIdentidad(1, comp1, comp1, comprador2.address, "0x")
      ).to.be.revertedWithCustomError(eventManager, "AccessControlUnauthorizedAccount");

      await expect(
        eventManager.connect(otroUsuario).acreditar(otroUsuario.address, { value: 100 })
      ).to.be.revertedWithCustomError(eventManager, "AccessControlUnauthorizedAccount");

      const MARKETPLACE_ROLE = await eventManager.MARKETPLACE_ROLE();
      await eventManager.connect(admin).grantRole(MARKETPLACE_ROLE, admin.address);

      await expect(
        eventManager.connect(admin).acreditar(ethers.ZeroAddress, { value: 100 })
      ).to.be.revertedWithCustomError(eventManager, "DireccionInvalida");
    });

    it("Valida FueraDeTermino en compra y cancelación, NoEsTitular en reembolsos y ataques de reentrancia en compra/reembolso", async function () {
      const {
        admin,
        organizador,
        artista,
        plataforma,
        oraculo,
        verificador,
        comprador1,
        comprador2,
        otroUsuario,
        eventManager,
        marketplace,
        eventManagerAddress,
        DEFAULT_EVENT_PARAMS,
        comp1,
        tokenId,
        fechaEvento,
        generarCompromiso,
        generarSalt,
        firmarVerificacionIdentidad,
      } = await loadFixture(setupConEventoYEntrada);

      // Comprador 1 compra una segunda entrada y la publica en reventa
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
      await marketplace.connect(comprador1).publicarReventa(2, DEFAULT_EVENT_PARAMS.precioBase);

      // Reentrada durante comprarEntrada hacia comprarEntrada (modo 2) y reclamarReembolso (modo 3)
      const AtacanteFactory = await ethers.getContractFactory("Atacante");
      const atacante = await AtacanteFactory.deploy(eventManagerAddress);
      await atacante.waitForDeployment();
      const atacanteAddr = await atacante.getAddress();

      const compAtacante = generarCompromiso(77777777, generarSalt());
      const firmaAtacante = await firmarVerificacionIdentidad(
        verificador,
        eventManagerAddress,
        compAtacante,
        atacanteAddr,
        DEFAULT_EVENT_PARAMS.idEvento
      );

      await expect(
        atacante.iniciarAtaqueCompra(DEFAULT_EVENT_PARAMS.idEvento, compAtacante, firmaAtacante, 2, {
          value: DEFAULT_EVENT_PARAMS.precioBase,
        })
      ).to.be.revertedWithCustomError(eventManager, "ReentrancyGuardReentrantCall");

      await expect(
        atacante.iniciarAtaqueCompra(DEFAULT_EVENT_PARAMS.idEvento, compAtacante, firmaAtacante, 3, {
          value: DEFAULT_EVENT_PARAMS.precioBase,
        })
      ).to.be.revertedWithCustomError(eventManager, "ReentrancyGuardReentrantCall");

      // Cancelar evento y probar NoEsTitular tanto en Asignada (tokenId 1) como en EnReventa (tokenId 2)
      await eventManager.connect(oraculo).cancelarEvento(DEFAULT_EVENT_PARAMS.idEvento);

      await expect(
        eventManager.connect(otroUsuario).reclamarReembolso(1)
      ).to.be.revertedWithCustomError(eventManager, "NoEsTitular");

      await expect(
        eventManager.connect(otroUsuario).reclamarReembolso(2)
      ).to.be.revertedWithCustomError(eventManager, "NoEsTitular");

      // Crear un segundo evento y avanzar el tiempo para probar FueraDeTermino en comprarEntrada y cancelarEvento
      const fechaEv2 = fechaEvento + 1000;
      await eventManager
        .connect(organizador)
        .crearEvento(2, "Ev2", 0, fechaEv2, "L", artista.address, plataforma.address, 100, 10, 1000, 500, 500, 2, 2, false);

      await time.increaseTo(fechaEv2 + 10);

      await expect(
        eventManager.connect(comprador1).comprarEntrada(2, comp1, "0x", { value: 100 })
      ).to.be.revertedWithCustomError(eventManager, "FueraDeTermino");

      await expect(
        eventManager.connect(oraculo).cancelarEvento(2)
      ).to.be.revertedWithCustomError(eventManager, "FueraDeTermino");

      // Probar registrarTransferenciaIdentidad cuando el vendedor tiene contador 0
      const MARKETPLACE_ROLE = await eventManager.MARKETPLACE_ROLE();
      await eventManager.connect(admin).grantRole(MARKETPLACE_ROLE, admin.address);
      const compVacio = generarCompromiso(88888888, generarSalt());
      const compNuevo = generarCompromiso(88888889, generarSalt());
      const firmaNuevo = await firmarVerificacionIdentidad(
        verificador,
        eventManagerAddress,
        compNuevo,
        comprador2.address,
        2
      );
      await eventManager
        .connect(admin)
        .registrarTransferenciaIdentidad(2, compVacio, compNuevo, comprador2.address, firmaNuevo);
    });
  });

  describe("ReventaMarketplace: Validaciones de Borde, Constructor y Splits Cero", function () {
    it("Valida constructor, permisos de publicación/retiro, estados inválidos y cierres", async function () {
      const {
        organizador,
        artista,
        plataforma,
        oraculo,
        validador,
        verificador,
        comprador1,
        comprador2,
        otroUsuario,
        eventManager,
        marketplace,
        entradaNFT,
        entradaNFTAddress,
        eventManagerAddress,
        DEFAULT_EVENT_PARAMS,
        comp1,
        tokenId,
        fechaEvento,
        generarCompromiso,
        generarSalt,
        firmarVerificacionIdentidad,
        firmarAccesoQR,
      } = await loadFixture(setupConEventoYEntrada);

      // Constructor con direcciones nulas
      const MarketplaceFactory = await ethers.getContractFactory("ReventaMarketplace");
      await expect(
        MarketplaceFactory.deploy(ethers.ZeroAddress, eventManagerAddress)
      ).to.be.revertedWithCustomError(marketplace, "DireccionInvalida");

      await expect(
        MarketplaceFactory.deploy(entradaNFTAddress, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(marketplace, "DireccionInvalida");

      // publicarReventa por quien no es titular
      await expect(
        marketplace.connect(otroUsuario).publicarReventa(tokenId, DEFAULT_EVENT_PARAMS.precioBase)
      ).to.be.revertedWithCustomError(marketplace, "NoEsTitular");

      // Publicar y probar retirarPublicacion por no titular y doble retiro
      await marketplace.connect(comprador1).publicarReventa(tokenId, DEFAULT_EVENT_PARAMS.precioBase);

      await expect(
        marketplace.connect(otroUsuario).retirarPublicacion(1)
      ).to.be.revertedWithCustomError(marketplace, "NoEsTitular");

      await marketplace.connect(comprador1).retirarPublicacion(1);

      await expect(
        marketplace.connect(comprador1).retirarPublicacion(1)
      ).to.be.revertedWithCustomError(marketplace, "PublicacionNoActiva");

      // revenderEntrada sobre publicación no activa
      await expect(
        marketplace.connect(comprador2).revenderEntrada(1, comp1, "0x", { value: DEFAULT_EVENT_PARAMS.precioBase })
      ).to.be.revertedWithCustomError(marketplace, "PublicacionNoActiva");

      // Firma inválida en revenderEntrada
      await marketplace.connect(comprador1).publicarReventa(tokenId, DEFAULT_EVENT_PARAMS.precioBase);
      const comp2 = generarCompromiso(20202020, generarSalt());
      const firmaFalsa = await firmarVerificacionIdentidad(
        otroUsuario,
        eventManagerAddress,
        comp2,
        comprador2.address,
        DEFAULT_EVENT_PARAMS.idEvento
      );
      await expect(
        marketplace.connect(comprador2).revenderEntrada(2, comp2, firmaFalsa, { value: DEFAULT_EVENT_PARAMS.precioBase })
      ).to.be.revertedWithCustomError(eventManager, "FirmaInvalida");

      // Retirar, validar ingreso (Utilizada) e intentar publicarReventa
      await marketplace.connect(comprador1).retirarPublicacion(2);
      const ahora = await time.latest();
      const firmaQR = await firmarAccesoQR(comprador1, entradaNFTAddress, tokenId, ahora);
      await entradaNFT.connect(validador).validarIngreso(tokenId, comp1, ahora, firmaQR);

      await expect(
        marketplace.connect(comprador1).publicarReventa(tokenId, DEFAULT_EVENT_PARAMS.precioBase)
      ).to.be.revertedWithCustomError(marketplace, "EntradaNoValidaParaIngreso");

      // cerrarPorReembolso invocado por quien no es EventManager
      await expect(
        marketplace.connect(otroUsuario).cerrarPorReembolso(tokenId)
      ).to.be.revertedWithCustomError(marketplace, "SoloEventManager");

      // obtenerVendedorDeToken sobre token sin publicación activa
      expect(await marketplace.obtenerVendedorDeToken(999)).to.equal(ethers.ZeroAddress);
    });

    it("Valida eventos cancelados, fechas vencidas y splits con 0% en ReventaMarketplace", async function () {
      const {
        organizador,
        artista,
        plataforma,
        oraculo,
        verificador,
        comprador1,
        comprador2,
        eventManager,
        marketplace,
        eventManagerAddress,
        fechaEvento,
        generarCompromiso,
        generarSalt,
        firmarVerificacionIdentidad,
      } = await loadFixture(setupConEventoYEntrada);

      // Crear evento 2 con 0% regalía y 0% comisión
      const fechaEv2 = fechaEvento + 3600;
      await eventManager
        .connect(organizador)
        .crearEvento(2, "EvSinComision", 0, fechaEv2, "L", artista.address, plataforma.address, 1000, 10, 2000, 0, 0, 4, 4, false);

      const comp1 = generarCompromiso(51111111, generarSalt());
      const firma1 = await firmarVerificacionIdentidad(verificador, eventManagerAddress, comp1, comprador1.address, 2);
      await eventManager.connect(comprador1).comprarEntrada(2, comp1, firma1, { value: 1000 }); // tokenId 2
      await eventManager.connect(comprador1).comprarEntrada(2, comp1, firma1, { value: 1000 }); // tokenId 3

      // Publicar a precio 0 (cubre regalia == 0, comision == 0, neto == 0)
      await marketplace.connect(comprador1).publicarReventa(2, 0);
      const comp2 = generarCompromiso(52222222, generarSalt());
      const firma2 = await firmarVerificacionIdentidad(verificador, eventManagerAddress, comp2, comprador2.address, 2);
      await marketplace.connect(comprador2).revenderEntrada(1, comp2, firma2, { value: 0 });

      // Publicar tokenId 3, avanzar tiempo después de fechaEv2 y probar FueraDeTermino en revenderEntrada y publicarReventa
      await marketplace.connect(comprador1).publicarReventa(3, 1000);
      await time.increaseTo(fechaEv2 + 10);

      await expect(
        marketplace.connect(comprador2).revenderEntrada(2, comp2, firma2, { value: 1000 })
      ).to.be.revertedWithCustomError(marketplace, "FueraDeTermino");

      await expect(
        marketplace.connect(comprador2).publicarReventa(2, 1000)
      ).to.be.revertedWithCustomError(marketplace, "FueraDeTermino");

      // Crear evento 3, comprar dos entradas, publicar una, cancelar evento y probar EventoNoProgramado en publicar y revender
      const ahora = await time.latest();
      const fechaEv3 = ahora + 7200;
      await eventManager
        .connect(organizador)
        .crearEvento(3, "EvCancelado", 0, fechaEv3, "L", artista.address, plataforma.address, 1000, 10, 2000, 0, 0, 4, 4, false);

      const firma1Ev3 = await firmarVerificacionIdentidad(verificador, eventManagerAddress, comp1, comprador1.address, 3);
      const firma2Ev3 = await firmarVerificacionIdentidad(verificador, eventManagerAddress, comp2, comprador2.address, 3);
      await eventManager.connect(comprador1).comprarEntrada(3, comp1, firma1Ev3, { value: 1000 }); // tokenId 4
      await eventManager.connect(comprador1).comprarEntrada(3, comp1, firma1Ev3, { value: 1000 }); // tokenId 5

      await marketplace.connect(comprador1).publicarReventa(4, 1000); // pub 3
      await eventManager.connect(oraculo).cancelarEvento(3);

      await expect(
        marketplace.connect(comprador1).publicarReventa(5, 1000)
      ).to.be.revertedWithCustomError(marketplace, "EventoNoProgramado");

      await expect(
        marketplace.connect(comprador2).revenderEntrada(3, comp2, firma2Ev3, { value: 1000 })
      ).to.be.revertedWithCustomError(marketplace, "EventoNoProgramado");
    });
  });
});
