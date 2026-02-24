import React from 'react';
import { AppProvider } from './core/AppContext';
import { AppLayout } from './AppLayout';

function App() {
  return (
    <AppProvider>
      <AppLayout />
    </AppProvider>
  );
}

export default App;
