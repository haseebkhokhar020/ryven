import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './components/App';
import './styles/app.css';
import './lib/monaco';
import '@xterm/xterm/css/xterm.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
