import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, MARKETPLACE_ADDRESS, IPFS_GATEWAY, useWallet } from '../App';
import CartasABI from '../Cartas.json';
import MarketplaceABI from '../Marketplace.json';
import './MisOfertas.css';

const METADATA_GATEWAY = 'https://gateway.pinata.cloud/ipfs/bafybeif7xavsu6hjpt7aabpumtoy44xquzmgou2fkoldwvmop3ik32jbcq';

function MisOfertas() {
    const navigate = useNavigate();
    const { cuenta, mostrarToast } = useWallet();
    const [ofertasETHEnviadas, setOfertasETHEnviadas] = useState([]);
    const [ofertasETHRecibidas, setOfertasETHRecibidas] = useState([]);
    const [ofertasIntEnviadas, setOfertasIntEnviadas] = useState([]);
    const [ofertasIntRecibidas, setOfertasIntRecibidas] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [procesando, setProcesando] = useState(false);
    const [tab, setTab] = useState('recibidas'); // 'recibidas' | 'enviadas'

    // Función auxiliar para obtener nombre de una carta
    const obtenerNombreCarta = async (cartas, tokenId) => {
        try {
            const bichoId = Number(await cartas.bichoAsignado(tokenId));
            const resp = await fetch(`${METADATA_GATEWAY}/${bichoId}.json`);
            if (resp.ok) {
                const data = await resp.json();
                return {
                    nombre: data.name || `EtherBeast #${tokenId}`,
                    imagen: `${IPFS_GATEWAY}/${bichoId}.png`,
                    tokenId: Number(tokenId)
                };
            }
        } catch (e) { }
        return {
            nombre: `EtherBeast #${tokenId}`,
            imagen: '',
            tokenId: Number(tokenId)
        };
    };

    const cargarOfertas = useCallback(async () => {
        if (!cuenta) return;
        setCargando(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, MarketplaceABI.abi, provider);
            const cartas = new ethers.Contract(CONTRACT_ADDRESS, CartasABI.abi, provider);

            const ethEnviadas = [];
            const ethRecibidas = [];
            const intEnviadas = [];
            const intRecibidas = [];

            // Escanear ofertas ETH
            const totalETH = Number(await marketplace.nextOfertaETHId());
            for (let i = 0; i < totalETH; i++) {
                const [oferente, tokenIdObj, montoETH, activa] = await marketplace.obtenerOfertaETH(i);
                if (!activa) continue;

                let propietarioToken;
                try {
                    propietarioToken = await cartas.ownerOf(tokenIdObj);
                } catch (e) {
                    continue; // Token quemado
                }

                const cartaInfo = await obtenerNombreCarta(cartas, tokenIdObj);

                const oferta = {
                    id: i,
                    tipo: 'eth',
                    oferente,
                    tokenIdObjetivo: Number(tokenIdObj),
                    montoETH: ethers.formatEther(montoETH),
                    carta: cartaInfo,
                    propietario: propietarioToken
                };

                if (oferente.toLowerCase() === cuenta.toLowerCase()) {
                    ethEnviadas.push(oferta);
                }
                if (propietarioToken.toLowerCase() === cuenta.toLowerCase()) {
                    ethRecibidas.push(oferta);
                }
            }

            // Escanear ofertas de intercambio
            const totalInt = Number(await marketplace.nextOfertaIntercambioId());
            for (let i = 0; i < totalInt; i++) {
                const [oferente, destinatario, tokensOfrecidos, tokensSolicitados, activa] =
                    await marketplace.obtenerOfertaIntercambio(i);
                if (!activa) continue;

                // Obtener info de las cartas ofrecidas
                const cartasOfrecidas = await Promise.all(
                    tokensOfrecidos.map(tid => obtenerNombreCarta(cartas, tid))
                );
                const cartasSolicitadas = await Promise.all(
                    tokensSolicitados.map(tid => obtenerNombreCarta(cartas, tid))
                );

                const oferta = {
                    id: i,
                    tipo: 'intercambio',
                    oferente,
                    destinatario,
                    cartasOfrecidas,
                    cartasSolicitadas
                };

                if (oferente.toLowerCase() === cuenta.toLowerCase()) {
                    intEnviadas.push(oferta);
                }
                if (destinatario.toLowerCase() === cuenta.toLowerCase()) {
                    intRecibidas.push(oferta);
                }
            }

            setOfertasETHEnviadas(ethEnviadas);
            setOfertasETHRecibidas(ethRecibidas);
            setOfertasIntEnviadas(intEnviadas);
            setOfertasIntRecibidas(intRecibidas);
        } catch (err) {
            console.error("Error cargando ofertas:", err);
            mostrarToast("Error al cargar las ofertas.", "error");
        } finally {
            setCargando(false);
        }
    }, [cuenta, mostrarToast]);

    useEffect(() => {
        cargarOfertas();
    }, [cargarOfertas]);

    // Acciones sobre ofertas
    const ejecutarAccion = async (accion, ofertaId, label) => {
        setProcesando(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, MarketplaceABI.abi, signer);

            // Para aceptar intercambios, necesitamos aprobación
            if (accion === 'aceptarIntercambio') {
                const contratoCartas = new ethers.Contract(CONTRACT_ADDRESS, CartasABI.abi, signer);
                const yaAprobado = await contratoCartas.isApprovedForAll(cuenta, MARKETPLACE_ADDRESS);
                if (!yaAprobado) {
                    mostrarToast("Paso 1/2: Aprobando cartas para intercambio...", "info");
                    const txApprove = await contratoCartas.setApprovalForAll(MARKETPLACE_ADDRESS, true);
                    await txApprove.wait();
                }
            }

            // Para aceptar ofertas ETH, necesitamos aprobación del token
            if (accion === 'aceptarETH') {
                const contratoCartas = new ethers.Contract(CONTRACT_ADDRESS, CartasABI.abi, signer);
                const yaAprobado = await contratoCartas.isApprovedForAll(cuenta, MARKETPLACE_ADDRESS);
                if (!yaAprobado) {
                    mostrarToast("Paso 1/2: Aprobando NFT para transferencia...", "info");
                    const txApprove = await contratoCartas.setApprovalForAll(MARKETPLACE_ADDRESS, true);
                    await txApprove.wait();
                }
            }

            mostrarToast(`Procesando: ${label}...`, "info");

            let tx;
            switch (accion) {
                case 'aceptarETH':
                    tx = await marketplace.aceptarOfertaETH(ofertaId);
                    break;
                case 'rechazarETH':
                    tx = await marketplace.rechazarOfertaETH(ofertaId);
                    break;
                case 'cancelarETH':
                    tx = await marketplace.cancelarOfertaETH(ofertaId);
                    break;
                case 'aceptarIntercambio':
                    tx = await marketplace.aceptarOfertaIntercambio(ofertaId);
                    break;
                case 'rechazarIntercambio':
                    tx = await marketplace.rechazarOfertaIntercambio(ofertaId);
                    break;
                case 'cancelarIntercambio':
                    tx = await marketplace.cancelarOfertaIntercambio(ofertaId);
                    break;
                default:
                    throw new Error("Acción desconocida");
            }

            await tx.wait();
            mostrarToast(`✅ ${label} completado.`, "success");
            await cargarOfertas(); // Recargar
        } catch (err) {
            console.error(`Error en ${accion}:`, err);
            if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
                mostrarToast("Acción cancelada por el usuario.", "error");
            } else {
                mostrarToast(`Error: ${err.reason || err.message || 'Error desconocido'}`, "error");
            }
        } finally {
            setProcesando(false);
        }
    };

    const truncar = (addr) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '';

    if (!cuenta) {
        return (
            <div className="mis-ofertas-container">
                <button className="btn-volver" onClick={() => navigate('/')}>← Volver</button>
                <div className="ofertas-vacio">
                    <p className="vacio-emoji">🔒</p>
                    <p className="vacio-texto">Conecta tu wallet para ver tus ofertas.</p>
                </div>
            </div>
        );
    }

    const recibidas = [...ofertasETHRecibidas, ...ofertasIntRecibidas];
    const enviadas = [...ofertasETHEnviadas, ...ofertasIntEnviadas];

    return (
        <div className="mis-ofertas-container">
            <button className="btn-volver" onClick={() => navigate('/')}>← Volver a la colección</button>

            <div className="ofertas-header">
                <h1 className="ofertas-titulo">💬 Mis Ofertas</h1>
                <p className="ofertas-subtitulo">Gestiona las ofertas enviadas y recibidas</p>
            </div>

            {/* Tabs */}
            <div className="ofertas-tabs">
                <button
                    className={`ofertas-tab ${tab === 'recibidas' ? 'activo' : ''}`}
                    onClick={() => setTab('recibidas')}
                >
                    📥 Recibidas ({recibidas.length})
                </button>
                <button
                    className={`ofertas-tab ${tab === 'enviadas' ? 'activo' : ''}`}
                    onClick={() => setTab('enviadas')}
                >
                    📤 Enviadas ({enviadas.length})
                </button>
            </div>

            {cargando && (
                <div className="ofertas-loading">
                    <span className="spinner">⚙️</span> Cargando ofertas...
                </div>
            )}

            {!cargando && (
                <div className="ofertas-lista">
                    {tab === 'recibidas' && recibidas.length === 0 && (
                        <div className="ofertas-vacio">
                            <p className="vacio-emoji">📭</p>
                            <p className="vacio-texto">No tienes ofertas recibidas.</p>
                        </div>
                    )}

                    {tab === 'enviadas' && enviadas.length === 0 && (
                        <div className="ofertas-vacio">
                            <p className="vacio-emoji">📭</p>
                            <p className="vacio-texto">No has enviado ninguna oferta.</p>
                        </div>
                    )}

                    {/* Ofertas recibidas */}
                    {tab === 'recibidas' && recibidas.map((oferta) => (
                        <div key={`${oferta.tipo}-${oferta.id}`} className="oferta-card">
                            {oferta.tipo === 'eth' ? (
                                <>
                                    <div className="oferta-card-header">
                                        <span className="oferta-badge eth">💰 Oferta de ETH</span>
                                        <span className="oferta-de">de {truncar(oferta.oferente)}</span>
                                    </div>
                                    <div className="oferta-card-body">
                                        <div className="oferta-carta-preview" onClick={() => navigate(`/nft/${oferta.carta.tokenId}`)}>
                                            <img src={oferta.carta.imagen} alt={oferta.carta.nombre} />
                                            <span>{oferta.carta.nombre}</span>
                                        </div>
                                        <div className="oferta-monto">
                                            <span className="monto-valor">Ξ {oferta.montoETH} ETH</span>
                                        </div>
                                    </div>
                                    <div className="oferta-card-acciones">
                                        <button
                                            className="btn-oferta aceptar"
                                            onClick={() => ejecutarAccion('aceptarETH', oferta.id, 'Aceptar oferta')}
                                            disabled={procesando}
                                        >
                                            ✅ Aceptar
                                        </button>
                                        <button
                                            className="btn-oferta rechazar"
                                            onClick={() => ejecutarAccion('rechazarETH', oferta.id, 'Rechazar oferta')}
                                            disabled={procesando}
                                        >
                                            ❌ Rechazar
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="oferta-card-header">
                                        <span className="oferta-badge intercambio">🔄 Intercambio</span>
                                        <span className="oferta-de">de {truncar(oferta.oferente)}</span>
                                    </div>
                                    <div className="oferta-card-body intercambio-body">
                                        <div className="intercambio-lado">
                                            <p className="intercambio-label">Te ofrecen:</p>
                                            <div className="intercambio-cartas">
                                                {oferta.cartasOfrecidas.map(c => (
                                                    <div key={c.tokenId} className="intercambio-mini-carta" onClick={() => navigate(`/nft/${c.tokenId}`)}>
                                                        <img src={c.imagen} alt={c.nombre} />
                                                        <span>{c.nombre}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="intercambio-flecha">⇄</div>
                                        <div className="intercambio-lado">
                                            <p className="intercambio-label">A cambio de:</p>
                                            <div className="intercambio-cartas">
                                                {oferta.cartasSolicitadas.map(c => (
                                                    <div key={c.tokenId} className="intercambio-mini-carta" onClick={() => navigate(`/nft/${c.tokenId}`)}>
                                                        <img src={c.imagen} alt={c.nombre} />
                                                        <span>{c.nombre}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="oferta-card-acciones">
                                        <button
                                            className="btn-oferta aceptar"
                                            onClick={() => ejecutarAccion('aceptarIntercambio', oferta.id, 'Aceptar intercambio')}
                                            disabled={procesando}
                                        >
                                            ✅ Aceptar
                                        </button>
                                        <button
                                            className="btn-oferta rechazar"
                                            onClick={() => ejecutarAccion('rechazarIntercambio', oferta.id, 'Rechazar intercambio')}
                                            disabled={procesando}
                                        >
                                            ❌ Rechazar
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    ))}

                    {/* Ofertas enviadas */}
                    {tab === 'enviadas' && enviadas.map((oferta) => (
                        <div key={`${oferta.tipo}-${oferta.id}`} className="oferta-card enviada">
                            {oferta.tipo === 'eth' ? (
                                <>
                                    <div className="oferta-card-header">
                                        <span className="oferta-badge eth">💰 Oferta de ETH</span>
                                        <span className="oferta-de">para {truncar(oferta.propietario)}</span>
                                    </div>
                                    <div className="oferta-card-body">
                                        <div className="oferta-carta-preview" onClick={() => navigate(`/nft/${oferta.carta.tokenId}`)}>
                                            <img src={oferta.carta.imagen} alt={oferta.carta.nombre} />
                                            <span>{oferta.carta.nombre}</span>
                                        </div>
                                        <div className="oferta-monto">
                                            <span className="monto-valor">Ξ {oferta.montoETH} ETH</span>
                                        </div>
                                    </div>
                                    <div className="oferta-card-acciones">
                                        <button
                                            className="btn-oferta cancelar"
                                            onClick={() => ejecutarAccion('cancelarETH', oferta.id, 'Cancelar oferta')}
                                            disabled={procesando}
                                        >
                                            🗑️ Cancelar oferta
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="oferta-card-header">
                                        <span className="oferta-badge intercambio">🔄 Intercambio</span>
                                        <span className="oferta-de">para {truncar(oferta.destinatario)}</span>
                                    </div>
                                    <div className="oferta-card-body intercambio-body">
                                        <div className="intercambio-lado">
                                            <p className="intercambio-label">Ofreces:</p>
                                            <div className="intercambio-cartas">
                                                {oferta.cartasOfrecidas.map(c => (
                                                    <div key={c.tokenId} className="intercambio-mini-carta" onClick={() => navigate(`/nft/${c.tokenId}`)}>
                                                        <img src={c.imagen} alt={c.nombre} />
                                                        <span>{c.nombre}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="intercambio-flecha">⇄</div>
                                        <div className="intercambio-lado">
                                            <p className="intercambio-label">A cambio de:</p>
                                            <div className="intercambio-cartas">
                                                {oferta.cartasSolicitadas.map(c => (
                                                    <div key={c.tokenId} className="intercambio-mini-carta" onClick={() => navigate(`/nft/${c.tokenId}`)}>
                                                        <img src={c.imagen} alt={c.nombre} />
                                                        <span>{c.nombre}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="oferta-card-acciones">
                                        <button
                                            className="btn-oferta cancelar"
                                            onClick={() => ejecutarAccion('cancelarIntercambio', oferta.id, 'Cancelar intercambio')}
                                            disabled={procesando}
                                        >
                                            🗑️ Cancelar intercambio
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default MisOfertas;
