import React from 'react';

/**
 * Componente de botón de conexión de wallet
 * @param {string} cuenta - Dirección de wallet conectada (vacía si no está conectada)
 * @param {function} onConectar - Callback al pulsar el botón de conectar
 * @param {function} onDesconectar - Callback al pulsar el botón de desconectar
 */
function BotonConectar({ cuenta, onConectar, onDesconectar }) {
    return (
        <div className="wallet-container">
            {cuenta ? (
                <div className="wallet-info">
                    <span className="wallet-label">Wallet:</span>
                    <span className="wallet-address">
                        {cuenta.substring(0, 6)}...{cuenta.substring(38)}
                    </span>
                    <button
                        className="btn-disconnect"
                        onClick={onDesconectar}
                        title="Desconectar wallet"
                    >
                        ✕
                    </button>
                </div>
            ) : (
                <button className="btn-connect" onClick={onConectar}>
                    🦊 Conectar Wallet
                </button>
            )}
        </div>
    );
}

export default BotonConectar;
