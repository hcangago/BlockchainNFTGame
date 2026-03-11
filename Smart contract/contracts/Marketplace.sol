// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Marketplace
 * @notice Marketplace descentralizado para compraventa de NFTs EtherBeasts.
 * @dev Interactúa con cualquier contrato ERC-721 mediante approve + transferFrom.
 *      Sin comisiones: el vendedor recibe el 100% del precio.
 */
contract Marketplace is ReentrancyGuard {
    // ── Tipos ──────────────────────────────────────────────
    struct Listado {
        address vendedor;
        uint256 precio;
        bool activo;
    }

    // ── Estado ─────────────────────────────────────────────
    IERC721 public immutable nftContrato;

    mapping(uint256 => Listado) public listados;
    uint256[] private _tokensListados;
    mapping(uint256 => uint256) private _indiceToken; // tokenId → posición en _tokensListados

    // ── Eventos ────────────────────────────────────────────
    event NFTListado(
        uint256 indexed tokenId,
        address indexed vendedor,
        uint256 precio
    );
    event NFTVendido(
        uint256 indexed tokenId,
        address indexed vendedor,
        address indexed comprador,
        uint256 precio
    );
    event ListadoCancelado(uint256 indexed tokenId, address indexed vendedor);

    // ── Constructor ────────────────────────────────────────
    /**
     * @param _nftContrato Dirección del contrato ERC-721 (Cartas.sol).
     */
    constructor(address _nftContrato) {
        require(_nftContrato != address(0), "Direccion invalida");
        nftContrato = IERC721(_nftContrato);
    }

    // ── Funciones principales ──────────────────────────────

    /**
     * @notice Lista un NFT para venta a precio fijo.
     * @dev El vendedor debe haber llamado approve(marketplace, tokenId) antes.
     * @param tokenId El ID del token a listar.
     * @param precio El precio de venta en wei.
     */
    function listarNFT(uint256 tokenId, uint256 precio) external {
        require(precio > 0, "El precio debe ser mayor a 0");
        require(
            nftContrato.ownerOf(tokenId) == msg.sender,
            "No eres el propietario"
        );
        require(
            nftContrato.getApproved(tokenId) == address(this) ||
                nftContrato.isApprovedForAll(msg.sender, address(this)),
            "El marketplace no tiene aprobacion"
        );
        require(!listados[tokenId].activo, "Ya esta listado");

        listados[tokenId] = Listado({
            vendedor: msg.sender,
            precio: precio,
            activo: true
        });

        _indiceToken[tokenId] = _tokensListados.length;
        _tokensListados.push(tokenId);

        emit NFTListado(tokenId, msg.sender, precio);
    }

    /**
     * @notice Cancela un listado activo.
     * @param tokenId El ID del token a retirar del mercado.
     */
    function cancelarListado(uint256 tokenId) external {
        Listado storage listado = listados[tokenId];
        require(listado.activo, "No esta listado");
        require(listado.vendedor == msg.sender, "No eres el vendedor");

        listado.activo = false;
        _eliminarDeListados(tokenId);

        emit ListadoCancelado(tokenId, msg.sender);
    }

    /**
     * @notice Compra un NFT listado enviando el ETH correspondiente.
     * @param tokenId El ID del token a comprar.
     */
    function comprarNFT(uint256 tokenId) external payable nonReentrant {
        Listado storage listado = listados[tokenId];
        require(listado.activo, "No esta listado");
        require(msg.value >= listado.precio, "ETH insuficiente");
        require(
            msg.sender != listado.vendedor,
            "No puedes comprar tu propio NFT"
        );

        address vendedor = listado.vendedor;
        uint256 precio = listado.precio;

        // Marcar como inactivo antes de transferir (patrón checks-effects-interactions)
        listado.activo = false;
        _eliminarDeListados(tokenId);

        // Transferir el NFT al comprador
        nftContrato.transferFrom(vendedor, msg.sender, tokenId);

        // Enviar el ETH al vendedor
        (bool enviado, ) = payable(vendedor).call{value: precio}("");
        require(enviado, "Fallo al enviar ETH al vendedor");

        // Devolver exceso de ETH si el comprador envió de más
        if (msg.value > precio) {
            (bool devuelto, ) = payable(msg.sender).call{
                value: msg.value - precio
            }("");
            require(devuelto, "Fallo al devolver exceso");
        }

        emit NFTVendido(tokenId, vendedor, msg.sender, precio);
    }

    // ── Funciones de consulta ──────────────────────────────

    /**
     * @notice Obtiene los datos de un listado.
     * @param tokenId El ID del token a consultar.
     * @return vendedor La dirección del vendedor.
     * @return precio El precio en wei.
     * @return activo Si el listado está activo.
     */
    function obtenerListado(
        uint256 tokenId
    ) external view returns (address vendedor, uint256 precio, bool activo) {
        Listado memory l = listados[tokenId];
        return (l.vendedor, l.precio, l.activo);
    }

    /**
     * @notice Devuelve todos los tokenIds con listado activo.
     * @return Array de tokenIds listados.
     */
    function obtenerTodosListados() external view returns (uint256[] memory) {
        return _tokensListados;
    }

    /**
     * @notice Devuelve cuántos NFTs están listados actualmente.
     */
    function totalListados() external view returns (uint256) {
        return _tokensListados.length;
    }

    // ── Utilidades internas ────────────────────────────────

    /**
     * @dev Elimina un tokenId del array de listados activos (swap & pop).
     */
    function _eliminarDeListados(uint256 tokenId) private {
        uint256 indice = _indiceToken[tokenId];
        uint256 ultimo = _tokensListados.length - 1;

        if (indice != ultimo) {
            uint256 tokenUltimo = _tokensListados[ultimo];
            _tokensListados[indice] = tokenUltimo;
            _indiceToken[tokenUltimo] = indice;
        }

        _tokensListados.pop();
        delete _indiceToken[tokenId];
    }
}
