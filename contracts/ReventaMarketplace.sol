// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IEntradaNFTMarketplace {
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

    function cambiarEstado(uint256 tokenId, EstadoEntrada nuevoEstado) external;
    function actualizarCompromisoYTransferencias(uint256 tokenId, bytes32 nuevoCompromiso) external;
    function transferenciaRegulada(address from, address to, uint256 tokenId) external;
    function ownerOf(uint256 tokenId) external view returns (address);
    function obtenerEntrada(uint256 tokenId) external view returns (Entrada memory);
    function royaltyInfo(uint256 tokenId, uint256 salePrice) external view returns (address, uint256);
}

interface IEventManagerMarketplace {
    enum EstadoEvento { Programado, Finalizado, Cancelado }

    struct Evento {
        uint256 idEvento;
        string nombre;
        uint8 tipoEvento;
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

    function obtenerEvento(uint256 idEvento) external view returns (Evento memory);
    function registrarTransferenciaIdentidad(
        uint256 idEvento,
        bytes32 compromisoVendedor,
        bytes32 compromisoComprador,
        address comprador,
        bytes calldata firmaVerificador
    ) external;
    function acreditar(address beneficiario) external payable;
}

/**
 * @title ReventaMarketplace
 * @notice Canal oficial regulado para reventa de entradas con tope de precio,
 *         límite de transferencias y reparto automático (split) de regalías y comisiones.
 */
contract ReventaMarketplace is AccessControl, ReentrancyGuard {
    enum EstadoPublicacion { Activa, Vendida, Retirada }

    struct Publicacion {
        uint256 idPublicacion;
        uint256 idToken;
        address vendedor;
        uint256 precioReventa;
        uint64 fechaPublicacion;
        EstadoPublicacion estado;
    }

    IEntradaNFTMarketplace public immutable entradaNFT;
    IEventManagerMarketplace public immutable eventManager;

    uint256 public nextPublicacionId = 1;
    mapping(uint256 => Publicacion) public publicaciones;
    mapping(uint256 => uint256) public tokenAPublicacionActiva;

    // Custom errors
    error NoEsTitular();
    error EntradaNoValidaParaIngreso();
    error EventoNoProgramado();
    error FueraDeTermino();
    error MaxTransferenciasAlcanzado();
    error PrecioSuperaTope();
    error PublicacionNoActiva();
    error MontoIncorrecto();
    error SoloEventManager();
    error DireccionInvalida();

    // Eventos
    event ReventaPublicada(uint256 indexed idPublicacion, uint256 indexed idToken, address indexed vendedor, uint256 precioReventa);
    event PublicacionRetirada(uint256 indexed idPublicacion, uint256 indexed idToken);
    event EntradaRevendida(
        uint256 indexed idPublicacion,
        uint256 indexed idToken,
        address indexed vendedor,
        address comprador,
        uint256 precio
    );

    constructor(address _entradaNFT, address _eventManager) {
        if (_entradaNFT == address(0) || _eventManager == address(0)) revert DireccionInvalida();
        entradaNFT = IEntradaNFTMarketplace(_entradaNFT);
        eventManager = IEventManagerMarketplace(_eventManager);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @notice Publica una entrada para reventa dentro del tope permitido y transfiere el NFT en custodia.
     */
    function publicarReventa(uint256 idToken, uint256 precio) external returns (uint256) {
        if (entradaNFT.ownerOf(idToken) != msg.sender) revert NoEsTitular();

        IEntradaNFTMarketplace.Entrada memory entrada = entradaNFT.obtenerEntrada(idToken);
        if (entrada.estado != IEntradaNFTMarketplace.EstadoEntrada.Asignada) revert EntradaNoValidaParaIngreso();

        IEventManagerMarketplace.Evento memory evento = eventManager.obtenerEvento(entrada.idEvento);
        if (evento.estado != IEventManagerMarketplace.EstadoEvento.Programado) revert EventoNoProgramado();
        if (block.timestamp >= evento.fechaHora) revert FueraDeTermino();
        if (entrada.cantTransferencias >= evento.maxTransferencias) revert MaxTransferenciasAlcanzado();

        // Control de tope de precio: precio <= precioOriginal * (10000 + topeReventaBps) / 10000
        uint256 precioMax = (entrada.precioOriginal * (10000 + uint256(evento.topeReventaBps))) / 10000;
        if (precio > precioMax) revert PrecioSuperaTope();

        // Custodia del NFT en el Marketplace
        entradaNFT.transferenciaRegulada(msg.sender, address(this), idToken);
        entradaNFT.cambiarEstado(idToken, IEntradaNFTMarketplace.EstadoEntrada.EnReventa);

        uint256 idPub = nextPublicacionId++;
        publicaciones[idPub] = Publicacion({
            idPublicacion: idPub,
            idToken: idToken,
            vendedor: msg.sender,
            precioReventa: precio,
            fechaPublicacion: uint64(block.timestamp),
            estado: EstadoPublicacion.Activa
        });

        tokenAPublicacionActiva[idToken] = idPub;

        emit ReventaPublicada(idPub, idToken, msg.sender, precio);
        return idPub;
    }

    /**
     * @notice Cancela la publicación y restituye el NFT al vendedor.
     */
    function retirarPublicacion(uint256 idPublicacion) external {
        Publicacion storage pub = publicaciones[idPublicacion];
        if (pub.estado != EstadoPublicacion.Activa) revert PublicacionNoActiva();
        if (msg.sender != pub.vendedor) revert NoEsTitular();

        pub.estado = EstadoPublicacion.Retirada;
        delete tokenAPublicacionActiva[pub.idToken];

        entradaNFT.cambiarEstado(pub.idToken, IEntradaNFTMarketplace.EstadoEntrada.Asignada);
        entradaNFT.transferenciaRegulada(address(this), msg.sender, pub.idToken);

        emit PublicacionRetirada(idPublicacion, pub.idToken);
    }

    /**
     * @notice Ejecuta la compra de una entrada en reventa, validando límites y distribuyendo fondos automáticamente.
     */
    function revenderEntrada(
        uint256 idPublicacion,
        bytes32 nuevoCompromiso,
        bytes calldata firmaVerificador
    ) external payable nonReentrant {
        Publicacion storage pub = publicaciones[idPublicacion];
        if (pub.estado != EstadoPublicacion.Activa) revert PublicacionNoActiva();
        if (msg.value != pub.precioReventa) revert MontoIncorrecto();

        IEntradaNFTMarketplace.Entrada memory entrada = entradaNFT.obtenerEntrada(pub.idToken);
        IEventManagerMarketplace.Evento memory evento = eventManager.obtenerEvento(entrada.idEvento);

        if (evento.estado != IEventManagerMarketplace.EstadoEvento.Programado) revert EventoNoProgramado();
        if (block.timestamp >= evento.fechaHora) revert FueraDeTermino();

        // Registrar transferencia de identidad y cupo por persona en EventManager
        eventManager.registrarTransferenciaIdentidad(
            entrada.idEvento,
            entrada.compromisoIdentidad,
            nuevoCompromiso,
            msg.sender,
            firmaVerificador
        );

        // Cálculo del split: regalía ERC-2981, comisión plataforma y neto para vendedor
        (address artista, uint256 regalia) = entradaNFT.royaltyInfo(pub.idToken, msg.value);
        uint256 comision = (msg.value * uint256(evento.comisionPlataformaBps)) / 10000;
        uint256 neto = msg.value - regalia - comision;

        // Acreditar saldos mediante patrón Pull en EventManager
        if (regalia > 0) {
            eventManager.acreditar{value: regalia}(artista);
        }
        if (comision > 0) {
            eventManager.acreditar{value: comision}(evento.plataformaTicketing);
        }
        if (neto > 0) {
            eventManager.acreditar{value: neto}(pub.vendedor);
        }

        pub.estado = EstadoPublicacion.Vendida;
        delete tokenAPublicacionActiva[pub.idToken];

        // Actualizar NFT y transferir al nuevo titular
        entradaNFT.actualizarCompromisoYTransferencias(pub.idToken, nuevoCompromiso);
        entradaNFT.cambiarEstado(pub.idToken, IEntradaNFTMarketplace.EstadoEntrada.Asignada);
        entradaNFT.transferenciaRegulada(address(this), msg.sender, pub.idToken);

        emit EntradaRevendida(idPublicacion, pub.idToken, pub.vendedor, msg.sender, msg.value);
    }

    /**
     * @notice Permite al EventManager cerrar la publicación activa cuando el evento se cancela y se reembolsa la entrada.
     */
    function cerrarPorReembolso(uint256 idToken) external {
        if (msg.sender != address(eventManager)) revert SoloEventManager();
        uint256 idPub = tokenAPublicacionActiva[idToken];
        if (idPub != 0) {
            publicaciones[idPub].estado = EstadoPublicacion.Retirada;
            delete tokenAPublicacionActiva[idToken];
            // Devuelve el NFT (ya reembolsado) al vendedor para que no quede en custodia del marketplace
            entradaNFT.transferenciaRegulada(address(this), publicaciones[idPub].vendedor, idToken);
        }
    }

    function obtenerVendedorDeToken(uint256 idToken) external view returns (address) {
        uint256 idPub = tokenAPublicacionActiva[idToken];
        if (idPub == 0) return address(0);
        return publicaciones[idPub].vendedor;
    }

    function obtenerPublicacion(uint256 idPublicacion) external view returns (Publicacion memory) {
        return publicaciones[idPublicacion];
    }
}
