// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

interface IEventManagerView {
    enum EstadoEvento { Programado, Finalizado, Cancelado }
    function obtenerEstadoEvento(uint256 idEvento) external view returns (EstadoEvento);
}

/**
 * @title EntradaNFT
 * @notice Implementa el activo digital Entrada como NFT ERC-721 y ERC-2981.
 *         Incluye candado antifraude P2P y validación de ingreso con QR dinámico.
 */
contract EntradaNFT is ERC721, ERC2981, AccessControl, EIP712 {
    using ECDSA for bytes32;

    bytes32 public constant OPERADOR_ROLE = keccak256("OPERADOR_ROLE");
    bytes32 public constant VALIDADOR_ROLE = keccak256("VALIDADOR_ROLE");

    bytes32 public constant ACCESO_TYPEHASH = keccak256("ValidarAcceso(uint256 tokenId,uint64 timestamp)");
    uint256 public constant VENTANA_QR = 60; // 60 segundos de validez para el QR dinámico

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

    uint256 public nextTokenId = 1;
    address public eventManager;

    mapping(uint256 => Entrada) public entradas;

    // Custom errors según especificación
    error TransferenciaDirectaBloqueada();
    error EntradaNoValidaParaIngreso();
    error CompromisoNoCoincide();
    error FirmaInvalida();
    error QRExpirado();
    error TokenNoExiste();
    error EventoNoProgramado();

    // Eventos
    event EntradaEmitida(uint256 indexed idEvento, uint256 indexed tokenId, address indexed titular, bytes32 compromiso);
    event EstadoEntradaCambiado(uint256 indexed tokenId, EstadoEntrada nuevoEstado);
    event IngresoValidado(uint256 indexed tokenId, address indexed titular, uint64 timestamp);
    event CompromisoActualizado(uint256 indexed tokenId, bytes32 nuevoCompromiso, uint8 cantTransferencias);

    constructor() ERC721("e-TicketEvento", "TICKET") EIP712("EntradaNFT", "1") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @notice Asocia el contrato de EventManager para consultar estado lógico de eventos.
     */
    function setEventManager(address _eventManager) external onlyRole(DEFAULT_ADMIN_ROLE) {
        eventManager = _eventManager;
    }

    /**
     * @notice Emite (mintea) una entrada en lazy minting. Solo invocable por operadores autorizados.
     */
    function mint(
        address to,
        uint256 idEvento,
        uint256 precioOriginal,
        bytes32 compromiso,
        address artista,
        uint96 regaliaArtistaBps
    ) external onlyRole(OPERADOR_ROLE) returns (uint256) {
        uint256 tokenId = nextTokenId++;

        entradas[tokenId] = Entrada({
            idEvento: idEvento,
            precioOriginal: precioOriginal,
            compromisoIdentidad: compromiso,
            cantTransferencias: 0,
            estado: EstadoEntrada.Asignada,
            fechaEmision: uint64(block.timestamp),
            fechaValidacion: 0
        });

        _safeMint(to, tokenId);
        _setTokenRoyalty(tokenId, artista, regaliaArtistaBps);

        emit EntradaEmitida(idEvento, tokenId, to, compromiso);
        return tokenId;
    }

    /**
     * @notice Permite actualizar el compromiso de identidad y contar transferencias en reventa.
     */
    function actualizarCompromisoYTransferencias(
        uint256 tokenId,
        bytes32 nuevoCompromiso
    ) external onlyRole(OPERADOR_ROLE) {
        if (_ownerOf(tokenId) == address(0)) revert TokenNoExiste();
        Entrada storage entrada = entradas[tokenId];
        entrada.compromisoIdentidad = nuevoCompromiso;
        entrada.cantTransferencias += 1;

        emit CompromisoActualizado(tokenId, nuevoCompromiso, entrada.cantTransferencias);
    }

    /**
     * @notice Modifica el estado interno de la entrada (Asignada, EnReventa, Utilizada, Reembolsada).
     */
    function cambiarEstado(uint256 tokenId, EstadoEntrada nuevoEstado) external onlyRole(OPERADOR_ROLE) {
        if (_ownerOf(tokenId) == address(0)) revert TokenNoExiste();
        entradas[tokenId].estado = nuevoEstado;
        emit EstadoEntradaCambiado(tokenId, nuevoEstado);
    }

    /**
     * @notice Transfiere el NFT bajo control estricto del operador (Marketplace).
     */
    function transferenciaRegulada(address from, address to, uint256 tokenId) external onlyRole(OPERADOR_ROLE) {
        if (ownerOf(tokenId) != from) revert TransferenciaDirectaBloqueada();
        _update(to, tokenId, address(0));
    }

    /**
     * @notice Valida el acceso en puerta mediante verificación del compromiso y QR dinámico firmado.
     */
    function validarIngreso(
        uint256 tokenId,
        bytes32 compromisoPresentado,
        uint64 timestamp,
        bytes calldata firmaTitular
    ) external onlyRole(VALIDADOR_ROLE) {
        address titular = _ownerOf(tokenId);
        if (titular == address(0)) revert TokenNoExiste();

        Entrada storage entrada = entradas[tokenId];
        if (entrada.estado != EstadoEntrada.Asignada) revert EntradaNoValidaParaIngreso();

        if (eventManager != address(0)) {
            IEventManagerView.EstadoEvento estadoEvt = IEventManagerView(eventManager).obtenerEstadoEvento(entrada.idEvento);
            if (estadoEvt != IEventManagerView.EstadoEvento.Programado) {
                revert EventoNoProgramado();
            }
        }

        if (entrada.compromisoIdentidad != compromisoPresentado) {
            revert CompromisoNoCoincide();
        }

        // Validación de ventana temporal del QR dinámico
        if (block.timestamp > timestamp + VENTANA_QR || timestamp > block.timestamp + 5) {
            revert QRExpirado();
        }

        // Verificación de firma EIP-712 del titular
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(ACCESO_TYPEHASH, tokenId, timestamp)));
        address firmante = ECDSA.recover(digest, firmaTitular);
        if (firmante != titular) {
            revert FirmaInvalida();
        }

        entrada.estado = EstadoEntrada.Utilizada;
        entrada.fechaValidacion = uint64(block.timestamp);

        emit IngresoValidado(tokenId, titular, uint64(block.timestamp));
        emit EstadoEntradaCambiado(tokenId, EstadoEntrada.Utilizada);
    }

    /**
     * @notice Consulta el estado efectivo del DTE combinando estado local y estado del evento.
     */
    function estadoEfectivo(uint256 tokenId) external view returns (string memory) {
        if (_ownerOf(tokenId) == address(0)) revert TokenNoExiste();
        Entrada memory entrada = entradas[tokenId];

        if (entrada.estado == EstadoEntrada.Utilizada) return "Utilizada";
        if (entrada.estado == EstadoEntrada.Reembolsada) return "Reembolsada";

        if (eventManager != address(0)) {
            IEventManagerView.EstadoEvento estadoEvt = IEventManagerView(eventManager).obtenerEstadoEvento(entrada.idEvento);
            if (estadoEvt == IEventManagerView.EstadoEvento.Finalizado) {
                return "Vencida";
            }
        }

        if (entrada.estado == EstadoEntrada.EnReventa) return "En reventa";
        return "Asignada";
    }

    function obtenerEntrada(uint256 tokenId) external view returns (Entrada memory) {
        if (_ownerOf(tokenId) == address(0)) revert TokenNoExiste();
        return entradas[tokenId];
    }

    /**
     * @dev Candado antifraude: hook _update de OpenZeppelin v5.
     *      Bloquea cualquier transferencia directa entre billeteras (P2P).
     */
    function _update(address to, uint256 tokenId, address auth) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);

        // Si es una transferencia regular (no mint ni burn)
        if (from != address(0) && to != address(0)) {
            if (!hasRole(OPERADOR_ROLE, msg.sender)) {
                revert TransferenciaDirectaBloqueada();
            }
        }

        return super._update(to, tokenId, auth);
    }

    /**
     * @dev Sobrescritura de approve para bloquear aprobaciones directas.
     */
    function approve(address, uint256) public virtual override {
        revert TransferenciaDirectaBloqueada();
    }

    /**
     * @dev Sobrescritura de setApprovalForAll para bloquear aprobaciones de operadores no autorizados.
     */
    function setApprovalForAll(address, bool) public virtual override {
        revert TransferenciaDirectaBloqueada();
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC721, ERC2981, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
