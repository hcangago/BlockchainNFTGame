import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import { useWallet } from '../App';
import CartasABI from '../Cartas.json';
import './DetalleNFT.css';

const CONTRACT_ADDRESS = "0x4441517277Abfd4C6D0a8929b214EEdB6f4680AB";
const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs/bafybeicwuguf2zsxwcs7p4zeiseea62kgeqwdgksvpexxno6ofajo4njci';
const METADATA_GATEWAY = 'https://gateway.pinata.cloud/ipfs/bafybeif7xavsu6hjpt7aabpumtoy44xquzmgou2fkoldwvmop3ik32jbcq';

/**
 * Truncate an Ethereum address for display
 */
function truncarAddress(addr) {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/**
 * Format a timestamp to a readable date
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

        } catch (err) {
            console.error("Error cargando NFT:", err);
            setError("No se pudo cargar este NFT. Comprueba que el Token ID es válido.");
        } finally {
            setCargando(false);
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

            // Llamar a safeTransferFrom(from, to, tokenId)
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

                    {/* Panel de acciones condicional */}
                    <div className="detalle-acciones">
                        {esPropietario ? (
                            <>
                                <p className="acciones-titulo">🔑 Panel del Propietario</p>
                                <div className="acciones-grid">
                                    <button
                                        className="btn-accion propietario activo"
                                        onClick={() => setMostrarModalTransferencia(true)}
                                    >
                                        📤 Transferir a otro usuario
                                    </button>
                                    <button className="btn-accion propietario" disabled>
                                        🏷️ Listar para Venta
                                        <span className="badge-pronto">Próximamente</span>
                                    </button>
                                    <button className="btn-accion propietario" disabled>
                                        🔨 Iniciar Subasta
                                        <span className="badge-pronto">Próximamente</span>
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <p className="acciones-titulo">🛒 Opciones de Adquisición</p>
                                <div className="acciones-grid">
                                    <button className="btn-accion comprador" disabled>
                                        ⚡ Adquisición Inmediata
                                        <span className="badge-pronto">Próximamente</span>
                                    </button>
                                    <button className="btn-accion comprador" disabled>
                                        💬 Enviar Oferta
                                        <span className="badge-pronto">Próximamente</span>
                                    </button>
                                </div>
                                {!cuenta && (
                                    <p style={{ fontSize: '12px', color: '#888', marginTop: '10px' }}>
                                        Conecta tu wallet para ver las opciones disponibles.
                                    </p>
                                )}
                            </>
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

            {/* Historial de Transferencias */}
            <div className="detalle-historial">
                <h2 className="historial-titulo">📜 Historial de Transferencias</h2>
                {historial.length === 0 ? (
                    <p className="historial-vacio">No se encontró historial de transferencias para este NFT.</p>
                ) : (
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
                )}
            </div>
        </div>
    );
}

export default DetalleNFT;
