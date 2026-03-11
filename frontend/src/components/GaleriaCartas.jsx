import React from 'react';
import CartaNFT from './CartaNFT';

/**
 * Componente que muestra la galería de cartas NFT
 * @param {array} cartas - Array de cartas NFT
 */
function GaleriaCartas({ cartas }) {
    if (cartas.length === 0) {
        return (
            <div className="galeria-vacia">
                <p>🎴 Aún no tienes cartas en tu colección</p>
                <p className="galeria-vacia-hint">¡Abre un sobre para conseguir tu primera carta!</p>
            </div>
        );
    }

    return (
        <div className="galeria-cartas">
            {cartas.map((carta) => (
                <CartaNFT key={carta.id} carta={carta} />
            ))}
        </div>
    );
}

export default GaleriaCartas;
