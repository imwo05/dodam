import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from '../contexts/AuthContext';
import { OnboardingProvider } from '../contexts/OnboardingContext';
import { PlanBProvider } from '../contexts/PlanBContext';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <OnboardingProvider>
          <PlanBProvider>
            <App />
          </PlanBProvider>
        </OnboardingProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
