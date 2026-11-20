import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { GameShell } from './components/GameShell.tsx';
import { OfflineIndicator } from './components/OfflineIndicator.tsx';

export default function App() {
  return (
    <ErrorBoundary>
      <GameShell />
      <OfflineIndicator />
    </ErrorBoundary>
  );
}
