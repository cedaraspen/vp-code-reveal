import '../index.css';

import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { connectRealtime, context } from '@devvit/web/client';

type CodeState = {
  code: string | null;
  isRevealed: boolean;
  isAnimating: boolean;
};

export const Splash = () => {
  const [state, setState] = useState<CodeState>({
    code: null,
    isRevealed: false,
    isAnimating: false,
  });

  useEffect(() => {
    const checkForCode = async () => {
      try {
        const res = await fetch('/api/retrieve-code');
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'Available' && data.code) {
            // Trigger animation
            setState({
              code: data.code,
              isRevealed: false,
              isAnimating: true,
            });

            // Reveal after brief delay
            setTimeout(() => {
              setState((prev) => ({
                ...prev,
                isRevealed: true,
              }));
            }, 100);
          }
        }
      } catch (error) {
        console.log('Code not available yet');
      }
    };

    // Check immediately on page load
    void checkForCode();

    // Then check every 30 seconds
    const interval = setInterval(() => void checkForCode(), 30000);

    // Subscribe to realtime channel for instant notifications
    let connection: Awaited<ReturnType<typeof connectRealtime>> | null = null;

    const setupRealtime = async () => {
      const userId = context.userId;
      if (!userId) {
        console.log('No userId available for realtime connection');
        return;
      }

      try {
        connection = await connectRealtime({
          channel: `code_${userId}`,
          onConnect: (channel) => {
            console.log(`Connected to realtime channel: ${channel}`);
          },
          onDisconnect: (channel) => {
            console.log(`Disconnected from realtime channel: ${channel}`);
          },
          onMessage: (data) => {
            console.log('Received realtime message:', data);
            // Code is available, fetch it immediately
            void checkForCode();
          },
        });
      } catch (error) {
        console.error('Failed to connect to realtime:', error);
      }
    };

    void setupRealtime();

    return () => {
      clearInterval(interval);
      if (connection) {
        void connection.disconnect();
      }
    };
  }, []);

  const handleDeleteCode = async () => {
    try {
      const res = await fetch('/api/delete-code', {
        method: 'POST',
      });
      if (res.ok) {
        // Reset state
        setState({
          code: null,
          isRevealed: false,
          isAnimating: false,
        });
        console.log('Code deleted successfully');
      }
    } catch (error) {
      console.error('Failed to delete code', error);
    }
  };

  return (
    <div className="flex relative flex-col justify-center items-center min-h-screen gap-8 bg-gray-900 p-6">
      <div className="flex flex-col items-center gap-4 max-w-md w-full">
        <h1 className="text-2xl font-bold text-center text-white">
          {state.isRevealed ? 'Your code is...' : 'Reveal your code by commenting !medic'}
        </h1>

        <div className="w-full mt-4 p-6 bg-gray-800 rounded-lg border border-gray-700 relative overflow-hidden">
          <div
            className="text-sm font-mono text-gray-300 leading-relaxed transition-all duration-1000 ease-out"
            style={{
              filter: state.isRevealed ? 'blur(0px)' : 'blur(8px)',
              opacity: state.isRevealed ? 1 : 0.6,
            }}
          >
            {state.code ? (
              <div className="whitespace-pre-wrap break-words">{state.code}</div>
            ) : (
              <>
                <div>const secretCode = {`{`}</div>
                <div> access: "ALPHA-2024",</div>
                <div> key: "X9K2-P7M4-Q5N8",</div>
                <div> level: "premium"</div>
                <div>{`}`};</div>
              </>
            )}
          </div>
          {!state.isRevealed && (
            <div
              className="absolute inset-0 flex items-center justify-center transition-opacity duration-500"
              style={{ opacity: state.isAnimating ? 0 : 1 }}
            >
              <div className="text-gray-400 font-semibold text-lg">🔒 Locked</div>
            </div>
          )}
          {state.isRevealed && (
            <div className="absolute top-2 right-2 text-green-400 text-xl animate-pulse">✓</div>
          )}
        </div>

        <p className="text-sm text-center text-gray-400 mt-2">
          {state.isRevealed ? (
            <span className="text-green-400">Code revealed successfully! 🎉</span>
          ) : (
            <>
              Comment{' '}
              <span className="bg-gray-800 px-2 py-1 rounded text-orange-400 font-mono">
                !medic
              </span>{' '}
              below to unlock your unique code
            </>
          )}
        </p>
      </div>

      <button
        onClick={handleDeleteCode}
        className="fixed bottom-4 right-4 px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-xs rounded shadow-lg transition-colors"
      >
        Debug: Delete code
      </button>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
