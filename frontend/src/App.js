import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import CartasABI from './Cartas.json';

const CONTRACT_ADDRESS = "0xCa80fE6853d70919603F221c3c4A7E398f735043";

function App() {
  const [cuenta, setCuenta] = useState("");
  const [cartas, setCartas] = useState([]); // Aquí guardaremos la lista para el .map
  const [cargando, setCargando] = useState(false);

  // Función para obtener las cartas del contrato
  const cargarCartas = async (direccion) => {
    if (!window.ethereum) return;
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const contrato = new ethers.Contract(CONTRACT_ADDRESS, CartasABI.abi, provider);

      // Consultamos cuántas cartas tiene el usuario (balanceOf)
      const balance = await contrato.balanceOf(direccion);
      const numCartas = Number(balance);

      // Creamos una lista de objetos para que React los pinte
      let listaCartas = [];
      for (let i = 0; i < numCartas; i++) {
        listaCartas.push({ id: i + 1 });
      }
      setCartas(listaCartas);
    } catch (error) {
      console.error("Error cargando cartas:", error);
    }
  };

  const conectarWallet = async () => {
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });

        if (chainId !== '0xaa36a7') {
          alert("Cambiando a Sepolia...");
          await cambiarARedSepolia();
        }

        setCuenta(accounts[0]);
        cargarCartas(accounts[0]); // Cargamos cartas nada más conectar
      } catch (error) {
        console.error("Error al conectar:", error);
      }
    } else {
      alert("Por favor, instala MetaMask");
    }
  };

  const reclamarCarta = async () => {
    try {
      if (!window.ethereum) return;
      setCargando(true);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contrato = new ethers.Contract(CONTRACT_ADDRESS, CartasABI.abi, signer);

      const tx = await contrato.ganarCarta(cuenta);
      await tx.wait();

      alert("¡Carta minteada!");
      cargarCartas(cuenta); // Recargamos la galería para que aparezca la nueva
    } catch (error) {
      console.error("Error:", error);
      alert("Error al reclamar");
    } finally {
      setCargando(false);
    }
  };

  const cambiarARedSepolia = async () => {
    const chainIdSepolia = '0xaa36a7';
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainIdSepolia }],
      });
    } catch (error) {
      if (error.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: chainIdSepolia,
            chainName: 'Sepolia Test Network',
            nativeCurrency: { name: 'SepoliaETH', symbol: 'ETH', decimals: 18 },
            rpcUrls: ['https://sepolia.infura.io/v3/'],
            blockExplorerUrls: ['https://sepolia.etherscan.io'],
          }],
        });
      }
    }
  };

  return (
    <div style={{ textAlign: 'center', marginTop: '50px', fontFamily: 'Arial', backgroundColor: '#1a1a1a', color: 'white', minHeight: '100vh', padding: '20px' }}>
      <h1>CardChain TFG 🃏</h1>

      {!cuenta ? (
        <button onClick={conectarWallet} style={estiloBoton}>
          Conectar MetaMask
        </button>
      ) : (
        <div>
          <p>Wallet: <b>{cuenta.substring(0, 6)}...{cuenta.substring(38)}</b></p>
          <p>Tienes {cartas.length} cartas en tu colección</p>

          <button onClick={reclamarCarta} style={estiloBotonEspecial} disabled={cargando}>
            {cargando ? "⏳ Minteando..." : "🚀 ¡Abrir sobre de cartas!"}
          </button>

          {/* AQUÍ ESTÁ LA GALERÍA QUE FALTABA */}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', marginTop: '40px' }}>
            {cartas.map((carta, index) => (
              <div key={index} style={estiloCarta}>
                <img
                  src={`/assets/cartas/${(index % 5) + 1}.png`}
                  alt="Carta"
                  style={{ width: '100%', borderRadius: '10px 10px 0 0' }}
                />
                <div style={{ padding: '10px' }}>
                  <h3 style={{ margin: '5px 0' }}>Bicho #{index + 1}</h3>
                  <p style={{ fontSize: '12px', color: '#ffd700' }}>NFT Oficial</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Estilos actualizados para la galería
const estiloBoton = { padding: '10px 20px', fontSize: '16px', cursor: 'pointer', borderRadius: '8px' };
const estiloBotonEspecial = { padding: '15px 30px', fontSize: '20px', cursor: 'pointer', borderRadius: '12px', backgroundColor: '#4CAF50', color: 'white', border: 'none', fontWeight: 'bold' };

const estiloCarta = {
  width: '180px',
  margin: '15px',
  borderRadius: '12px',
  border: '2px solid #ffd700',
  backgroundColor: '#2c2c2c',
  boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
  overflow: 'hidden'
};

export default App;