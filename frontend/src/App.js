import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { ethers } from 'ethers';
import CartasABI from './Cartas.json';
import './App.css';

// Componentes
import Toast from './components/Toast';
import BotonConectar from './components/BotonConectar';
import GaleriaCartas from './components/GaleriaCartas';
import DetalleNFT from './components/DetalleNFT';
import Explorador from './components/Explorador';
import MisOfertas from './components/MisOfertas';

export const CONTRACT_ADDRESS = "0x92ce1f50F2bE281F9943F983f5cFB1c8a1518C6e";
export const MARKETPLACE_ADDRESS = "0x14d6794eed717c8432d49a621B0D30797C3D57Bf";
export const SEPOLIA_CHAIN_ID = '0xaa36a7';
export const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs/bafybeicwuguf2zsxwcs7p4zeiseea62kgeqwdgksvpexxno6ofajo4njci';

// Contexto para compartir el estado de la wallet entre rutas
export const WalletContext = createContext(null);
export const useWallet = () => useContext(WalletContext);

function GaleriaPrincipal({ cartas, reclamarCarta, cargando }) {
  const { cuenta } = useWallet();
  return (
    <>
      {cuenta && (
        <>
          <p className="collection-count">
            Tienes <strong>{cartas.length}</strong> carta{cartas.length !== 1 ? 's' : ''} en tu colección
          </p>

          <div className="acciones-principales">
            <Link to="/marketplace" className="btn-marketplace-link">🏪 Explorar Marketplace</Link>
            <Link to="/mis-ofertas" className="btn-marketplace-link btn-ofertas-link">💬 Mis Ofertas</Link>

            <button
              className="btn-mint"
              onClick={reclamarCarta}
              disabled={cargando}
            >
              {cargando ? "⏳ Minteando..." : "🚀 ¡Abrir sobre de cartas!"}
            </button>
          </div>

          <GaleriaCartas cartas={cartas} />
        </>
      )}
    </>
  );
}

function App() {
  const [cuenta, setCuenta] = useState("");
  const [cartas, setCartas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [toast, setToast] = useState(null);

  // Mostrar notificación toast
  const mostrarToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
  }, []);

  const cerrarToast = useCallback(() => {
    setToast(null);
  }, []);

  // Cargar las cartas del usuario desde el contrato
  const cargarCartas = useCallback(async (direccion) => {
    if (!window.ethereum || !direccion) return;

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const contrato = new ethers.Contract(CONTRACT_ADDRESS, CartasABI.abi, provider);

      const balanceGrande = await contrato.balanceOf(direccion);
      const numCartas = Number(balanceGrande);

      if (numCartas === 0) {
        setCartas([]);
        return;
      }

      let listaCartas = [];
      for (let i = 0; i < numCartas; i++) {
        const tokenId = await contrato.tokenOfOwnerByIndex(direccion, i);
        const bichoId = await contrato.bichoAsignado(tokenId);
        const uri = await contrato.tokenURI(tokenId);

        listaCartas.push({
          id: Number(tokenId),
          bichoReal: Number(bichoId),
          uri: uri.replace("ipfs://", "https://ipfs.io/ipfs/")
        });
      }
      setCartas(listaCartas);
    } catch (error) {
      console.error("Error cargando cartas:", error);
      mostrarToast("Error al cargar tu colección", "error");
    }
  }, [mostrarToast]);

  // Escuchar cambios de cuenta y autoconectar al cargar
  useEffect(() => {
    if (!window.ethereum) return;

    // Verificar si ya hay una cuenta conectada al recargar la página
    const chequearConexionPrevia = async () => {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
          setCuenta(accounts[0]);
          cargarCartas(accounts[0]);
        }
      } catch (error) {
        console.error("Error al verificar conexión previa:", error);
      }
    };

    chequearConexionPrevia();

    const handleAccountsChanged = (accounts) => {
      if (accounts.length > 0) {
        setCuenta(accounts[0]);
        cargarCartas(accounts[0]);
      } else {
        setCuenta("");
        setCartas([]);
      }
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    return () => window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
  }, [cargarCartas]);

  // Cambiar a la red Sepolia
  const cambiarARedSepolia = async () => {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: SEPOLIA_CHAIN_ID }],
      });
    } catch (error) {
      if (error.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: SEPOLIA_CHAIN_ID,
            chainName: 'Sepolia Test Network',
            nativeCurrency: { name: 'SepoliaETH', symbol: 'ETH', decimals: 18 },
            rpcUrls: ['https://sepolia.infura.io/v3/'],
            blockExplorerUrls: ['https://sepolia.etherscan.io'],
          }],
        });
      } else {
        throw error;
      }
    }
  };

  // Conectar wallet
  const conectarWallet = async () => {
    if (!window.ethereum) {
      mostrarToast("Por favor instala MetaMask para continuar", "error");
      return;
    }

    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const walletActiva = accounts[0];

      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      if (chainId !== SEPOLIA_CHAIN_ID) {
        mostrarToast("Cambiando a red Sepolia...", "info");
        await cambiarARedSepolia();
      }

      setCuenta(walletActiva);
      await cargarCartas(walletActiva);
      mostrarToast("Wallet conectada correctamente", "success");
    } catch (error) {
      console.error("Error al conectar:", error);
      if (error.code === 4001) {
        mostrarToast("Conexión rechazada por el usuario", "error");
      } else {
        mostrarToast("Error al conectar wallet", "error");
      }
    }
  };

  // Desconectar wallet
  const desconectarWallet = () => {
    setCuenta("");
    setCartas([]);
    mostrarToast("Wallet desconectada", "info");
  };

  // Reclamar nueva carta
  const reclamarCarta = async () => {
    if (!window.ethereum || !cuenta) return;

    setCargando(true);
    mostrarToast("Procesando transacción...", "info");

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contrato = new ethers.Contract(CONTRACT_ADDRESS, CartasABI.abi, signer);

      const tx = await contrato.ganarCarta(cuenta);
      mostrarToast("Transacción enviada. Esperando confirmación...", "info");

      await tx.wait();
      mostrarToast("¡Nueva carta obtenida! 🎉", "success");

      setTimeout(() => cargarCartas(cuenta), 2000);

    } catch (error) {
      console.error("Error al mintear:", error);
      if (error.code === 'ACTION_REJECTED' || error.code === 4001) {
        mostrarToast("Transacción cancelada", "error");
      } else {
        mostrarToast("Error al obtener la carta. Inténtalo de nuevo.", "error");
      }
    } finally {
      setCargando(false);
    }
  };

  return (
    <WalletContext.Provider value={{ cuenta, mostrarToast }}>
      <div className="app-container">
        <h1 className="app-title">EtherBeasts</h1>

        <BotonConectar cuenta={cuenta} onConectar={conectarWallet} onDesconectar={desconectarWallet} />

        <Routes>
          <Route
            path="/"
            element={
              <GaleriaPrincipal
                cartas={cartas}
                reclamarCarta={reclamarCarta}
                cargando={cargando}
              />
            }
          />
          <Route path="/nft/:tokenId" element={<DetalleNFT />} />
          <Route path="/marketplace" element={<Explorador />} />
          <Route path="/mis-ofertas" element={<MisOfertas />} />
        </Routes>

        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={cerrarToast}
          />
        )}
      </div>
    </WalletContext.Provider>
  );
}

export default App;