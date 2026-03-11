import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, MARKETPLACE_ADDRESS, IPFS_GATEWAY } from '../App';
import CartasABI from '../Cartas.json';
import MarketplaceABI from '../Marketplace.json';
import './Explorador.css';

const METADATA_GATEWAY = 'https://gateway.pinata.cloud/ipfs/bafybeif7xavsu6hjpt7aabpumtoy44xquzmgou2fkoldwvmop3ik32jbcq';

function Explorador() {
    const navigate = useNavigate();
    const [listados, setListados] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const cargarListados = async () => {
            setCargando(true);
            setError('');
            try {
                let provider;
                if (window.ethereum) {
                    provider = new ethers.BrowserProvider(window.ethereum);
                } else {
                    // Proveedor público para usuarios sin MetaMask
                    provider = new ethers.JsonRpcProvider('https://rpc.sepolia.org');
                }

                const marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, MarketplaceABI.abi, provider);
                const cartas = new ethers.Contract(CONTRACT_ADDRESS, CartasABI.abi, provider);

                // Obtener todos los tokenIds listados
                const tokenIds = await marketplace.obtenerTodosListados();

                if (tokenIds.length === 0) {
                    setListados([]);
                    setCargando(false);
                    return;
                }

                // Para cada tokenId, obtener datos del listado y del NFT
                const listadosData = await Promise.all(
                    tokenIds.map(async (tokenId) => {
                        const [vendedor, precio, activo] = await marketplace.obtenerListado(tokenId);
                        const bichoId = await cartas.bichoAsignado(tokenId);

                        // Obtener metadatos de IPFS
                        let nombre = `EtherBeast #${Number(tokenId)}`;
                        try {
                            const resp = await fetch(`${METADATA_GATEWAY}/${Number(bichoId)}.json`);
                            if (resp.ok) {
                                const data = await resp.json();
                                nombre = data.name || nombre;
                            }
                        } catch (e) {
                            // Usar nombre por defecto
                        }

                        return {
                            tokenId: Number(tokenId),
                            bichoReal: Number(bichoId),
                            vendedor,
                            precio: ethers.formatEther(precio),
                            precioWei: precio,
                            activo,
                            nombre,
                            imagen: `${IPFS_GATEWAY}/${Number(bichoId)}.png`
                        };
                    })
                );

                // Solo mostrar los activos
                setListados(listadosData.filter(l => l.activo));
            } catch (err) {
                console.error("Error cargando marketplace:", err);
                setError("No se pudieron cargar los listados del marketplace.");
            } finally {
                setCargando(false);
            }
        };

        cargarListados();
    }, []);

    return (
        <div className="explorador-container">
            <button className="btn-volver" onClick={() => navigate('/')}>
                ← Volver a la colección
            </button>

            <div className="explorador-header">
                <h1 className="explorador-titulo">🏪 Marketplace</h1>
                <p className="explorador-subtitulo">
                    Explora todas las cartas EtherBeasts disponibles para compra
                </p>
            </div>

            {cargando && (
                <div className="explorador-loading">
                    <span className="spinner">⚙️</span>
                    Cargando listados...
                </div>
            )}

            {error && (
                <div className="explorador-error">❌ {error}</div>
            )}

            {!cargando && !error && listados.length === 0 && (
                <div className="explorador-vacio">
                    <p className="vacio-emoji">🏜️</p>
                    <p className="vacio-texto">No hay cartas en venta actualmente.</p>
                    <p className="vacio-hint">¡Sé el primero en listar una carta desde tu colección!</p>
                </div>
            )}

            {!cargando && listados.length > 0 && (
                <>
                    <p className="explorador-count">
                        <strong>{listados.length}</strong> carta{listados.length !== 1 ? 's' : ''} en venta
                    </p>
                    <div className="explorador-grid">
                        {listados.map((item) => (
                            <div
                                key={item.tokenId}
                                className="explorador-card"
                                onClick={() => navigate(`/nft/${item.tokenId}`)}
                            >
                                <div className="explorador-card-img-wrap">
                                    <img
                                        src={item.imagen}
                                        alt={item.nombre}
                                        className="explorador-card-img"
                                        onError={(e) => { e.target.src = ''; }}
                                    />
                                </div>
                                <div className="explorador-card-info">
                                    <p className="explorador-card-nombre">{item.nombre}</p>
                                    <p className="explorador-card-token">Token #{item.tokenId}</p>
                                    <div className="explorador-card-precio">
                                        <span className="precio-eth">Ξ {item.precio} ETH</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

export default Explorador;
