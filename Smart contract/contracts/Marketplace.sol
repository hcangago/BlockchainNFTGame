// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Marketplace
 * @notice Marketplace descentralizado para compraventa, ofertas e intercambio de NFTs EtherBeasts.
 * @dev Interactúa con cualquier contrato ERC-721 mediante approve + transferFrom.
 *      Sin comisiones: el vendedor recibe el 100% del precio.
 *      Soporta: venta directa, ofertas con ETH (escrow) e intercambio de cartas (swap atómico).
 */
contract Marketplace is ReentrancyGuard {
    // ── Tipos: Venta Directa ──────────────────────────────
    struct Listado {
        address vendedor;
        uint256 precio;
        bool activo;
    }

    // ── Tipos: Ofertas con ETH ────────────────────────────
    struct OfertaETH {
        address oferente;
        uint256 tokenIdObjetivo;
        uint256 montoETH;
        bool activa;
    }

    // ── Tipos: Ofertas de Intercambio ─────────────────────
    struct OfertaIntercambio {
        address oferente;
        address destinatario;
        uint256[] tokensOfrecidos;
        uint256[] tokensSolicitados;
        bool activa;
    }

    // ── Tipos: Subastas ───────────────────────────────────
    struct Subasta {
        address vendedor;
        uint256 tokenId;
        uint256 precioMinimo;       // Precio de reserva (0 = sin reserva)
        uint256 pujaActual;         // Monto de la puja más alta
        address mejorPostor;        // Dirección del mejor postor
        uint256 inicio;             // Timestamp de inicio
        uint256 fin;                // Timestamp de finalización
        bool activa;                // ¿La subasta está activa?
        bool finalizada;            // ¿Se ha reclamado el resultado?
    }

    // ── Estado ─────────────────────────────────────────────
    IERC721 public immutable nftContrato;

    // Venta directa
    mapping(uint256 => Listado) public listados;
    uint256[] private _tokensListados;
    mapping(uint256 => uint256) private _indiceToken;

    // Ofertas ETH
    uint256 public nextOfertaETHId;
    mapping(uint256 => OfertaETH) public ofertasETH;
    mapping(uint256 => uint256[]) private _ofertasETHPorToken; // tokenId => ofertaIds

    // Ofertas de Intercambio
    uint256 public nextOfertaIntercambioId;
    mapping(uint256 => OfertaIntercambio) public ofertasIntercambio;

    // Subastas
    uint256 public nextSubastaId;
    mapping(uint256 => Subasta) public subastas;
    mapping(uint256 => uint256) public subastaActivaDeToken; // tokenId => subastaId
    mapping(uint256 => bool) public tokenTieneSubasta;       // tokenId => tiene subasta activa
    uint256 public constant EXTENSION_ANTISNIPE = 5 minutes;

    // ── Eventos ────────────────────────────────────────────
    // Venta directa
    event NFTListado(uint256 indexed tokenId, address indexed vendedor, uint256 precio);
    event NFTVendido(uint256 indexed tokenId, address indexed vendedor, address indexed comprador, uint256 precio);
    event ListadoCancelado(uint256 indexed tokenId, address indexed vendedor);

    // Ofertas ETH
    event OfertaETHCreada(uint256 indexed ofertaId, address indexed oferente, uint256 indexed tokenId, uint256 monto);
    event OfertaETHAceptada(uint256 indexed ofertaId, address indexed propietario, address indexed oferente);
    event OfertaETHCancelada(uint256 indexed ofertaId);
    event OfertaETHRechazada(uint256 indexed ofertaId);

    // Ofertas de Intercambio
    event OfertaIntercambioCreada(uint256 indexed ofertaId, address indexed oferente, address indexed destinatario);
    event OfertaIntercambioAceptada(uint256 indexed ofertaId);
    event OfertaIntercambioCancelada(uint256 indexed ofertaId);
    event OfertaIntercambioRechazada(uint256 indexed ofertaId);

    // Subastas
    event SubastaCreada(uint256 indexed subastaId, address indexed vendedor, uint256 indexed tokenId, uint256 precioMinimo, uint256 fin);
    event PujaRealizada(uint256 indexed subastaId, address indexed postor, uint256 monto);
    event SubastaFinalizada(uint256 indexed subastaId, address ganador, uint256 montoFinal);
    event SubastaCancelada(uint256 indexed subastaId);

    // ── Constructor ────────────────────────────────────────
    constructor(address _nftContrato) {
        require(_nftContrato != address(0), "Direccion invalida");
        nftContrato = IERC721(_nftContrato);
    }

    // ════════════════════════════════════════════════════════
    // ██ VENTA DIRECTA
    // ════════════════════════════════════════════════════════

    /// @notice Lista un NFT para venta a precio fijo.
    function listarNFT(uint256 tokenId, uint256 precio) external {
        require(precio > 0, "El precio debe ser mayor a 0");
        require(nftContrato.ownerOf(tokenId) == msg.sender, "No eres el propietario");
        require(
            nftContrato.getApproved(tokenId) == address(this) ||
                nftContrato.isApprovedForAll(msg.sender, address(this)),
            "El marketplace no tiene aprobacion"
        );
        require(!listados[tokenId].activo, "Ya esta listado");
        require(!tokenTieneSubasta[tokenId], "El token tiene una subasta activa");

        listados[tokenId] = Listado({
            vendedor: msg.sender,
            precio: precio,
            activo: true
        });

        _indiceToken[tokenId] = _tokensListados.length;
        _tokensListados.push(tokenId);

        emit NFTListado(tokenId, msg.sender, precio);
    }

    /// @notice Cancela un listado activo.
    function cancelarListado(uint256 tokenId) external {
        Listado storage listado = listados[tokenId];
        require(listado.activo, "No esta listado");
        require(listado.vendedor == msg.sender, "No eres el vendedor");

        listado.activo = false;
        _eliminarDeListados(tokenId);

        emit ListadoCancelado(tokenId, msg.sender);
    }

    /// @notice Compra un NFT listado enviando el ETH correspondiente.
    function comprarNFT(uint256 tokenId) external payable nonReentrant {
        Listado storage listado = listados[tokenId];
        require(listado.activo, "No esta listado");
        require(msg.value >= listado.precio, "ETH insuficiente");
        require(msg.sender != listado.vendedor, "No puedes comprar tu propio NFT");

        address vendedor = listado.vendedor;
        uint256 precio = listado.precio;

        listado.activo = false;
        _eliminarDeListados(tokenId);

        // Cancelar y devolver ETH de todas las ofertas pendientes sobre este token
        _cancelarOfertasETHPendientes(tokenId, type(uint256).max);

        nftContrato.transferFrom(vendedor, msg.sender, tokenId);

        (bool enviado, ) = payable(vendedor).call{value: precio}("");
        require(enviado, "Fallo al enviar ETH al vendedor");

        if (msg.value > precio) {
            (bool devuelto, ) = payable(msg.sender).call{value: msg.value - precio}("");
            require(devuelto, "Fallo al devolver exceso");
        }

        emit NFTVendido(tokenId, vendedor, msg.sender, precio);
    }

    // ════════════════════════════════════════════════════════
    // ██ OFERTAS CON ETH
    // ════════════════════════════════════════════════════════

    /// @notice Crea una oferta de compra con ETH para un NFT (el ETH queda en escrow).
    /// @param tokenId El token que se desea comprar.
    function crearOfertaETH(uint256 tokenId) external payable {
        require(msg.value > 0, "Debes enviar ETH");
        require(nftContrato.ownerOf(tokenId) != msg.sender, "No puedes ofertar por tu propio NFT");

        uint256 ofertaId = nextOfertaETHId++;
        ofertasETH[ofertaId] = OfertaETH({
            oferente: msg.sender,
            tokenIdObjetivo: tokenId,
            montoETH: msg.value,
            activa: true
        });

        _ofertasETHPorToken[tokenId].push(ofertaId);

        emit OfertaETHCreada(ofertaId, msg.sender, tokenId, msg.value);
    }

    /// @notice El propietario del NFT acepta una oferta de ETH.
    /// @param ofertaId El ID de la oferta a aceptar.
    function aceptarOfertaETH(uint256 ofertaId) external nonReentrant {
        OfertaETH storage oferta = ofertasETH[ofertaId];
        require(oferta.activa, "Oferta no activa");

        uint256 tokenId = oferta.tokenIdObjetivo;
        require(nftContrato.ownerOf(tokenId) == msg.sender, "No eres el propietario del NFT");
        require(
            nftContrato.getApproved(tokenId) == address(this) ||
                nftContrato.isApprovedForAll(msg.sender, address(this)),
            "El marketplace no tiene aprobacion"
        );

        address oferente = oferta.oferente;
        uint256 monto = oferta.montoETH;

        // Marcar como inactiva antes de transferir
        oferta.activa = false;

        // Si el NFT estaba listado, cancelar el listado
        if (listados[tokenId].activo) {
            listados[tokenId].activo = false;
            _eliminarDeListados(tokenId);
        }

        // Cancelar y devolver ETH de todas las OTRAS ofertas pendientes sobre este token
        _cancelarOfertasETHPendientes(tokenId, ofertaId);

        // Transferir NFT al oferente
        nftContrato.transferFrom(msg.sender, oferente, tokenId);

        // Enviar ETH al propietario
        (bool enviado, ) = payable(msg.sender).call{value: monto}("");
        require(enviado, "Fallo al enviar ETH");

        emit OfertaETHAceptada(ofertaId, msg.sender, oferente);
    }

    /// @notice El oferente cancela su oferta y recupera su ETH.
    function cancelarOfertaETH(uint256 ofertaId) external nonReentrant {
        OfertaETH storage oferta = ofertasETH[ofertaId];
        require(oferta.activa, "Oferta no activa");
        require(oferta.oferente == msg.sender, "No eres el oferente");

        uint256 monto = oferta.montoETH;
        oferta.activa = false;

        // Devolver ETH al oferente
        (bool devuelto, ) = payable(msg.sender).call{value: monto}("");
        require(devuelto, "Fallo al devolver ETH");

        emit OfertaETHCancelada(ofertaId);
    }

    /// @notice El propietario del NFT rechaza la oferta y devuelve el ETH.
    function rechazarOfertaETH(uint256 ofertaId) external nonReentrant {
        OfertaETH storage oferta = ofertasETH[ofertaId];
        require(oferta.activa, "Oferta no activa");

        uint256 tokenId = oferta.tokenIdObjetivo;
        require(nftContrato.ownerOf(tokenId) == msg.sender, "No eres el propietario del NFT");

        address oferente = oferta.oferente;
        uint256 monto = oferta.montoETH;
        oferta.activa = false;

        // Devolver ETH al oferente
        (bool devuelto, ) = payable(oferente).call{value: monto}("");
        require(devuelto, "Fallo al devolver ETH");

        emit OfertaETHRechazada(ofertaId);
    }

    // ════════════════════════════════════════════════════════
    // ██ OFERTAS DE INTERCAMBIO (SWAP)
    // ════════════════════════════════════════════════════════

    /// @notice Crea una oferta de intercambio de cartas.
    /// @param tokensOfrecidos Los tokenIds que el oferente ofrece.
    /// @param tokensSolicitados Los tokenIds que el oferente quiere del destinatario.
    /// @param destinatario La dirección del propietario de las cartas solicitadas.
    function crearOfertaIntercambio(
        uint256[] calldata tokensOfrecidos,
        uint256[] calldata tokensSolicitados,
        address destinatario
    ) external {
        require(tokensOfrecidos.length > 0, "Debes ofrecer al menos una carta");
        require(tokensSolicitados.length > 0, "Debes solicitar al menos una carta");
        require(destinatario != msg.sender, "No puedes intercambiar contigo mismo");
        require(destinatario != address(0), "Destinatario invalido");

        // Verificar que el oferente posee todas las cartas ofrecidas
        for (uint256 i = 0; i < tokensOfrecidos.length; i++) {
            require(
                nftContrato.ownerOf(tokensOfrecidos[i]) == msg.sender,
                "No posees todas las cartas ofrecidas"
            );
        }

        // Verificar que el destinatario posee todas las cartas solicitadas
        for (uint256 i = 0; i < tokensSolicitados.length; i++) {
            require(
                nftContrato.ownerOf(tokensSolicitados[i]) == destinatario,
                "El destinatario no posee todas las cartas solicitadas"
            );
        }

        uint256 ofertaId = nextOfertaIntercambioId++;
        ofertasIntercambio[ofertaId] = OfertaIntercambio({
            oferente: msg.sender,
            destinatario: destinatario,
            tokensOfrecidos: tokensOfrecidos,
            tokensSolicitados: tokensSolicitados,
            activa: true
        });

        emit OfertaIntercambioCreada(ofertaId, msg.sender, destinatario);
    }

    /// @notice El destinatario acepta el intercambio (swap atómico).
    /// @dev Ambas partes deben tener aprobación activa (approve o setApprovalForAll).
    function aceptarOfertaIntercambio(uint256 ofertaId) external nonReentrant {
        OfertaIntercambio storage oferta = ofertasIntercambio[ofertaId];
        require(oferta.activa, "Oferta no activa");
        require(oferta.destinatario == msg.sender, "No eres el destinatario");

        address oferente = oferta.oferente;

        // Verificar propiedad y aprobación de todas las cartas del oferente
        for (uint256 i = 0; i < oferta.tokensOfrecidos.length; i++) {
            uint256 tokenId = oferta.tokensOfrecidos[i];
            require(nftContrato.ownerOf(tokenId) == oferente, "El oferente ya no posee la carta");
            require(
                nftContrato.getApproved(tokenId) == address(this) ||
                    nftContrato.isApprovedForAll(oferente, address(this)),
                "El oferente no ha aprobado la carta"
            );
        }

        // Verificar propiedad y aprobación de todas las cartas del destinatario
        for (uint256 i = 0; i < oferta.tokensSolicitados.length; i++) {
            uint256 tokenId = oferta.tokensSolicitados[i];
            require(nftContrato.ownerOf(tokenId) == msg.sender, "Ya no posees la carta solicitada");
            require(
                nftContrato.getApproved(tokenId) == address(this) ||
                    nftContrato.isApprovedForAll(msg.sender, address(this)),
                "No has aprobado la carta solicitada"
            );
        }

        // Marcar como inactiva antes de transferir
        oferta.activa = false;

        // Swap atómico: transferir cartas del oferente al destinatario
        for (uint256 i = 0; i < oferta.tokensOfrecidos.length; i++) {
            uint256 tokenId = oferta.tokensOfrecidos[i];
            // Si estaba listada, cancelar el listado
            if (listados[tokenId].activo) {
                listados[tokenId].activo = false;
                _eliminarDeListados(tokenId);
            }
            // Cancelar ofertas ETH pendientes sobre esta carta
            _cancelarOfertasETHPendientes(tokenId, type(uint256).max);
            nftContrato.transferFrom(oferente, msg.sender, tokenId);
        }

        // Swap atómico: transferir cartas del destinatario al oferente
        for (uint256 i = 0; i < oferta.tokensSolicitados.length; i++) {
            uint256 tokenId = oferta.tokensSolicitados[i];
            // Si estaba listada, cancelar el listado
            if (listados[tokenId].activo) {
                listados[tokenId].activo = false;
                _eliminarDeListados(tokenId);
            }
            // Cancelar ofertas ETH pendientes sobre esta carta
            _cancelarOfertasETHPendientes(tokenId, type(uint256).max);
            nftContrato.transferFrom(msg.sender, oferente, tokenId);
        }

        emit OfertaIntercambioAceptada(ofertaId);
    }

    /// @notice El oferente cancela su oferta de intercambio.
    function cancelarOfertaIntercambio(uint256 ofertaId) external {
        OfertaIntercambio storage oferta = ofertasIntercambio[ofertaId];
        require(oferta.activa, "Oferta no activa");
        require(oferta.oferente == msg.sender, "No eres el oferente");

        oferta.activa = false;
        emit OfertaIntercambioCancelada(ofertaId);
    }

    /// @notice El destinatario rechaza la oferta de intercambio.
    function rechazarOfertaIntercambio(uint256 ofertaId) external {
        OfertaIntercambio storage oferta = ofertasIntercambio[ofertaId];
        require(oferta.activa, "Oferta no activa");
        require(oferta.destinatario == msg.sender, "No eres el destinatario");

        oferta.activa = false;
        emit OfertaIntercambioRechazada(ofertaId);
    }

    // ════════════════════════════════════════════════════════
    // ██ FUNCIONES DE CONSULTA
    // ════════════════════════════════════════════════════════

    /// @notice Obtiene los datos de un listado.
    function obtenerListado(
        uint256 tokenId
    ) external view returns (address vendedor, uint256 precio, bool activo) {
        Listado memory l = listados[tokenId];
        return (l.vendedor, l.precio, l.activo);
    }

    /// @notice Devuelve todos los tokenIds con listado activo.
    function obtenerTodosListados() external view returns (uint256[] memory) {
        return _tokensListados;
    }

    /// @notice Devuelve cuántos NFTs están listados actualmente.
    function totalListados() external view returns (uint256) {
        return _tokensListados.length;
    }

    /// @notice Obtiene los detalles de una oferta ETH.
    function obtenerOfertaETH(
        uint256 ofertaId
    ) external view returns (address oferente, uint256 tokenIdObjetivo, uint256 montoETH, bool activa) {
        OfertaETH memory o = ofertasETH[ofertaId];
        return (o.oferente, o.tokenIdObjetivo, o.montoETH, o.activa);
    }

    /// @notice Obtiene los detalles de una oferta de intercambio.
    function obtenerOfertaIntercambio(
        uint256 ofertaId
    ) external view returns (
        address oferente,
        address destinatario,
        uint256[] memory tokensOfrecidos,
        uint256[] memory tokensSolicitados,
        bool activa
    ) {
        OfertaIntercambio memory o = ofertasIntercambio[ofertaId];
        return (o.oferente, o.destinatario, o.tokensOfrecidos, o.tokensSolicitados, o.activa);
    }

    // ── Utilidades internas ────────────────────────────────

    /// @dev Elimina un tokenId del array de listados activos (swap & pop).
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

    /// @dev Cancela todas las ofertas ETH activas sobre un token y devuelve el ETH.
    ///      Excluye la oferta `excepto` (la que se está aceptando). Pasar type(uint256).max para cancelar todas.
    function _cancelarOfertasETHPendientes(uint256 tokenId, uint256 excepto) private {
        uint256[] storage ids = _ofertasETHPorToken[tokenId];
        for (uint256 i = 0; i < ids.length; i++) {
            uint256 oid = ids[i];
            if (oid == excepto) continue;
            OfertaETH storage o = ofertasETH[oid];
            if (!o.activa) continue;

            o.activa = false;
            // Devolver ETH al oferente
            (bool devuelto, ) = payable(o.oferente).call{value: o.montoETH}("");
            // Si falla la devolución, no revierte toda la tx — el oferente puede reclamar manualmente
            if (devuelto) {
                emit OfertaETHCancelada(oid);
            }
        }
    }

    // ════════════════════════════════════════════════════════
    // ██ SUBASTAS
    // ════════════════════════════════════════════════════════

    /// @notice Crea una subasta para un NFT.
    /// @param tokenId El token a subastar.
    /// @param precioMinimo Precio de reserva en wei (0 = sin reserva).
    /// @param duracionHoras Duración de la subasta en horas (mín. 1, máx. 168).
    function crearSubasta(uint256 tokenId, uint256 precioMinimo, uint256 duracionHoras) external {
        require(duracionHoras >= 1 && duracionHoras <= 168, "Duracion: entre 1 y 168 horas");
        require(nftContrato.ownerOf(tokenId) == msg.sender, "No eres el propietario");
        require(
            nftContrato.getApproved(tokenId) == address(this) ||
                nftContrato.isApprovedForAll(msg.sender, address(this)),
            "El marketplace no tiene aprobacion"
        );
        require(!listados[tokenId].activo, "El token esta listado para venta");
        require(!tokenTieneSubasta[tokenId], "Ya tiene una subasta activa");

        uint256 subastaId = nextSubastaId++;
        uint256 finSubasta = block.timestamp + (duracionHoras * 1 hours);

        subastas[subastaId] = Subasta({
            vendedor: msg.sender,
            tokenId: tokenId,
            precioMinimo: precioMinimo,
            pujaActual: 0,
            mejorPostor: address(0),
            inicio: block.timestamp,
            fin: finSubasta,
            activa: true,
            finalizada: false
        });

        subastaActivaDeToken[tokenId] = subastaId;
        tokenTieneSubasta[tokenId] = true;

        emit SubastaCreada(subastaId, msg.sender, tokenId, precioMinimo, finSubasta);
    }

    /// @notice Realiza una puja en una subasta activa.
    /// @param subastaId El ID de la subasta.
    function pujar(uint256 subastaId) external payable nonReentrant {
        Subasta storage sub = subastas[subastaId];
        require(sub.activa, "Subasta no activa");
        require(block.timestamp < sub.fin, "La subasta ha expirado");
        require(msg.sender != sub.vendedor, "No puedes pujar en tu propia subasta");
        require(msg.value > sub.pujaActual, "La puja debe superar la actual");
        if (sub.precioMinimo > 0) {
            require(msg.value >= sub.precioMinimo, "Puja inferior al precio minimo");
        }

        // Devolver ETH al postor anterior si existe
        address postorAnterior = sub.mejorPostor;
        uint256 montoAnterior = sub.pujaActual;

        // Actualizar puja
        sub.pujaActual = msg.value;
        sub.mejorPostor = msg.sender;

        // Extension anti-snipe: si quedan menos de 5 minutos, extender
        if (sub.fin - block.timestamp < EXTENSION_ANTISNIPE) {
            sub.fin = block.timestamp + EXTENSION_ANTISNIPE;
        }

        // Devolver ETH al postor anterior
        if (postorAnterior != address(0) && montoAnterior > 0) {
            (bool devuelto, ) = payable(postorAnterior).call{value: montoAnterior}("");
            require(devuelto, "Fallo al devolver ETH al postor anterior");
        }

        emit PujaRealizada(subastaId, msg.sender, msg.value);
    }

    /// @notice Finaliza una subasta expirada. Transfiere NFT y ETH o devuelve el NFT.
    /// @param subastaId El ID de la subasta.
    function finalizarSubasta(uint256 subastaId) external nonReentrant {
        Subasta storage sub = subastas[subastaId];
        require(sub.activa, "Subasta no activa");
        require(block.timestamp >= sub.fin, "La subasta aun no ha expirado");
        require(!sub.finalizada, "Ya fue finalizada");

        sub.activa = false;
        sub.finalizada = true;
        tokenTieneSubasta[sub.tokenId] = false;

        // Cancelar ofertas ETH pendientes sobre este token
        _cancelarOfertasETHPendientes(sub.tokenId, type(uint256).max);

        bool hayGanador = sub.mejorPostor != address(0) && sub.pujaActual > 0;
        bool cumpleReserva = sub.precioMinimo == 0 || sub.pujaActual >= sub.precioMinimo;

        if (hayGanador && cumpleReserva) {
            // Transferir NFT al ganador
            nftContrato.transferFrom(sub.vendedor, sub.mejorPostor, sub.tokenId);

            // Enviar ETH al vendedor
            (bool enviado, ) = payable(sub.vendedor).call{value: sub.pujaActual}("");
            require(enviado, "Fallo al enviar ETH al vendedor");

            emit SubastaFinalizada(subastaId, sub.mejorPostor, sub.pujaActual);
        } else {
            // No hubo ganador o no se alcanzo la reserva: devolver ETH si habia postor
            if (sub.mejorPostor != address(0) && sub.pujaActual > 0) {
                (bool devuelto, ) = payable(sub.mejorPostor).call{value: sub.pujaActual}("");
                require(devuelto, "Fallo al devolver ETH al postor");
            }

            emit SubastaFinalizada(subastaId, address(0), 0);
        }
    }

    /// @notice El vendedor cancela la subasta (solo si no tiene pujas).
    /// @param subastaId El ID de la subasta.
    function cancelarSubasta(uint256 subastaId) external {
        Subasta storage sub = subastas[subastaId];
        require(sub.activa, "Subasta no activa");
        require(sub.vendedor == msg.sender, "No eres el vendedor");
        require(sub.mejorPostor == address(0), "No se puede cancelar con pujas activas");

        sub.activa = false;
        sub.finalizada = true;
        tokenTieneSubasta[sub.tokenId] = false;

        emit SubastaCancelada(subastaId);
    }

    // ── Consultas de Subasta ──────────────────────────────

    /// @notice Obtiene los detalles completos de una subasta.
    function obtenerSubasta(uint256 subastaId) external view returns (
        address vendedor,
        uint256 tokenId,
        uint256 precioMinimo,
        uint256 pujaActual,
        address mejorPostor,
        uint256 inicio,
        uint256 fin,
        bool activa,
        bool finalizada
    ) {
        Subasta memory s = subastas[subastaId];
        return (
            s.vendedor,
            s.tokenId,
            s.precioMinimo,
            s.pujaActual,
            s.mejorPostor,
            s.inicio,
            s.fin,
            s.activa,
            s.finalizada
        );
    }

    /// @notice Devuelve el total de subastas creadas.
    function totalSubastas() external view returns (uint256) {
        return nextSubastaId;
    }
}
