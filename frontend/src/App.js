import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ethers } from 'ethers';
import CartasABI from './Cartas.json';
import './App.css';

// Components
import Toast from './components/Toast';
import BotonConectar from './components/BotonConectar';
import GaleriaCartas from './components/GaleriaCartas';
import DetalleNFT from './components/DetalleNFT';

export const CONTRACT_ADDRESS = "0x4441517277Abfd4C6D0a8929b214EEdB6f4680AB";
export const SEPOLIA_CHAIN_ID = '0xaa36a7';
export const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs/bafybeicwuguf2zsxwcs7p4zeiseea62kgeqwdgksvpexxno6ofajo4njci';

// Context to share wallet state across routes
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

          <button
            className="btn-mint"
            onClick={reclamarCarta}
            disabled={cargando}
          >
            {cargando ? "⏳ Minteando..." : "🚀 ¡Abrir sobre de cartas!"}
          </button>

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

  // Show toast notification
  const mostrarToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
  }, []);

  const cerrarToast = useCallback(() => {
    setToast(null);
  }, []);

  // Load user's cards from contract
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

  // Listen for account changes
  useEffect(() => {
    if (!window.ethereum) return;

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

  // Switch to Sepolia network
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

  // Connect wallet
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

  // Disconnect wallet
  const desconectarWallet = () => {
    setCuenta("");
    setCartas([]);
    mostrarToast("Wallet desconectada", "info");
  };

  // Claim new card
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