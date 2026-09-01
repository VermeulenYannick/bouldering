import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// Mount the single React application into the root element provided by index.html.
createRoot(document.getElementById('root')).render(<App />);
