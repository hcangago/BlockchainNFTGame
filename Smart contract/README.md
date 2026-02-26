# CardChain – Smart Contracts

Contratos inteligentes del juego de cartas coleccionables, desarrollados como Trabajo de Fin de Grado en la Universidad de Oviedo.

Los contratos están escritos en **Solidity 0.8.20** usando el estándar **ERC-721** de OpenZeppelin para representar las cartas como tokens NFT. El entorno de desarrollo y despliegue utilizado es **Hardhat**.

## Requisitos previos

- Node.js 18 o superior
- Una wallet compatible (MetaMask) con ETH de testnet en la red **Sepolia**
- Una clave de API de [Alchemy](https://alchemy.com) o [Infura](https://infura.io) para conectarse a Sepolia
- La clave privada de la wallet configurada como variable de entorno (`PRIVATE_KEY`)

## Instalación

```bash
npm install
```

## Comandos útiles

```bash
# Compilar los contratos
npx hardhat compile

# Ejecutar los tests
npx hardhat test

# Ejecutar tests con informe de gas
REPORT_GAS=true npx hardhat test

# Desplegar en la red de pruebas Sepolia
npx hardhat run scripts/deploy.js --network sepolia
```

## Estructura del proyecto

```
contracts/        # Código fuente de los contratos (.sol)
scripts/          # Scripts de despliegue
test/             # Tests automatizados
hardhat.config.js # Configuración de Hardhat y redes
```

## Sincronización con el frontend

Tras compilar o volver a desplegar los contratos, es necesario copiar el ABI y la dirección del contrato a la carpeta `frontend/src/` para que la interfaz web pueda interactuar con ellos.
