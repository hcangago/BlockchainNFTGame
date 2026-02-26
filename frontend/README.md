# CardChain – Frontend

Interfaz web del juego de cartas coleccionables basado en blockchain, desarrollado como Trabajo de Fin de Grado en la Universidad de Oviedo.

La aplicación está construida con **React** y se comunica con los contratos inteligentes desplegados en la red de pruebas a través de **Ethers.js v6**. Permite a los usuarios conectar su wallet de MetaMask, ver su colección de cartas NFT y realizar las operaciones del juego directamente desde el navegador.

## Requisitos previos

- Node.js 18 o superior
- MetaMask instalado en el navegador
- El contrato inteligente desplegado (ver carpeta `Smart contract`)

## Instalación

```bash
npm install
```

## Scripts disponibles

### `npm start`

Inicia la aplicación en modo desarrollo. Abre [http://localhost:3000](http://localhost:3000) en el navegador para verla.

La página se recarga automáticamente al guardar cambios en el código.

### `npm run build`

Genera la versión de producción en la carpeta `build`, lista para desplegar en un servidor estático.

### `npm test`

Lanza el runner de tests en modo interactivo.

## Estructura del proyecto

```
src/
├── components/       # Componentes React reutilizables
├── App.js            # Componente principal y lógica de conexión
├── App.css           # Estilos globales
└── index.js          # Punto de entrada
```
