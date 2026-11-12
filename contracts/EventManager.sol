// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

interface IEntradaNFT {
    enum EstadoEntrada { Asignada, EnReventa, Utilizada, Reembolsada }

    struct Entrada {
        uint256 idEvento;
        uint256 precioOriginal;
        bytes32 compromisoIdentidad;
        uint8 cantTransferencias;
        EstadoEntrada estado;
        uint64 fechaEmision;
        uint64 fechaValidacion;
    }

    function mint(
        address to,
        uint256 idEvento,
        uint256 precioOriginal,
        bytes32 compromiso,
        address artista,
        uint96 regaliaArtistaBps
    ) external returns (uint256);

    function cambiarEstado(uint256 tokenId, EstadoEntrada nuevoEstado) external;
    function actualizarCompromisoYTransferencias(uint256 tokenId, bytes32 nuevoCompromiso) external;
    function transferenciaRegulada(address from, address to, uint256 tokenId) external;
    function ownerOf(uint256 tokenId) external view returns (address);
    function obtenerEntrada(uint256 tokenId) external view returns (Entrada memory);
    function royaltyInfo(uint256 tokenId, uint256 salePrice) external view returns (address, uint256);
}

interface IReventaMarketplace {
    function obtenerVendedorDeToken(uint256 tokenId) external view returns (address);
    function cerrarPorReembolso(uint256 tokenId) external;
}

/**
 * @title EventManager
 * @notice Administra eventos, límites de compra por identidad, custodia de fondos (Escrow)
 *         y liquidación de retiros mediante patrón Pull.
 */
