import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import { useWallet, CONTRACT_ADDRESS, MARKETPLACE_ADDRESS, IPFS_GATEWAY } from '../App';
import CartasABI from '../Cartas.json';
import MarketplaceABI from '../Marketplace.json';
import './DetalleNFT.css';

const METADATA_GATEWAY = 'https://gateway.pinata.cloud/ipfs/bafybeif7xavsu6hjpt7aabpumtoy44xquzmgou2fkoldwvmop3ik32jbcq';

/**
 * Truncar una dirección Ethereum para mostrar
 */
function truncarAddress(addr) {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/**
 * Formatear un timestamp a una fecha legible
 */
function formatFecha(timestamp) {
    return new Date(timestamp * 1000).toLocaleDateString('es-ES', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function DetalleNFT() {
    const { tokenId } = useParams();
    const navigate = useNavigate();
    const { cuenta, mostrarToast } = useWallet();

    const [nft, setNft] = useState(null);
    const [metadata, setMetadata] = useState(null);
    const [propietario, setPropietario] = useState('');
    const [historial, setHistorial] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');

    // Estado para el modal de transferencia
    const [mostrarModalTransferencia, setMostrarModalTransferencia] = useState(false);
    const [direccionDestino, setDireccionDestino] = useState('');
    const [transfiriendo, setTransfiriendo] = useState(false);

    // Estado para el marketplace
    const [listado, setListado] = useState(null); // { vendedor, precio, activo }
    const [mostrarModalListar, setMostrarModalListar] = useState(false);
    const [precioVenta, setPrecioVenta] = useState('');
    const [procesandoMarketplace, setProcesandoMarketplace] = useState(false);

    // Estado para quemar NFT
    const [mostrarModalQuemar, setMostrarModalQuemar] = useState(false);
    const [quemando, setQuemando] = useState(false);

    // Estado para ofertas
    const [mostrarModalOferta, setMostrarModalOferta] = useState(false);
    const [tipoOferta, setTipoOferta] = useState('eth'); // 'eth' | 'intercambio'
    const [montoOfertaETH, setMontoOfertaETH] = useState('');
    const [procesandoOferta, setProcesandoOferta] = useState(false);
    const [misCartas, setMisCartas] = useState([]);
    const [cartasSeleccionadas, setCartasSeleccionadas] = useState([]); // IDs de mis cartas a ofrecer
    const [cargandoMisCartas, setCargandoMisCartas] = useState(false);

    // Estado para mostrar/ocultar historial
    const [mostrarHistorial, setMostrarHistorial] = useState(true);

    // Estado para ofertas recibidas sobre este NFT
    const [ofertasNFT, setOfertasNFT] = useState([]);
    const [cargandoOfertas, setCargandoOfertas] = useState(false);
    const [mostrarOfertas, setMostrarOfertas] = useState(true);
    const [procesandoAccionOferta, setProcesandoAccionOferta] = useState(false);

    // Estado para subastas
    const [subasta, setSubasta] = useState(null); // { subastaId, vendedor, precioMinimo, pujaActual, mejorPostor, fin, activa }
    const [mostrarModalSubasta, setMostrarModalSubasta] = useState(false);
    const [duracionSubasta, setDuracionSubasta] = useState('24');
    const [precioMinimoSubasta, setPrecioMinimoSubasta] = useState('');
    const [montoPuja, setMontoPuja] = useState('');
    const [procesandoSubasta, setProcesandoSubasta] = useState(false);
    const [tiempoRestante, setTiempoRestante] = useState('');
    const timerRef = useRef(null);

    const cargarDatos = async () => {
        setCargando(true);
        setError('');
        try {
            if (!window.ethereum) {
                throw new Error("MetaMask no detectado");
            }

            const provider = new ethers.BrowserProvider(window.ethereum);
            const contrato = new ethers.Contract(CONTRACT_ADDRESS, CartasABI.abi, provider);

            // Obtener datos del contrato
            const bichoId = await contrato.bichoAsignado(tokenId);
            const owner = await contrato.ownerOf(tokenId);

            setNft({
                id: Number(tokenId),
                bichoReal: Number(bichoId),
            });
            setPropietario(owner.toLowerCase());

            // Obtener metadatos de IPFS
            try {
                const metaUrl = `${METADATA_GATEWAY}/${Number(bichoId)}.json`;
                const resp = await fetch(metaUrl);
                if (resp.ok) {
                    const data = await resp.json();
                    setMetadata(data);
                }
            } catch (metaErr) {
                console.warn("No se pudieron cargar metadatos IPFS:", metaErr);
            }

            // Obtener historial de transferencias (eventos Transfer)
            try {
                const filterTransfer = contrato.filters.Transfer(null, null, tokenId);
                const eventos = await contrato.queryFilter(filterTransfer, 0, 'latest');
                const transfers = await Promise.all(
                    eventos.map(async (ev) => {
                        const block = await provider.getBlock(ev.blockNumber);
                        return {
                            de: ev.args[0],
                            para: ev.args[1],
                            bloque: ev.blockNumber,
                            txHash: ev.transactionHash,
                            timestamp: block?.timestamp ?? 0,
                        };
                    })
                );
                setHistorial(transfers.reverse());
            } catch (histErr) {
                console.warn("No se pudo cargar historial:", histErr);
            }

            // Obtener estado del marketplace
            try {
                const marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, MarketplaceABI.abi, provider);
                const [vendedorL, precioL, activoL] = await marketplace.obtenerListado(tokenId);
                if (activoL) {
                    setListado({
                        vendedor: vendedorL.toLowerCase(),
                        precio: ethers.formatEther(precioL),
                        precioWei: precioL,
                        activo: true
                    });
                } else {
                    setListado(null);
                }
            } catch (mktErr) {
                console.warn("No se pudo consultar el marketplace:", mktErr);
                setListado(null);
            }

            // Obtener subasta activa del token
            try {
                const marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, MarketplaceABI.abi, provider);
                const tieneSubasta = await marketplace.tokenTieneSubasta(tokenId);
                if (tieneSubasta) {
                    const subastaId = Number(await marketplace.subastaActivaDeToken(tokenId));
                    const [vendedorS, , precioMinimoS, pujaActualS, mejorPostorS, inicioS, finS, activaS, finalizadaS] =
                        await marketplace.obtenerSubasta(subastaId);
                    if (activaS) {
                        setSubasta({
                            subastaId,
                            vendedor: vendedorS.toLowerCase(),
                            precioMinimo: ethers.formatEther(precioMinimoS),
                            precioMinimoWei: precioMinimoS,
                            pujaActual: ethers.formatEther(pujaActualS),
                            pujaActualWei: pujaActualS,
                            mejorPostor: mejorPostorS,
                            inicio: Number(inicioS),
                            fin: Number(finS),
                            activa: true,
                            finalizada: finalizadaS
                        });
                    } else {
                        setSubasta(null);
                    }
                } else {
                    setSubasta(null);
                }
            } catch (subErr) {
                console.warn("No se pudo consultar subastas:", subErr);
                setSubasta(null);
            }

            // Cargar ofertas para este NFT
            await cargarOfertasNFT(provider);

        } catch (err) {
            console.error("Error cargando NFT:", err);
            setError("No se pudo cargar este NFT. Comprueba que el Token ID es válido.");
        } finally {
            setCargando(false);
        }
    };

    /**
     * Cargar todas las ofertas (ETH e intercambio) que apuntan a este NFT
     */
    const cargarOfertasNFT = async (provider) => {
        setCargandoOfertas(true);
        try {
            const marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, MarketplaceABI.abi, provider);
            const cartas = new ethers.Contract(CONTRACT_ADDRESS, CartasABI.abi, provider);
            const ofertas = [];

            // Ofertas ETH sobre este token
            const totalETH = Number(await marketplace.nextOfertaETHId());
            for (let i = 0; i < totalETH; i++) {
                const [oferente, tokenIdObj, montoETH, activa] = await marketplace.obtenerOfertaETH(i);
                if (!activa || Number(tokenIdObj) !== Number(tokenId)) continue;
                ofertas.push({
                    id: i,
                    tipo: 'eth',
                    oferente,
                    montoETH: ethers.formatEther(montoETH)
                });
            }

            // Ofertas de intercambio que solicitan este token
            const totalInt = Number(await marketplace.nextOfertaIntercambioId());
            for (let i = 0; i < totalInt; i++) {
                const [oferente, destinatario, tokensOfrecidos, tokensSolicitados, activa] =
                    await marketplace.obtenerOfertaIntercambio(i);
                if (!activa) continue;
                const solicita = tokensSolicitados.map(t => Number(t));
                if (!solicita.includes(Number(tokenId))) continue;

                // Obtener info de las cartas ofrecidas
                const cartasInfo = await Promise.all(
                    tokensOfrecidos.map(async (tid) => {
                        const tNum = Number(tid);
                        let nombre = `#${tNum}`;
                        let imagen = '';
                        try {
                            const bichoId = Number(await cartas.bichoAsignado(tNum));
                            imagen = `${IPFS_GATEWAY}/${bichoId}.png`;
                            const resp = await fetch(`${METADATA_GATEWAY}/${bichoId}.json`);
                            if (resp.ok) {
                                const data = await resp.json();
                                nombre = data.name || nombre;
                            }
                        } catch (e) { }
                        return { tokenId: tNum, nombre, imagen };
                    })
                );

                ofertas.push({
                    id: i,
                    tipo: 'intercambio',
                    oferente,
                    destinatario,
                    cartasOfrecidas: cartasInfo
                });
            }

            setOfertasNFT(ofertas);
        } catch (err) {
            console.warn("Error cargando ofertas del NFT:", err);
        } finally {
            setCargandoOfertas(false);
        }
    };

    /**
     * Ejecutar acción sobre una oferta (aceptar/rechazar/cancelar)
     */
    const ejecutarAccionOferta = async (accion, ofertaId, label) => {
        setProcesandoAccionOferta(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, MarketplaceABI.abi, signer);

            // Para aceptar ofertas, necesitamos aprobación
            if (accion === 'aceptarETH' || accion === 'aceptarIntercambio') {
                const contratoCartas = new ethers.Contract(CONTRACT_ADDRESS, CartasABI.abi, signer);
                const yaAprobado = await contratoCartas.isApprovedForAll(cuenta, MARKETPLACE_ADDRESS);
                if (!yaAprobado) {
                    mostrarToast("Paso 1/2: Aprobando para transferencia...", "info");
                    const txApprove = await contratoCartas.setApprovalForAll(MARKETPLACE_ADDRESS, true);
                    await txApprove.wait();
                }
            }

            mostrarToast(`Procesando: ${label}...`, "info");
            let tx;
            switch (accion) {
                case 'aceptarETH': tx = await marketplace.aceptarOfertaETH(ofertaId); break;
                case 'rechazarETH': tx = await marketplace.rechazarOfertaETH(ofertaId); break;
                case 'cancelarETH': tx = await marketplace.cancelarOfertaETH(ofertaId); break;
                case 'aceptarIntercambio': tx = await marketplace.aceptarOfertaIntercambio(ofertaId); break;
                case 'rechazarIntercambio': tx = await marketplace.rechazarOfertaIntercambio(ofertaId); break;
                case 'cancelarIntercambio': tx = await marketplace.cancelarOfertaIntercambio(ofertaId); break;
                default: throw new Error("Acción desconocida");
            }
            await tx.wait();
            mostrarToast(`✅ ${label} completado.`, "success");
            cargarDatos(); // Recargar todo
        } catch (err) {
            console.error(`Error en ${accion}:`, err);
            if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
                mostrarToast("Acción cancelada por el usuario.", "error");
            } else {
                mostrarToast(`Error: ${err.reason || err.message || 'Error desconocido'}`, "error");
            }
        } finally {
            setProcesandoAccionOferta(false);
        }
    };

    useEffect(() => {
        cargarDatos();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tokenId]);

    /**
     * Transferir el NFT a otra dirección usando safeTransferFrom de ERC-721
     */
    const transferirNFT = async () => {
        // Validar dirección
        if (!ethers.isAddress(direccionDestino)) {
            mostrarToast("La dirección introducida no es una dirección Ethereum válida.", "error");
            return;
        }

        // No transferir a uno mismo
        if (direccionDestino.toLowerCase() === cuenta.toLowerCase()) {
            mostrarToast("No puedes transferir el NFT a tu propia dirección.", "error");
            return;
        }

        setTransfiriendo(true);
        mostrarToast("Procesando transferencia...", "info");

        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contrato = new ethers.Contract(CONTRACT_ADDRESS, CartasABI.abi, signer);

            // Llamar a safeTransferFrom(de, para, tokenId)
            const tx = await contrato['safeTransferFrom(address,address,uint256)'](
                cuenta,
                direccionDestino,
                tokenId
            );

            mostrarToast("Transacción enviada. Esperando confirmación...", "info");
            await tx.wait();

            mostrarToast("¡NFT transferido exitosamente! 🎉", "success");
            setMostrarModalTransferencia(false);
            setDireccionDestino('');

            // Recargar datos para reflejar el nuevo propietario
            setTimeout(() => cargarDatos(), 2000);

        } catch (err) {
            console.error("Error al transferir NFT:", err);
            if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
                mostrarToast("Transferencia cancelada por el usuario.", "error");
            } else {
                mostrarToast("Error al transferir el NFT. Inténtalo de nuevo.", "error");
            }
        } finally {
            setTransfiriendo(false);
        }
    };

    /**
     * Listar NFT en el marketplace
     */
    const listarEnMarketplace = async () => {
        if (!precioVenta || isNaN(precioVenta) || Number(precioVenta) <= 0) {
            mostrarToast("Introduce un precio válido en ETH.", "error");
            return;
        }

        setProcesandoMarketplace(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contrato = new ethers.Contract(CONTRACT_ADDRESS, CartasABI.abi, signer);
            const marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, MarketplaceABI.abi, signer);

            // Paso 1: Aprobar al marketplace para mover este NFT
            mostrarToast("Paso 1/2: Aprobando al marketplace...", "info");
            const txApprove = await contrato.approve(MARKETPLACE_ADDRESS, tokenId);
            await txApprove.wait();

            // Paso 2: Listar el NFT
            mostrarToast("Paso 2/2: Listando NFT en el marketplace...", "info");
            const precioWei = ethers.parseEther(precioVenta);
            const txListar = await marketplace.listarNFT(tokenId, precioWei);
            await txListar.wait();

            mostrarToast("¡NFT listado exitosamente! 🏷️", "success");
            setMostrarModalListar(false);
            setPrecioVenta('');
            setTimeout(() => cargarDatos(), 2000);

        } catch (err) {
            console.error("Error al listar:", err);
            if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
                mostrarToast("Operación cancelada por el usuario.", "error");
            } else {
                mostrarToast("Error al listar el NFT. Inténtalo de nuevo.", "error");
            }
        } finally {
            setProcesandoMarketplace(false);
        }
    };

    /**
     * Cancelar un listado activo y revocar permisos (Seguridad)
     */
    const cancelarListado = async () => {
        setProcesandoMarketplace(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            
            // 1. Cancelar en Marketplace
            mostrarToast("Paso 1/2: Cancelando listado...", "info");
            const marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, MarketplaceABI.abi, signer);
            const txCancelar = await marketplace.cancelarListado(tokenId);
            await txCancelar.wait();

            // 2. Revocar permisos de ERC-721 por seguridad
            mostrarToast("Paso 2/2: Revocando permisos (Seguridad)...", "info");
            const contratoCartas = new ethers.Contract(CONTRACT_ADDRESS, CartasABI.abi, signer);
            const txRevocar = await contratoCartas.approve(ethers.ZeroAddress, tokenId);
            await txRevocar.wait();

            mostrarToast("Listado cancelado y permisos revocados 🛡️", "success");
            setTimeout(() => cargarDatos(), 2000);

        } catch (err) {
            console.error("Error al cancelar listado o revocar permisos:", err);
            if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
                mostrarToast("Operación cancelada por el usuario.", "error");
            } else {
                mostrarToast("Error al procesar la cancelación.", "error");
            }
        } finally {
            setProcesandoMarketplace(false);
        }
    };

    /**
     * Comprar un NFT listado
     */
    const comprarNFT = async () => {
        if (!listado || !listado.activo) return;

        setProcesandoMarketplace(true);
        mostrarToast("Procesando compra...", "info");
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, MarketplaceABI.abi, signer);

            const tx = await marketplace.comprarNFT(tokenId, {
                value: listado.precioWei
            });
            await tx.wait();

            mostrarToast("¡NFT comprado exitosamente! 🎉", "success");
            setTimeout(() => cargarDatos(), 2000);

        } catch (err) {
            console.error("Error al comprar:", err);
            if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
                mostrarToast("Compra cancelada por el usuario.", "error");
            } else {
                mostrarToast("Error al comprar el NFT. Inténtalo de nuevo.", "error");
            }
        } finally {
            setProcesandoMarketplace(false);
        }
    };

    /**
     * Quemar el NFT permanentemente
     */
    const quemarNFT = async () => {
        setQuemando(true);
        mostrarToast("Procesando quema del NFT...", "info");
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contrato = new ethers.Contract(CONTRACT_ADDRESS, CartasABI.abi, signer);

            const tx = await contrato.quemarCarta(tokenId);
            mostrarToast("Transacción enviada. Esperando confirmación...", "info");
            await tx.wait();

            mostrarToast("¡NFT quemado permanentemente! 🔥", "success");
            setMostrarModalQuemar(false);

            // Redirigir a la galería tras quemar
            setTimeout(() => window.location.href = '/', 1500);

        } catch (err) {
            console.error("Error al quemar NFT:", err);
            if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
                mostrarToast("Quema cancelada por el usuario.", "error");
            } else {
                mostrarToast("Error al quemar el NFT. Inténtalo de nuevo.", "error");
            }
        } finally {
            setQuemando(false);
        }
    };

    /**
     * Cargar las cartas del usuario conectado (para el modal de intercambio)
     */
    const cargarMisCartas = async () => {
        if (!cuenta) return;
        setCargandoMisCartas(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const contrato = new ethers.Contract(CONTRACT_ADDRESS, CartasABI.abi, provider);
            const numCartas = Number(await contrato.balanceOf(cuenta));
            const lista = [];
            for (let i = 0; i < numCartas; i++) {
                const tid = Number(await contrato.tokenOfOwnerByIndex(cuenta, i));
                if (tid.toString() === tokenId) continue; // No mostrar la carta actual
                const bichoId = Number(await contrato.bichoAsignado(tid));
                let nombre = `EtherBeast #${tid}`;
                try {
                    const resp = await fetch(`${METADATA_GATEWAY}/${bichoId}.json`);
                    if (resp.ok) {
                        const data = await resp.json();
                        nombre = data.name || nombre;
                    }
                } catch (e) { }
                lista.push({
                    tokenId: tid,
                    bichoReal: bichoId,
                    nombre,
                    imagen: `${IPFS_GATEWAY}/${bichoId}.png`
                });
            }
            setMisCartas(lista);
        } catch (err) {
            console.error("Error cargando mis cartas:", err);
        } finally {
            setCargandoMisCartas(false);
        }
    };

    /**
     * Enviar una oferta de ETH por este NFT
     */
    const enviarOfertaETH = async () => {
        if (!montoOfertaETH || parseFloat(montoOfertaETH) <= 0) {
            mostrarToast("Introduce un monto válido de ETH.", "error");
            return;
        }
        setProcesandoOferta(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, MarketplaceABI.abi, signer);

            mostrarToast("Enviando oferta de ETH...", "info");
            const tx = await marketplace.crearOfertaETH(tokenId, {
                value: ethers.parseEther(montoOfertaETH)
            });
            await tx.wait();

            mostrarToast("¡Oferta de ETH enviada! 💰", "success");
            setMostrarModalOferta(false);
            setMontoOfertaETH('');
            cargarDatos(); // Recargar ofertas
        } catch (err) {
            console.error("Error al enviar oferta ETH:", err);
            if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
                mostrarToast("Oferta cancelada por el usuario.", "error");
            } else {
                mostrarToast("Error al enviar la oferta.", "error");
            }
        } finally {
            setProcesandoOferta(false);
        }
    };

    /**
     * Enviar una oferta de intercambio de cartas
     */
    const enviarOfertaIntercambio = async () => {
        if (cartasSeleccionadas.length === 0) {
            mostrarToast("Selecciona al menos una carta para ofrecer.", "error");
            return;
        }
        setProcesandoOferta(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, MarketplaceABI.abi, signer);
            const contratoCartas = new ethers.Contract(CONTRACT_ADDRESS, CartasABI.abi, signer);

            // Verificar si ya tiene aprobación global
            const yaAprobado = await contratoCartas.isApprovedForAll(cuenta, MARKETPLACE_ADDRESS);
            if (!yaAprobado) {
                mostrarToast("Paso 1/2: Aprobando cartas para intercambio...", "info");
                const txApprove = await contratoCartas.setApprovalForAll(MARKETPLACE_ADDRESS, true);
                await txApprove.wait();
            }

            mostrarToast(yaAprobado ? "Enviando oferta de intercambio..." : "Paso 2/2: Enviando oferta de intercambio...", "info");
            const tx = await marketplace.crearOfertaIntercambio(
                cartasSeleccionadas,
                [Number(tokenId)],
                propietario
            );
            await tx.wait();

            mostrarToast("¡Oferta de intercambio enviada! 🔄", "success");
            setMostrarModalOferta(false);
            setCartasSeleccionadas([]);
            cargarDatos(); // Recargar ofertas
        } catch (err) {
            console.error("Error al enviar oferta de intercambio:", err);
            if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
                mostrarToast("Oferta cancelada por el usuario.", "error");
            } else {
                mostrarToast("Error al enviar la oferta de intercambio.", "error");
            }
        } finally {
            setProcesandoOferta(false);
        }
    };

    /**
     * Toggle selección de carta para intercambio
     */
    const toggleSeleccionCarta = (tid) => {
        setCartasSeleccionadas(prev =>
            prev.includes(tid) ? prev.filter(id => id !== tid) : [...prev, tid]
        );
    };

    /**
     * Abrir modal de oferta y cargar cartas del usuario
     */
    const abrirModalOferta = () => {
        setMostrarModalOferta(true);
        setTipoOferta('eth');
        setMontoOfertaETH('');
        setCartasSeleccionadas([]);
        cargarMisCartas();
    };

    // ═══════════════════════════════════════════════════
    // ██ FUNCIONES DE SUBASTA
    // ═══════════════════════════════════════════════════

    /**
     * Crear una subasta para este NFT
     */
    const crearSubastaHandler = async () => {
        const horas = parseInt(duracionSubasta);
        if (!horas || horas < 1 || horas > 168) {
            mostrarToast("La duración debe ser entre 1 y 168 horas.", "error");
            return;
        }
        setProcesandoSubasta(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contratoCartas = new ethers.Contract(CONTRACT_ADDRESS, CartasABI.abi, signer);
            const marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, MarketplaceABI.abi, signer);

            // Paso 1: Aprobar al marketplace
            mostrarToast("Paso 1/2: Aprobando al marketplace...", "info");
            const txApprove = await contratoCartas.approve(MARKETPLACE_ADDRESS, tokenId);
            await txApprove.wait();

            // Paso 2: Crear subasta
            mostrarToast("Paso 2/2: Creando subasta...", "info");
            const precioMinWei = precioMinimoSubasta && parseFloat(precioMinimoSubasta) > 0
                ? ethers.parseEther(precioMinimoSubasta)
                : 0n;
            const tx = await marketplace.crearSubasta(tokenId, precioMinWei, horas);
            await tx.wait();

            mostrarToast("¡Subasta creada exitosamente! 🔨", "success");
            setMostrarModalSubasta(false);
            setDuracionSubasta('24');
            setPrecioMinimoSubasta('');
            setTimeout(() => cargarDatos(), 2000);
        } catch (err) {
            console.error("Error al crear subasta:", err);
            if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
                mostrarToast("Operación cancelada por el usuario.", "error");
            } else {
                mostrarToast(`Error al crear la subasta: ${err.reason || err.message || 'Error desconocido'}`, "error");
            }
        } finally {
            setProcesandoSubasta(false);
        }
    };

    /**
     * Realizar una puja en la subasta activa
     */
    const pujarHandler = async () => {
        if (!montoPuja || parseFloat(montoPuja) <= 0) {
            mostrarToast("Introduce un monto válido de ETH.", "error");
            return;
        }
        if (!subasta) return;

        setProcesandoSubasta(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, MarketplaceABI.abi, signer);

            mostrarToast("Enviando puja...", "info");
            const tx = await marketplace.pujar(subasta.subastaId, {
                value: ethers.parseEther(montoPuja)
            });
            await tx.wait();

            mostrarToast("¡Puja realizada exitosamente! 🎯", "success");
            setMontoPuja('');
            setTimeout(() => cargarDatos(), 2000);
        } catch (err) {
            console.error("Error al pujar:", err);
            if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
                mostrarToast("Puja cancelada por el usuario.", "error");
            } else {
                mostrarToast(`Error al pujar: ${err.reason || err.message || 'Error desconocido'}`, "error");
            }
        } finally {
            setProcesandoSubasta(false);
        }
    };

    /**
     * Finalizar subasta expirada
     */
    const finalizarSubastaHandler = async () => {
        if (!subasta) return;
        setProcesandoSubasta(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, MarketplaceABI.abi, signer);

            mostrarToast("Finalizando subasta...", "info");
            const tx = await marketplace.finalizarSubasta(subasta.subastaId);
            await tx.wait();

            mostrarToast("¡Subasta finalizada! 🏆", "success");
            setTimeout(() => cargarDatos(), 2000);
        } catch (err) {
            console.error("Error al finalizar subasta:", err);
            if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
                mostrarToast("Operación cancelada por el usuario.", "error");
            } else {
                mostrarToast(`Error: ${err.reason || err.message || 'Error desconocido'}`, "error");
            }
        } finally {
            setProcesandoSubasta(false);
        }
    };

    /**
     * Cancelar subasta (solo si no hay pujas)
     */
    const cancelarSubastaHandler = async () => {
        if (!subasta) return;
        setProcesandoSubasta(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, MarketplaceABI.abi, signer);

            mostrarToast("Cancelando subasta...", "info");
            const tx = await marketplace.cancelarSubasta(subasta.subastaId);
            await tx.wait();

            mostrarToast("Subasta cancelada. 🔨", "success");
            setTimeout(() => cargarDatos(), 2000);
        } catch (err) {
            console.error("Error al cancelar subasta:", err);
            if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
                mostrarToast("Operación cancelada por el usuario.", "error");
            } else {
                mostrarToast(`Error: ${err.reason || err.message || 'Error desconocido'}`, "error");
            }
        } finally {
            setProcesandoSubasta(false);
        }
    };

    /**
     * Formatear tiempo restante de subasta
     */
    const formatearTiempoRestante = useCallback((finTimestamp) => {
        const ahora = Math.floor(Date.now() / 1000);
        const diff = finTimestamp - ahora;
        if (diff <= 0) return 'Expirada';

        const dias = Math.floor(diff / 86400);
        const horas = Math.floor((diff % 86400) / 3600);
        const minutos = Math.floor((diff % 3600) / 60);
        const segundos = diff % 60;

        if (dias > 0) return `${dias}d ${horas}h ${minutos}m`;
        if (horas > 0) return `${horas}h ${minutos}m ${segundos}s`;
        return `${minutos}m ${segundos}s`;
    }, []);

    // Timer de countdown para subasta activa
    useEffect(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (!subasta || !subasta.activa) {
            setTiempoRestante('');
            return;
        }
        const actualizar = () => {
            setTiempoRestante(formatearTiempoRestante(subasta.fin));
        };
        actualizar();
        timerRef.current = setInterval(actualizar, 1000);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [subasta, formatearTiempoRestante]);

    if (cargando) {
        return (
            <div className="detalle-loading">
                <span className="spinner">⚙️</span>
                Cargando NFT #{tokenId}...
            </div>
        );
    }

    if (error || !nft) {
        return (
            <div className="detalle-container">
                <button className="btn-volver" onClick={() => navigate('/')}>← Volver a la colección</button>
                <div className="detalle-error">❌ {error || "NFT no encontrado"}</div>
            </div>
        );
    }

    const imagenUrl = `${IPFS_GATEWAY}/${nft.bichoReal}.png`;
    const esPropietario = cuenta && propietario && cuenta.toLowerCase() === propietario;
    const nombreNFT = metadata?.name ?? `EtherBeast #${nft.id}`;
    const descripcion = metadata?.description ?? "Una criatura única acuñada en la blockchain de Ethereum.";
    const atributos = metadata?.attributes ?? [];

    return (
        <div className="detalle-container">
            {/* Botón volver */}
            <button className="btn-volver" onClick={() => navigate('/')}>
                ← Volver a la colección
            </button>

            <div className="detalle-layout">
                {/* Columna: Imagen */}
                <div>
                    <div className="detalle-imagen-wrap">
                        <img
                            src={imagenUrl}
                            alt={nombreNFT}
                            className="detalle-imagen"
                            onError={(e) => { e.target.src = ''; }}
                        />
                    </div>
                </div>

                {/* Columna: Información */}
                <div className="detalle-info">
                    <div>
                        <p className="detalle-token-id">TOKEN ID #{nft.id} · ETHBEASTS · SEPOLIA</p>
                        <h1 className="detalle-nombre">{nombreNFT}</h1>
                        <p className="detalle-descripcion">{descripcion}</p>
                    </div>

                    {/* Propietario */}
                    <div className="detalle-propietario">
                        <p className="detalle-propietario-label">Propietario actual</p>
                        <p className={`detalle-propietario-address ${esPropietario ? 'es-tuyo' : ''}`}>
                            {esPropietario ? `✅ Tú (${truncarAddress(propietario)})` : truncarAddress(propietario)}
                        </p>
                    </div>

                    {/* Atributos */}
                    {atributos.length > 0 && (
                        <div>
                            <p className="detalle-atributos-titulo">Atributos</p>
                            <div className="detalle-atributos-grid">
                                {atributos.map((attr, i) => {
                                    const claseRareza = attr.trait_type?.toLowerCase() === 'rareza'
                                        ? `rareza-${attr.value}`
                                        : '';
                                    return (
                                        <div key={i} className={`atributo-badge ${claseRareza}`}>
                                            <p className="atributo-tipo">{attr.trait_type}</p>
                                            <p className="atributo-valor">{attr.value}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Panel de acciones — layout unificado */}
                    <div className="detalle-acciones">
                        <p className="acciones-titulo">
                            {esPropietario ? '🔑 Panel del Propietario' : '🛒 Opciones de Adquisición'}
                        </p>

                        {/* Área de precio / subasta — siempre reserva espacio */}
                        <div className="listado-precio-container">
                            {subasta && subasta.activa ? (
                                <div className="listado-activo-badge subasta-badge-panel">
                                    <p className="listado-label">🔨 En subasta</p>
                                    <p className="listado-precio subasta-precio">
                                        {Number(subasta.pujaActual) > 0
                                            ? `Ξ ${subasta.pujaActual} ETH`
                                            : Number(subasta.precioMinimo) > 0
                                                ? `Desde Ξ ${subasta.precioMinimo} ETH`
                                                : 'Sin pujas aún'}
                                    </p>
                                    <p className={`subasta-timer ${tiempoRestante === 'Expirada' ? 'expirada' : ''}`}>
                                        ⏱️ {tiempoRestante}
                                    </p>
                                </div>
                            ) : listado && listado.activo ? (
                                <div className={`listado-activo-badge ${esPropietario ? '' : 'comprador'}`}>
                                    <p className="listado-label">
                                        {esPropietario ? '🏷️ En venta por' : '🏷️ Precio de venta'}
                                    </p>
                                    <p className="listado-precio">Ξ {listado.precio} ETH</p>
                                </div>
                            ) : (
                                <div className="listado-activo-badge listado-placeholder">
                                    <p className="listado-label">🏷️ Estado</p>
                                    <p className="listado-precio listado-precio-no-venta">No listado</p>
                                </div>
                            )}
                        </div>

                        {/* Grid de botones — siempre 3 botones */}
                        <div className="acciones-grid">
                            {esPropietario ? (
                                <>
                                    <button
                                        className="btn-accion propietario activo"
                                        onClick={() => setMostrarModalTransferencia(true)}
                                        disabled={listado?.activo || subasta?.activa}
                                    >
                                        📤 Transferir a otro usuario
                                    </button>

                                    {listado && listado.activo ? (
                                        <button
                                            className="btn-accion propietario activo cancelar"
                                            onClick={cancelarListado}
                                            disabled={procesandoMarketplace}
                                        >
                                            {procesandoMarketplace ? '⏳ Cancelando...' : '❌ Cancelar listado'}
                                        </button>
                                    ) : (
                                        <button
                                            className="btn-accion propietario activo"
                                            onClick={() => setMostrarModalListar(true)}
                                            disabled={procesandoMarketplace || subasta?.activa}
                                        >
                                            🏷️ Listar para Venta
                                        </button>
                                    )}

                                    {subasta && subasta.activa ? (
                                        tiempoRestante === 'Expirada' ? (
                                            <button
                                                className="btn-accion propietario activo subasta"
                                                onClick={finalizarSubastaHandler}
                                                disabled={procesandoSubasta}
                                            >
                                                {procesandoSubasta ? '⏳ Finalizando...' : '🏆 Finalizar Subasta'}
                                            </button>
                                        ) : (
                                            subasta.mejorPostor === '0x0000000000000000000000000000000000000000' ? (
                                                <button
                                                    className="btn-accion propietario activo cancelar"
                                                    onClick={cancelarSubastaHandler}
                                                    disabled={procesandoSubasta}
                                                >
                                                    {procesandoSubasta ? '⏳ Cancelando...' : '❌ Cancelar Subasta'}
                                                </button>
                                            ) : (
                                                <button className="btn-accion propietario" disabled>
                                                    🔨 Subasta en curso
                                                </button>
                                            )
                                        )
                                    ) : (
                                        <button
                                            className="btn-accion propietario activo subasta"
                                            onClick={() => setMostrarModalSubasta(true)}
                                            disabled={listado?.activo || procesandoSubasta}
                                        >
                                            🔨 Iniciar Subasta
                                        </button>
                                    )}

                                    <button
                                        className="btn-accion propietario activo quemar"
                                        onClick={() => setMostrarModalQuemar(true)}
                                        disabled={listado?.activo || subasta?.activa}
                                    >
                                        🔥 Quemar Carta
                                    </button>
                                </>
                            ) : (
                                <>
                                    {subasta && subasta.activa ? (
                                        tiempoRestante === 'Expirada' ? (
                                            <button
                                                className="btn-accion comprador activo subasta-btn"
                                                onClick={finalizarSubastaHandler}
                                                disabled={!cuenta || procesandoSubasta}
                                            >
                                                {procesandoSubasta ? '⏳ Finalizando...' : '🏆 Finalizar Subasta'}
                                            </button>
                                        ) : (
                                            <div className="subasta-puja-inline">
                                                <div className="subasta-puja-info">
                                                    <span className="subasta-puja-label">Puja actual:</span>
                                                    <span className="subasta-puja-monto">
                                                        {Number(subasta.pujaActual) > 0 ? `Ξ ${subasta.pujaActual} ETH` : 'Sin pujas'}
                                                    </span>
                                                    {Number(subasta.precioMinimo) > 0 && Number(subasta.pujaActual) === 0 && (
                                                        <span className="subasta-puja-reserva">Mín: {subasta.precioMinimo} ETH</span>
                                                    )}
                                                </div>
                                                <div className="subasta-puja-input-row">
                                                    <input
                                                        className="modal-input subasta-input-puja"
                                                        type="number"
                                                        step="0.001"
                                                        min="0"
                                                        placeholder={Number(subasta.pujaActual) > 0
                                                            ? `> ${subasta.pujaActual}`
                                                            : Number(subasta.precioMinimo) > 0
                                                                ? `≥ ${subasta.precioMinimo}`
                                                                : '0.01'}
                                                        value={montoPuja}
                                                        onChange={(e) => setMontoPuja(e.target.value)}
                                                        disabled={procesandoSubasta}
                                                    />
                                                    <button
                                                        className="btn-pujar"
                                                        onClick={pujarHandler}
                                                        disabled={!cuenta || procesandoSubasta || !montoPuja}
                                                    >
                                                        {procesandoSubasta ? '⏳' : '🔨 Pujar'}
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    ) : listado && listado.activo ? (
                                        <button
                                            className="btn-accion comprador activo"
                                            onClick={comprarNFT}
                                            disabled={!cuenta || procesandoMarketplace}
                                        >
                                            {procesandoMarketplace
                                                ? '⏳ Comprando...'
                                                : `⚡ Comprar por ${listado.precio} ETH`}
                                        </button>
                                    ) : (
                                        <button className="btn-accion comprador" disabled>
                                            ⚡ No está en venta
                                        </button>
                                    )}

                                    <button
                                        className="btn-accion comprador activo oferta"
                                        onClick={abrirModalOferta}
                                        disabled={!cuenta || procesandoOferta}
                                    >
                                        💬 Enviar Oferta
                                    </button>

                                    {/* Botón placeholder para igualar altura con panel del propietario */}
                                    <div className="btn-accion-placeholder" aria-hidden="true"></div>
                                </>
                            )}
                        </div>

                        {!cuenta && (
                            <p className="acciones-hint-wallet">
                                Conecta tu wallet para ver las opciones disponibles.
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Modal de Transferencia */}
            {mostrarModalTransferencia && (
                <div className="modal-overlay" onClick={() => !transfiriendo && setMostrarModalTransferencia(false)}>
                    <div className="modal-transferencia" onClick={(e) => e.stopPropagation()}>
                        <h2 className="modal-titulo">📤 Transferir NFT</h2>
                        <p className="modal-subtitulo">
                            Vas a transferir <strong>{nombreNFT}</strong> (Token #{nft.id}) a otra dirección.
                            Esta acción es irreversible.
                        </p>

                        <label className="modal-label">Dirección del destinatario</label>
                        <input
                            className="modal-input"
                            type="text"
                            placeholder="0x..."
                            value={direccionDestino}
                            onChange={(e) => setDireccionDestino(e.target.value)}
                            disabled={transfiriendo}
                            autoFocus
                        />

                        <div className="modal-botones">
                            <button
                                className="btn-confirmar-transferencia"
                                onClick={transferirNFT}
                                disabled={transfiriendo || !direccionDestino.trim()}
                            >
                                {transfiriendo ? "⏳ Transfiriendo..." : "✅ Confirmar transferencia"}
                            </button>
                            <button
                                className="btn-cancelar-transferencia"
                                onClick={() => {
                                    setMostrarModalTransferencia(false);
                                    setDireccionDestino('');
                                }}
                                disabled={transfiriendo}
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Listar para Venta */}
            {mostrarModalListar && (
                <div className="modal-overlay" onClick={() => !procesandoMarketplace && setMostrarModalListar(false)}>
                    <div className="modal-transferencia" onClick={(e) => e.stopPropagation()}>
                        <h2 className="modal-titulo">🏷️ Listar para Venta</h2>
                        <p className="modal-subtitulo">
                            Vas a poner <strong>{nombreNFT}</strong> (Token #{nft.id}) en venta en el marketplace.
                            Necesitarás aprobar 2 transacciones en MetaMask.
                        </p>

                        <label className="modal-label">Precio de venta (ETH)</label>
                        <input
                            className="modal-input"
                            type="number"
                            step="0.001"
                            min="0"
                            placeholder="0.05"
                            value={precioVenta}
                            onChange={(e) => setPrecioVenta(e.target.value)}
                            disabled={procesandoMarketplace}
                            autoFocus
                        />

                        <div className="modal-botones">
                            <button
                                className="btn-confirmar-transferencia"
                                onClick={listarEnMarketplace}
                                disabled={procesandoMarketplace || !precioVenta}
                            >
                                {procesandoMarketplace ? "⏳ Procesando..." : "🏷️ Listar en Marketplace"}
                            </button>
                            <button
                                className="btn-cancelar-transferencia"
                                onClick={() => {
                                    setMostrarModalListar(false);
                                    setPrecioVenta('');
                                }}
                                disabled={procesandoMarketplace}
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Quemar NFT */}
            {mostrarModalQuemar && (
                <div className="modal-overlay" onClick={() => !quemando && setMostrarModalQuemar(false)}>
                    <div className="modal-transferencia" onClick={(e) => e.stopPropagation()}>
                        <h2 className="modal-titulo modal-titulo-quemar">🔥 Quemar Carta</h2>
                        <p className="modal-subtitulo">
                            Vas a <strong>destruir permanentemente</strong> <strong>{nombreNFT}</strong> (Token #{nft.id}).
                            Esta acción es <strong>irreversible</strong> y el NFT dejará de existir para siempre.
                        </p>

                        <div className="modal-warning-quemar">
                            ⚠️ Una vez quemado, este NFT no podrá recuperarse de ninguna forma.
                        </div>

                        <div className="modal-botones">
                            <button
                                className="btn-confirmar-quemar"
                                onClick={quemarNFT}
                                disabled={quemando}
                            >
                                {quemando ? "⏳ Quemando..." : "🔥 Confirmar quema"}
                            </button>
                            <button
                                className="btn-cancelar-transferencia"
                                onClick={() => setMostrarModalQuemar(false)}
                                disabled={quemando}
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Enviar Oferta */}
            {mostrarModalOferta && (
                <div className="modal-overlay" onClick={() => !procesandoOferta && setMostrarModalOferta(false)}>
                    <div className="modal-transferencia modal-oferta" onClick={(e) => e.stopPropagation()}>
                        <h2 className="modal-titulo modal-titulo-oferta">💬 Enviar Oferta</h2>
                        <p className="modal-subtitulo">
                            Envía una oferta al propietario de <strong>{nombreNFT}</strong> (Token #{nft.id}).
                        </p>

                        {/* Tabs ETH / Intercambio */}
                        <div className="oferta-tabs">
                            <button
                                className={`oferta-tab ${tipoOferta === 'eth' ? 'activo' : ''}`}
                                onClick={() => setTipoOferta('eth')}
                                disabled={procesandoOferta}
                            >
                                💰 Ofrecer ETH
                            </button>
                            <button
                                className={`oferta-tab ${tipoOferta === 'intercambio' ? 'activo' : ''}`}
                                onClick={() => setTipoOferta('intercambio')}
                                disabled={procesandoOferta}
                            >
                                🔄 Intercambiar Cartas
                            </button>
                        </div>

                        {/* Contenido según tipo */}
                        {tipoOferta === 'eth' ? (
                            <div className="oferta-contenido">
                                <label className="modal-label">Monto a ofrecer (ETH)</label>
                                <input
                                    className="modal-input"
                                    type="number"
                                    step="0.001"
                                    min="0"
                                    placeholder="0.01"
                                    value={montoOfertaETH}
                                    onChange={(e) => setMontoOfertaETH(e.target.value)}
                                    disabled={procesandoOferta}
                                    autoFocus
                                />
                                <p className="oferta-hint">
                                    El ETH quedará en custodia hasta que el propietario acepte o rechace tu oferta.
                                </p>
                            </div>
                        ) : (
                            <div className="oferta-contenido">
                                <label className="modal-label">
                                    Selecciona las cartas que ofreces ({cartasSeleccionadas.length} seleccionada{cartasSeleccionadas.length !== 1 ? 's' : ''})
                                </label>
                                {cargandoMisCartas ? (
                                    <p className="oferta-hint">⏳ Cargando tu colección...</p>
                                ) : misCartas.length === 0 ? (
                                    <p className="oferta-hint">No tienes otras cartas para intercambiar.</p>
                                ) : (
                                    <div className="oferta-cartas-grid">
                                        {misCartas.map((carta) => (
                                            <div
                                                key={carta.tokenId}
                                                className={`oferta-carta-item ${cartasSeleccionadas.includes(carta.tokenId) ? 'seleccionada' : ''}`}
                                                onClick={() => !procesandoOferta && toggleSeleccionCarta(carta.tokenId)}
                                            >
                                                <img src={carta.imagen} alt={carta.nombre} className="oferta-carta-img" />
                                                <p className="oferta-carta-nombre">{carta.nombre}</p>
                                                <p className="oferta-carta-id">#{carta.tokenId}</p>
                                                {cartasSeleccionadas.includes(carta.tokenId) && (
                                                    <div className="oferta-carta-check">✓</div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="modal-botones">
                            <button
                                className="btn-confirmar-oferta"
                                onClick={tipoOferta === 'eth' ? enviarOfertaETH : enviarOfertaIntercambio}
                                disabled={procesandoOferta || (tipoOferta === 'eth' ? !montoOfertaETH : cartasSeleccionadas.length === 0)}
                            >
                                {procesandoOferta
                                    ? '⏳ Procesando...'
                                    : tipoOferta === 'eth'
                                        ? `💰 Enviar oferta de ${montoOfertaETH || '0'} ETH`
                                        : `🔄 Ofrecer ${cartasSeleccionadas.length} carta${cartasSeleccionadas.length !== 1 ? 's' : ''}`
                                }
                            </button>
                            <button
                                className="btn-cancelar-transferencia"
                                onClick={() => setMostrarModalOferta(false)}
                                disabled={procesandoOferta}
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Crear Subasta */}
            {mostrarModalSubasta && (
                <div className="modal-overlay" onClick={() => !procesandoSubasta && setMostrarModalSubasta(false)}>
                    <div className="modal-transferencia modal-subasta" onClick={(e) => e.stopPropagation()}>
                        <h2 className="modal-titulo modal-titulo-subasta">🔨 Iniciar Subasta</h2>
                        <p className="modal-subtitulo">
                            Vas a subastar <strong>{nombreNFT}</strong> (Token #{nft.id}).
                            Los compradores podrán pujar durante el tiempo establecido.
                        </p>

                        <label className="modal-label">Duración (horas)</label>
                        <div className="subasta-duracion-opciones">
                            {[1, 6, 12, 24, 48, 72, 168].map(h => (
                                <button
                                    key={h}
                                    className={`subasta-duracion-btn ${duracionSubasta === String(h) ? 'activo' : ''}`}
                                    onClick={() => setDuracionSubasta(String(h))}
                                    disabled={procesandoSubasta}
                                >
                                    {h < 24 ? `${h}h` : `${h / 24}d`}
                                </button>
                            ))}
                        </div>
                        <input
                            className="modal-input"
                            type="number"
                            min="1"
                            max="168"
                            placeholder="O introduce horas manualmente"
                            value={duracionSubasta}
                            onChange={(e) => setDuracionSubasta(e.target.value)}
                            disabled={procesandoSubasta}
                        />

                        <label className="modal-label" style={{ marginTop: '16px' }}>
                            Precio mínimo / reserva (ETH) — Opcional
                        </label>
                        <input
                            className="modal-input"
                            type="number"
                            step="0.001"
                            min="0"
                            placeholder="0 = sin precio mínimo"
                            value={precioMinimoSubasta}
                            onChange={(e) => setPrecioMinimoSubasta(e.target.value)}
                            disabled={procesandoSubasta}
                        />
                        <p className="oferta-hint">
                            Si estableces un precio mínimo, la subasta solo se completará si la puja más alta lo alcanza.
                            Si no se alcanza, el NFT se devuelve al propietario.
                        </p>

                        <div className="subasta-info-resumen">
                            ⚡ <strong>Anti-snipe:</strong> Si alguien puja en los últimos 5 minutos, el tiempo se extiende 5 minutos más.
                        </div>

                        <div className="modal-botones">
                            <button
                                className="btn-confirmar-subasta"
                                onClick={crearSubastaHandler}
                                disabled={procesandoSubasta || !duracionSubasta}
                            >
                                {procesandoSubasta ? '⏳ Procesando...' : '🔨 Crear Subasta'}
                            </button>
                            <button
                                className="btn-cancelar-transferencia"
                                onClick={() => {
                                    setMostrarModalSubasta(false);
                                    setDuracionSubasta('24');
                                    setPrecioMinimoSubasta('');
                                }}
                                disabled={procesandoSubasta}
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Ofertas sobre este NFT */}
            <div className="detalle-ofertas-seccion">
                <div className="historial-header">
                    <h2 className="historial-titulo">💬 Ofertas ({cargandoOfertas ? '...' : ofertasNFT.length})</h2>
                    {ofertasNFT.length > 0 && (
                        <button
                            className="btn-toggle-historial"
                            onClick={() => setMostrarOfertas(!mostrarOfertas)}
                        >
                            {mostrarOfertas ? 'Ocultar 🔼' : 'Mostrar 🔽'}
                        </button>
                    )}
                </div>

                {cargandoOfertas ? (
                    <p className="historial-vacio">⏳ Cargando ofertas...</p>
                ) : ofertasNFT.length === 0 ? (
                    <p className="historial-vacio">No hay ofertas activas para este NFT.</p>
                ) : (
                    mostrarOfertas && (
                        <div className="ofertas-nft-lista">
                            {ofertasNFT.map((oferta) => {
                                const esOferente = cuenta && oferta.oferente.toLowerCase() === cuenta.toLowerCase();
                                const esPropietario = cuenta && propietario === cuenta.toLowerCase();

                                return (
                                    <div key={`${oferta.tipo}-${oferta.id}`} className="oferta-nft-card">
                                        <div className="oferta-nft-header">
                                            <span className={`oferta-nft-badge ${oferta.tipo}`}>
                                                {oferta.tipo === 'eth' ? '💰 ETH' : '🔄 Intercambio'}
                                            </span>
                                            <span className="oferta-nft-from">
                                                {esOferente ? '📤 Tu oferta' : `de ${truncarAddress(oferta.oferente)}`}
                                            </span>
                                        </div>

                                        {oferta.tipo === 'eth' ? (
                                            <div className="oferta-nft-body">
                                                <span className="oferta-nft-monto">Ξ {oferta.montoETH} ETH</span>
                                            </div>
                                        ) : (
                                            <div className="oferta-nft-body intercambio">
                                                <span className="oferta-nft-label">Ofrece:</span>
                                                <div className="oferta-nft-cartas">
                                                    {oferta.cartasOfrecidas.map(c => (
                                                        <div
                                                            key={c.tokenId}
                                                            className="oferta-nft-mini-carta"
                                                            onClick={() => navigate(`/nft/${c.tokenId}`)}
                                                        >
                                                            {c.imagen && <img src={c.imagen} alt={c.nombre} />}
                                                            <span>{c.nombre}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        <div className="oferta-nft-acciones">
                                            {esPropietario && !esOferente && (
                                                <>
                                                    <button
                                                        className="btn-oferta-accion aceptar"
                                                        onClick={() => ejecutarAccionOferta(
                                                            oferta.tipo === 'eth' ? 'aceptarETH' : 'aceptarIntercambio',
                                                            oferta.id, 'Aceptar oferta'
                                                        )}
                                                        disabled={procesandoAccionOferta}
                                                    >
                                                        ✅ Aceptar
                                                    </button>
                                                    <button
                                                        className="btn-oferta-accion rechazar"
                                                        onClick={() => ejecutarAccionOferta(
                                                            oferta.tipo === 'eth' ? 'rechazarETH' : 'rechazarIntercambio',
                                                            oferta.id, 'Rechazar oferta'
                                                        )}
                                                        disabled={procesandoAccionOferta}
                                                    >
                                                        ❌ Rechazar
                                                    </button>
                                                </>
                                            )}
                                            {esOferente && (
                                                <button
                                                    className="btn-oferta-accion cancelar"
                                                    onClick={() => ejecutarAccionOferta(
                                                        oferta.tipo === 'eth' ? 'cancelarETH' : 'cancelarIntercambio',
                                                        oferta.id, 'Cancelar oferta'
                                                    )}
                                                    disabled={procesandoAccionOferta}
                                                >
                                                    🗑️ Cancelar
                                                </button>
                                            )}
                                            {!esPropietario && !esOferente && (
                                                <span className="oferta-nft-solo-info">Solo visible</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )
                )}
            </div>

            {/* Historial de Transferencias */}
            <div className="detalle-historial">
                <div className="historial-header">
                    <h2 className="historial-titulo">📜 Historial de Transferencias</h2>
                    {historial.length > 0 && (
                        <button 
                            className="btn-toggle-historial"
                            onClick={() => setMostrarHistorial(!mostrarHistorial)}
                            title={mostrarHistorial ? "Ocultar transacciones" : "Mostrar transacciones"}
                        >
                            {mostrarHistorial ? 'Ocultar 🔼' : 'Mostrar 🔽'}
                        </button>
                    )}
                </div>
                
                {historial.length === 0 ? (
                    <p className="historial-vacio">No se encontró historial de transferencias para este NFT.</p>
                ) : (
                    mostrarHistorial && (
                        <table className="historial-tabla">
                        <thead>
                            <tr>
                                <th>Evento</th>
                                <th>De</th>
                                <th>Para</th>
                                <th>Bloque</th>
                                <th>Fecha</th>
                                <th>TX</th>
                            </tr>
                        </thead>
                        <tbody>
                            {historial.map((t, i) => {
                                const esMint = t.de === '0x0000000000000000000000000000000000000000';
                                return (
                                    <tr key={i}>
                                        <td>{esMint ? '🪙 Mint' : '↔️ Transfer'}</td>
                                        <td>{esMint ? '—' : truncarAddress(t.de)}</td>
                                        <td>{truncarAddress(t.para)}</td>
                                        <td>#{t.bloque}</td>
                                        <td>{t.timestamp ? formatFecha(t.timestamp) : '—'}</td>
                                        <td>
                                            <a
                                                href={`https://sepolia.etherscan.io/tx/${t.txHash}`}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                {truncarAddress(t.txHash)}
                                            </a>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    )
                )}
            </div>
        </div>
    );
}

export default DetalleNFT;
