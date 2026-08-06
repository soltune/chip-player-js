import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './components/App';
import { BrowserRouter as Router } from 'react-router-dom';
import { UserProvider } from './components/UserProvider';
import { ToastProvider } from './components/ToastProvider';
import ThemeHandler from './components/ThemeHandler';

ReactDOM.render((
  <Router basename={process.env.PUBLIC_URL}>
    <ToastProvider>
      <UserProvider>
        <ThemeHandler/>
        <App/>
      </UserProvider>
    </ToastProvider>
  </Router>
), document.getElementById('root'));

// Warm up the kanji fallback font (x68k) in the background. Browsers fetch a
// @font-face only when a glyph actually needs it, which causes a visible font
// swap the first time a directory with Japanese titles is opened.
const warmUpKanjiFont = () => document.fonts.load('100 16px x68k', '漢');
if ('requestIdleCallback' in window) {
  requestIdleCallback(warmUpKanjiFont);
} else {
  setTimeout(warmUpKanjiFont, 2000);
}