contract EventManager is AccessControl, ReentrancyGuard, EIP712 {
    using ECDSA for bytes32;

    bytes32 public constant ORGANIZADOR_ROLE = keccak256("ORGANIZADOR_ROLE");
    bytes32 public constant ORACULO_ROLE = keccak256("ORACULO_ROLE");
    bytes32 public constant VERIFICADOR_ROLE = keccak256("VERIFICADOR_ROLE");
    bytes32 public constant MARKETPLACE_ROLE = keccak256("MARKETPLACE_ROLE");

    bytes32 public constant COMPROMISO_TYPEHASH =
        keccak256("VerificarIdentidad(bytes32 compromiso,address comprador,uint256 idEvento)");

    uint64 public constant MARGEN_CIERRE = 1 days;

    enum TipoEvento { Recital, Espectaculo, Futbol }
    enum EstadoEvento { Programado, Finalizado, Cancelado }

    struct Evento {
        uint256 idEvento;
        string nombre;
        TipoEvento tipoEvento;
        uint64 fechaHora;
        string lugar;
        address organizador;
        address artista;
        address plataformaTicketing;
        uint256 precioBase;
        uint32 capacidad;
        uint32 vendidas;
        uint16 topeReventaBps;
        uint16 regaliaArtistaBps;
        uint16 comisionPlataformaBps;
        uint8 limitePorPersona;
        uint8 maxTransferencias;
        bool requiereAdmision;
        EstadoEvento estado;
        uint256 balanceCustodia;
    }

    IEntradaNFT public immutable entradaNFT;
    address public marketplace;

    mapping(uint256 => Evento) public eventos;
    mapping(uint256 => mapping(bytes32 => uint256)) public entradasPorPersona;
    mapping(address => uint256) public saldosPendientes;

    // Custom errors
    error EventoYaExiste();
    error EventoInexistente();
    error FechaInvalida();
    error CapacidadInvalida();
    error PrecioInvalido();
    error DireccionInvalida();
    error SumaPorcentajesInvalida();
    error LimitePorPersonaInvalido();
    error EventoNoProgramado();
    error CapacidadAgotada();
    error MontoIncorrecto();
    error LimitePorPersonaExcedido();
    error FirmaInvalida();
    error FueraDeTermino();
    error YaReembolsada();
    error EntradaNoValidaParaIngreso();
    error NoEsTitular();
    error SinSaldo();
    error TransferenciaFallida();

    // Eventos
    event EventoCreado(uint256 indexed idEvento, string nombre, address indexed organizador, uint256 precioBase, uint32 capacidad);
    event EntradaComprada(uint256 indexed idEvento, uint256 indexed tokenId, address indexed comprador, bytes32 compromiso);
    event EventoCancelado(uint256 indexed idEvento);
    event EventoCerrado(uint256 indexed idEvento, address indexed organizador, uint256 balanceLiberado);
    event ReembolsoReclamado(uint256 indexed tokenId, address indexed titular, uint256 monto);
    event SaldoAcreditado(address indexed beneficiario, uint256 monto);
    event FondosRetirados(address indexed beneficiario, uint256 monto);

    constructor(address _entradaNFT) EIP712("EventManager", "1") {
        if (_entradaNFT == address(0)) revert DireccionInvalida();
        entradaNFT = IEntradaNFT(_entradaNFT);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function setMarketplace(address _marketplace) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_marketplace == address(0)) revert DireccionInvalida();
        marketplace = _marketplace;
    }

    /**
     * @notice Registra un nuevo evento y sus reglas de negocio.
     */
    function crearEvento(
        uint256 idEvento,
        string calldata nombre,
        TipoEvento tipoEvento,
        uint64 fechaHora,
        string calldata lugar,
        address artista,
        address plataformaTicketing,
        uint256 precioBase,
        uint32 capacidad,
        uint16 topeReventaBps,
        uint16 regaliaArtistaBps,
        uint16 comisionPlataformaBps,
        uint8 limitePorPersona,
        uint8 maxTransferencias,
        bool requiereAdmision
    ) external onlyRole(ORGANIZADOR_ROLE) {
        if (eventos[idEvento].idEvento != 0) revert EventoYaExiste();
        if (fechaHora <= block.timestamp) revert FechaInvalida();
        if (capacidad == 0) revert CapacidadInvalida();
        if (precioBase == 0) revert PrecioInvalido();
        if (artista == address(0) || plataformaTicketing == address(0)) revert DireccionInvalida();
        if (uint256(regaliaArtistaBps) + uint256(comisionPlataformaBps) >= 10000) revert SumaPorcentajesInvalida();
        if (limitePorPersona == 0) revert LimitePorPersonaInvalido();

        eventos[idEvento] = Evento({
            idEvento: idEvento,
            nombre: nombre,
            tipoEvento: tipoEvento,
            fechaHora: fechaHora,
            lugar: lugar,
            organizador: msg.sender,
            artista: artista,
            plataformaTicketing: plataformaTicketing,
            precioBase: precioBase,
            capacidad: capacidad,
            vendidas: 0,
            topeReventaBps: topeReventaBps,
            regaliaArtistaBps: regaliaArtistaBps,
            comisionPlataformaBps: comisionPlataformaBps,
            limitePorPersona: limitePorPersona,
            maxTransferencias: maxTransferencias,
            requiereAdmision: requiereAdmision,
            estado: EstadoEvento.Programado,
            balanceCustodia: 0
        });

        emit EventoCreado(idEvento, nombre, msg.sender, precioBase, capacidad);
    }

    /**
     * @notice Compra de entrada en mercado primario (Lazy Minting).
     */
    function comprarEntrada(
        uint256 idEvento,
        bytes32 compromiso,
        bytes calldata firmaVerificador
    ) external payable nonReentrant returns (uint256) {
        Evento storage evento = eventos[idEvento];
        if (evento.idEvento == 0) revert EventoInexistente();
        if (evento.estado != EstadoEvento.Programado) revert EventoNoProgramado();
        if (block.timestamp >= evento.fechaHora) revert FueraDeTermino();
        if (evento.vendidas >= evento.capacidad) revert CapacidadAgotada();
        if (msg.value != evento.precioBase) revert MontoIncorrecto();

        // Validar firma de verificación de identidad (EIP-712)
        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(COMPROMISO_TYPEHASH, compromiso, msg.sender, idEvento))
        );
        address firmante = ECDSA.recover(digest, firmaVerificador);
        if (!hasRole(VERIFICADOR_ROLE, firmante)) revert FirmaInvalida();

        // Control de límite por persona
        if (entradasPorPersona[idEvento][compromiso] >= evento.limitePorPersona) {
            revert LimitePorPersonaExcedido();
        }

        // Efectos antes de interacciones externas
        entradasPorPersona[idEvento][compromiso] += 1;
        evento.vendidas += 1;
        evento.balanceCustodia += msg.value;

        // Mint del NFT en lazy minting
        uint256 tokenId = entradaNFT.mint(
            msg.sender,
            idEvento,
            evento.precioBase,
            compromiso,
            evento.artista,
            evento.regaliaArtistaBps
        );

        emit EntradaComprada(idEvento, tokenId, msg.sender, compromiso);
        return tokenId;
    }

    /**
     * @notice Cancela el evento y habilita los reembolsos. Invocable solo por el Oráculo antes de la fecha.
     */
    function cancelarEvento(uint256 idEvento) external onlyRole(ORACULO_ROLE) {
        Evento storage evento = eventos[idEvento];
        if (evento.idEvento == 0) revert EventoInexistente();
        if (evento.estado != EstadoEvento.Programado) revert EventoNoProgramado();
        if (block.timestamp >= evento.fechaHora) revert FueraDeTermino();

        evento.estado = EstadoEvento.Cancelado;
        emit EventoCancelado(idEvento);
    }

    /**
     * @notice Cierra el evento tras haber transcurrido el margen posterior y libera la custodia al organizador.
     */
    function cerrarEvento(uint256 idEvento) external onlyRole(ORACULO_ROLE) {
        Evento storage evento = eventos[idEvento];
        if (evento.idEvento == 0) revert EventoInexistente();
        if (evento.estado != EstadoEvento.Programado) revert EventoNoProgramado();
        if (block.timestamp < evento.fechaHora + MARGEN_CIERRE) revert FueraDeTermino();

        evento.estado = EstadoEvento.Finalizado;
        uint256 balanceLiberado = evento.balanceCustodia;
        evento.balanceCustodia = 0;

        saldosPendientes[evento.organizador] += balanceLiberado;

        emit EventoCerrado(idEvento, evento.organizador, balanceLiberado);
        emit SaldoAcreditado(evento.organizador, balanceLiberado);
    }

    /**
     * @notice Reclamar reembolso pull de una entrada ante un evento cancelado.
     */
    function reclamarReembolso(uint256 tokenId) external nonReentrant {
        IEntradaNFT.Entrada memory entrada = entradaNFT.obtenerEntrada(tokenId);
        Evento storage evento = eventos[entrada.idEvento];

        if (evento.estado != EstadoEvento.Cancelado) revert EventoNoProgramado();
        if (entrada.estado == IEntradaNFT.EstadoEntrada.Reembolsada) revert YaReembolsada();
        if (entrada.estado == IEntradaNFT.EstadoEntrada.Utilizada) revert EntradaNoValidaParaIngreso();

        address titularActual = entradaNFT.ownerOf(tokenId);

        if (entrada.estado == IEntradaNFT.EstadoEntrada.Asignada) {
            if (msg.sender != titularActual) revert NoEsTitular();
        } else {
            // El NFT está en custodia del marketplace (EnReventa); el titular con derecho a reembolso es el vendedor
            address vendedor = IReventaMarketplace(marketplace).obtenerVendedorDeToken(tokenId);
            if (msg.sender != vendedor) revert NoEsTitular();
            IReventaMarketplace(marketplace).cerrarPorReembolso(tokenId);
        }

        entradaNFT.cambiarEstado(tokenId, IEntradaNFT.EstadoEntrada.Reembolsada);
        evento.balanceCustodia -= entrada.precioOriginal;
        saldosPendientes[msg.sender] += entrada.precioOriginal;

        emit ReembolsoReclamado(tokenId, msg.sender, entrada.precioOriginal);
        emit SaldoAcreditado(msg.sender, entrada.precioOriginal);
    }

    /**
     * @notice Actualiza contadores de identidad en reventa secundaria.
     */
    function registrarTransferenciaIdentidad(
        uint256 idEvento,
        bytes32 compromisoVendedor,
        bytes32 compromisoComprador,
        address comprador,
        bytes calldata firmaVerificador
    ) external onlyRole(MARKETPLACE_ROLE) {
        Evento storage evento = eventos[idEvento];

        // Validar identidad del nuevo comprador
        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(COMPROMISO_TYPEHASH, compromisoComprador, comprador, idEvento))
        );
        address firmante = ECDSA.recover(digest, firmaVerificador);
        if (!hasRole(VERIFICADOR_ROLE, firmante)) revert FirmaInvalida();

        if (entradasPorPersona[idEvento][compromisoComprador] >= evento.limitePorPersona) {
            revert LimitePorPersonaExcedido();
        }

        if (entradasPorPersona[idEvento][compromisoVendedor] > 0) {
            entradasPorPersona[idEvento][compromisoVendedor] -= 1;
        }
        entradasPorPersona[idEvento][compromisoComprador] += 1;
    }

    /**
     * @notice Acredita saldo a un beneficiario (utilizado por el Marketplace en reventas).
     */
    function acreditar(address beneficiario) external payable onlyRole(MARKETPLACE_ROLE) {
        if (beneficiario == address(0)) revert DireccionInvalida();
        saldosPendientes[beneficiario] += msg.value;
        emit SaldoAcreditado(beneficiario, msg.value);
    }

    /**
     * @notice Retiro seguro de fondos acumulados (patrón Pull + CEI).
     */
    function retirarFondos() external nonReentrant {
        uint256 monto = saldosPendientes[msg.sender];
        if (monto == 0) revert SinSaldo();

        saldosPendientes[msg.sender] = 0;

        (bool success, ) = msg.sender.call{value: monto}("");
        if (!success) revert TransferenciaFallida();

        emit FondosRetirados(msg.sender, monto);
    }

    function obtenerEvento(uint256 idEvento) external view returns (Evento memory) {
        return eventos[idEvento];
    }

    function obtenerEstadoEvento(uint256 idEvento) external view returns (EstadoEvento) {
        return eventos[idEvento].estado;
    }
}
