import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// Si quieres medir el rendimiento de tu app, pasa una función
// para registrar resultados (por ejemplo: reportWebVitals(console.log))
// o envía a un endpoint de analítica. Más info: https://bit.ly/CRA-vitals
reportWebVitals();
