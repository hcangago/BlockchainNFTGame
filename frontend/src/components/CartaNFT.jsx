import React from 'react';
import { Link } from 'react-router-dom';

const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs/bafybeicwuguf2zsxwcs7p4zeiseea62kgeqwdgksvpexxno6ofajo4njci';

/**
 * Individual NFT card component
 * @param {object} carta - Card data { id, bichoReal, uri }
 */
function CartaNFT({ carta }) {
    const imagenUrl = `${IPFS_GATEWAY}/${carta.bichoReal}.png`;

    return (
        <Link to={`/nft/${carta.id}`} style={{ textDecoration: 'none' }}>
            <div className="nft-card">
                <div className="nft-image-container">
                    <img
                        src={imagenUrl}
                        alt={`EtherBeast #${carta.id}`}
                        className="nft-image"
                        onError={(e) => console.error("Error cargando imagen:", e.target.src)}
                    />
                </div>

                <div className="nft-info">
                    <h2 className="nft-title">EtherBeast #{carta.id}</h2>
                    <p className="nft-subtitle">NFT Verificado en IPFS</p>
                    <span className="nft-link">🔍 Ver Detalle</span>
                </div>
            </div>
        </Link>
    );
}

export default CartaNFT;
