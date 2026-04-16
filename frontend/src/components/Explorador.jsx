import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, MARKETPLACE_ADDRESS, IPFS_GATEWAY, useWallet } from '../App';
import CartasABI from '../Cartas.json';
import MarketplaceABI from '../Marketplace.json';
import './Explorador.css';

const METADATA_GATEWAY = 'https://gateway.pinata.cloud/ipfs/bafybeif7xavsu6hjpt7aabpumtoy44xquzmgou2fkoldwvmop3ik32jbcq';

// Tipos de criaturas reales del metadata IPFS
const TIPOS_CRIATURA = [
    'Todos', 'Fuego', 'Agua', 'Planta', 'Aire',
    'Roca', 'Bicho', 'Siniestro', 'Psíquico'
];

// Niveles de rareza
const RAREZAS = ['Todas', 'Comun', 'Raro', 'Ultra Raro', 'Legendario'];

function truncarAddress(addr) {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function Explorador() {
    const navigate = useNavigate();
    const { cuenta } = useWallet();
    const [todasCartas, setTodasCartas] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');

    // Estado de filtros
    const [filtroEstado, setFiltroEstado] = useState('todos'); // todos | en-venta | no-en-venta
    const [filtroTipo, setFiltroTipo] = useState('Todos');
    const [filtroBusqueda, setFiltroBusqueda] = useState('');
    const [filtroPropietario, setFiltroPropietario] = useState('');
    const [filtroRareza, setFiltroRareza] = useState('Todas');
    const [ordenar, setOrdenar] = useState('id-asc'); // id-asc | id-desc | precio-asc | precio-desc | nombre-asc
    const [tiempoActual, setTiempoActual] = useState(Math.floor(Date.now() / 1000));
    const timerRef = useRef(null);

    useEffect(() => {
        const cargarTodasCartas = async () => {
            setCargando(true);
            setError('');
            try {
                let provider;
                if (window.ethereum) {
                    provider = new ethers.BrowserProvider(window.ethereum);
                } else {
                    provider = new ethers.JsonRpcProvider('https://rpc.sepolia.org');
                }

                const cartas = new ethers.Contract(CONTRACT_ADDRESS, CartasABI.abi, provider);
                const marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, MarketplaceABI.abi, provider);

                // Obtener el total de NFTs existentes
                const totalSupply = Number(await cartas.totalSupply());

                if (totalSupply === 0) {
                    setTodasCartas([]);
                    setCargando(false);
                    return;
                }

                // Obtener todos los tokenIds listados para consulta rápida
                const tokensListados = await marketplace.obtenerTodosListados();
                const setListados = new Set(tokensListados.map(id => Number(id)));

                // Cargar datos de cada carta
                const cartasData = await Promise.all(
                    Array.from({ length: totalSupply }, (_, i) => i).map(async (index) => {
                        const tokenId = Number(await cartas.tokenByIndex(index));
                        const propietario = await cartas.ownerOf(tokenId);
                        const bichoId = Number(await cartas.bichoAsignado(tokenId));

                        // Comprobar si está listado
                        let enVenta = false;
                        let precio = '0';
                        let precioWei = 0n;
                        if (setListados.has(tokenId)) {
                            try {
                                const [, p, activo] = await marketplace.obtenerListado(tokenId);
                                if (activo) {
                                    enVenta = true;
                                    precio = ethers.formatEther(p);
                                    precioWei = p;
                                }
                            } catch (e) {
                                // Si falla, no está en venta
                            }
                        }

                        // Comprobar si tiene subasta activa
                        let enSubasta = false;
                        let subastaPujaActual = '0';
                        let subastaFin = 0;
                        try {
                            const tieneSubasta = await marketplace.tokenTieneSubasta(tokenId);
                            if (tieneSubasta) {
                                const subastaId = Number(await marketplace.subastaActivaDeToken(tokenId));
                                const [, , , pujaActualS, , , finS, activaS] = await marketplace.obtenerSubasta(subastaId);
                                if (activaS) {
                                    enSubasta = true;
                                    subastaPujaActual = ethers.formatEther(pujaActualS);
                                    subastaFin = Number(finS);
                                }
                            }
                        } catch (e) {
                            // Si falla, no tiene subasta
                        }

                        // Obtener metadatos de IPFS
                        let nombre = `EtherBeast #${tokenId}`;
                        let tipo = '';
                        let rareza = '';
                        try {
                            const resp = await fetch(`${METADATA_GATEWAY}/${bichoId}.json`);
                            if (resp.ok) {
                                const data = await resp.json();
                                nombre = data.name || nombre;
                                if (data.attributes) {
                                    const attrTipo = data.attributes.find(a => a.trait_type === 'Tipo' || a.trait_type === 'Type');
                                    if (attrTipo) {
                                        // Normalizar: "Psiquico" → "Psíquico"
                                        tipo = attrTipo.value === 'Psiquico' ? 'Psíquico' : attrTipo.value;
                                    }
                                    const attrRareza = data.attributes.find(a => a.trait_type === 'Rareza');
                                    if (attrRareza) rareza = attrRareza.value;
                                }
                            }
                        } catch (e) {
                            // Usar nombre por defecto
                        }

                        return {
                            tokenId,
                            bichoReal: bichoId,
                            propietario,
                            nombre,
                            tipo,
                            rareza,
                            enVenta,
                            precio,
                            precioWei,
                            enSubasta,
                            subastaPujaActual,
                            subastaFin,
                            imagen: `${IPFS_GATEWAY}/${bichoId}.png`
                        };
                    })
                );

                setTodasCartas(cartasData);
            } catch (err) {
                console.error("Error cargando cartas:", err);
                setError("No se pudieron cargar las cartas del explorador.");
            } finally {
                setCargando(false);
            }
        };

        cargarTodasCartas();
    }, []);

    // Timer global para countdown de subastas
    useEffect(() => {
        timerRef.current = setInterval(() => {
            setTiempoActual(Math.floor(Date.now() / 1000));
        }, 1000);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, []);

    const formatearTimer = useCallback((fin) => {
        const diff = fin - tiempoActual;
        if (diff <= 0) return 'Expirada';
        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;
        if (h > 0) return `${h}h ${m}m ${s}s`;
        return `${m}m ${s}s`;
    }, [tiempoActual]);

    // Filtrar y ordenar cartas
    const cartasFiltradas = useMemo(() => {
        let resultado = [...todasCartas];

        // Filtro por estado de venta
        if (filtroEstado === 'en-venta') {
            resultado = resultado.filter(c => c.enVenta);
        } else if (filtroEstado === 'en-subasta') {
            resultado = resultado.filter(c => c.enSubasta);
        } else if (filtroEstado === 'no-en-venta') {
            resultado = resultado.filter(c => !c.enVenta && !c.enSubasta);
        }

        // Filtro por tipo de criatura
        if (filtroTipo !== 'Todos') {
            resultado = resultado.filter(c => c.tipo === filtroTipo);
        }

        // Filtro por rareza
        if (filtroRareza !== 'Todas') {
            resultado = resultado.filter(c => c.rareza === filtroRareza);
        }

        // Filtro por búsqueda (Token ID o nombre)
        if (filtroBusqueda.trim()) {
            const busqueda = filtroBusqueda.trim().toLowerCase();
            resultado = resultado.filter(c =>
                c.tokenId.toString().includes(busqueda) ||
                c.nombre.toLowerCase().includes(busqueda)
            );
        }

        // Filtro por propietario
        if (filtroPropietario.trim()) {
            const propBusqueda = filtroPropietario.trim().toLowerCase();
            resultado = resultado.filter(c =>
                c.propietario.toLowerCase().includes(propBusqueda)
            );
        }

        // Ordenación
        switch (ordenar) {
            case 'id-asc':
                resultado.sort((a, b) => a.tokenId - b.tokenId);
                break;
            case 'id-desc':
                resultado.sort((a, b) => b.tokenId - a.tokenId);
                break;
            case 'precio-asc':
                resultado.sort((a, b) => {
                    if (!a.enVenta && !b.enVenta) return 0;
                    if (!a.enVenta) return 1;
                    if (!b.enVenta) return -1;
                    return parseFloat(a.precio) - parseFloat(b.precio);
                });
                break;
            case 'precio-desc':
                resultado.sort((a, b) => {
                    if (!a.enVenta && !b.enVenta) return 0;
                    if (!a.enVenta) return 1;
                    if (!b.enVenta) return -1;
                    return parseFloat(b.precio) - parseFloat(a.precio);
                });
                break;
            case 'nombre-asc':
                resultado.sort((a, b) => a.nombre.localeCompare(b.nombre));
                break;
            default:
                break;
        }

        return resultado;
    }, [todasCartas, filtroEstado, filtroTipo, filtroRareza, filtroBusqueda, filtroPropietario, ordenar]);

    const totalEnVenta = todasCartas.filter(c => c.enVenta).length;
    const totalEnSubasta = todasCartas.filter(c => c.enSubasta).length;

    const limpiarFiltros = () => {
        setFiltroEstado('todos');
        setFiltroTipo('Todos');
        setFiltroRareza('Todas');
        setFiltroBusqueda('');
        setFiltroPropietario('');
        setOrdenar('id-asc');
    };

    const hayFiltrosActivos = filtroEstado !== 'todos' || filtroTipo !== 'Todos' || filtroRareza !== 'Todas' ||
        filtroBusqueda.trim() !== '' || filtroPropietario.trim() !== '' || ordenar !== 'id-asc';

    return (
        <div className="explorador-container">
            <button className="btn-volver" onClick={() => navigate('/')}>
                ← Volver a la colección
            </button>

            <div className="explorador-header">
                <h1 className="explorador-titulo">🏪 Marketplace</h1>
                <p className="explorador-subtitulo">
                    Explora todas las cartas EtherBeasts del ecosistema
                </p>
            </div>

            {cargando && (
                <div className="explorador-loading">
                    <span className="spinner">⚙️</span>
                    Cargando todas las cartas...
                </div>
            )}

            {error && (
                <div className="explorador-error">❌ {error}</div>
            )}

            {!cargando && !error && todasCartas.length === 0 && (
                <div className="explorador-vacio">
                    <p className="vacio-emoji">🏜️</p>
                    <p className="vacio-texto">No existen cartas todavía.</p>
                    <p className="vacio-hint">¡Sé el primero en mintear una carta!</p>
                </div>
            )}

            {!cargando && todasCartas.length > 0 && (
                <>
                    {/* Panel de Filtros */}
                    <div className="filtros-panel">
                        <div className="filtros-fila">
                            <div className="filtro-grupo">
                                <label className="filtro-label">🔍 Buscar</label>
                                <input
                                    type="text"
                                    className="filtro-input"
                                    placeholder="Token ID o nombre..."
                                    value={filtroBusqueda}
                                    onChange={(e) => setFiltroBusqueda(e.target.value)}
                                />
                            </div>

                            <div className="filtro-grupo">
                                <label className="filtro-label">📊 Estado</label>
                                <select
                                    className="filtro-select"
                                    value={filtroEstado}
                                    onChange={(e) => setFiltroEstado(e.target.value)}
                                >
                                    <option value="todos">Todos</option>
                                    <option value="en-venta">En venta</option>
                                    <option value="en-subasta">En subasta</option>
                                    <option value="no-en-venta">No en venta</option>
                                </select>
                            </div>

                            <div className="filtro-grupo">
                                <label className="filtro-label">🐾 Criatura</label>
                                <select
                                    className="filtro-select"
                                    value={filtroTipo}
                                    onChange={(e) => setFiltroTipo(e.target.value)}
                                >
                                    {TIPOS_CRIATURA.map(tipo => (
                                        <option key={tipo} value={tipo}>{tipo}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="filtro-grupo">
                                <label className="filtro-label">⭐ Rareza</label>
                                <select
                                    className="filtro-select"
                                    value={filtroRareza}
                                    onChange={(e) => setFiltroRareza(e.target.value)}
                                >
                                    {RAREZAS.map(r => (
                                        <option key={r} value={r}>{r}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="filtro-grupo">
                                <label className="filtro-label">⬆️ Ordenar</label>
                                <select
                                    className="filtro-select"
                                    value={ordenar}
                                    onChange={(e) => setOrdenar(e.target.value)}
                                >
                                    <option value="id-asc">ID ↑</option>
                                    <option value="id-desc">ID ↓</option>
                                    <option value="precio-asc">Precio ↑</option>
                                    <option value="precio-desc">Precio ↓</option>
                                    <option value="nombre-asc">Nombre A-Z</option>
                                </select>
                            </div>

                            <div className="filtro-grupo">
                                <label className="filtro-label">👤 Propietario</label>
                                <input
                                    type="text"
                                    className="filtro-input"
                                    placeholder="0x..."
                                    value={filtroPropietario}
                                    onChange={(e) => setFiltroPropietario(e.target.value)}
                                />
                            </div>
                        </div>

                        {hayFiltrosActivos && (
                            <button className="btn-limpiar-filtros" onClick={limpiarFiltros}>
                                ✕ Limpiar filtros
                            </button>
                        )}
                    </div>

                    {/* Contador */}
                    <p className="explorador-count">
                        Mostrando <strong>{cartasFiltradas.length}</strong> de <strong>{todasCartas.length}</strong> cartas
                        {' '}({totalEnVenta} en venta{totalEnSubasta > 0 ? `, ${totalEnSubasta} en subasta` : ''})
                    </p>

                    {/* Grid de Cartas */}
                    {cartasFiltradas.length === 0 ? (
                        <div className="explorador-vacio">
                            <p className="vacio-emoji">🔎</p>
                            <p className="vacio-texto">No hay cartas que coincidan con los filtros.</p>
                            <button className="btn-limpiar-filtros" onClick={limpiarFiltros}>
                                Limpiar filtros
                            </button>
                        </div>
                    ) : (
                        <div className="explorador-grid">
                            {cartasFiltradas.map((item) => (
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
                                        {/* Badge de estado */}
                                        {item.enSubasta ? (
                                            <div className="badge-estado badge-subasta">
                                                🔨 {Number(item.subastaPujaActual) > 0
                                                    ? `Ξ ${item.subastaPujaActual} ETH`
                                                    : 'Sin pujas'}
                                                <span className="badge-subasta-timer">
                                                    ⏱️ {formatearTimer(item.subastaFin)}
                                                </span>
                                            </div>
                                        ) : item.enVenta ? (
                                            <div className="badge-estado badge-en-venta">
                                                🏷️ Ξ {item.precio} ETH
                                            </div>
                                        ) : (
                                            <div className="badge-estado badge-no-venta">
                                                No en venta
                                            </div>
                                        )}
                                    </div>
                                    <div className="explorador-card-info">
                                        <p className="explorador-card-nombre">{item.nombre}</p>
                                        <p className="explorador-card-token">Token #{item.tokenId}</p>
                                        <p className="explorador-card-owner">
                                            👤 {cuenta && item.propietario.toLowerCase() === cuenta.toLowerCase()
                                                ? 'Tú'
                                                : truncarAddress(item.propietario)}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default Explorador;
