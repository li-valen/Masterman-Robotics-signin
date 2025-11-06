'use client';

import { useEffect, useState, useCallback } from 'react';

const API_BASE = 'http://localhost:5001/api';

interface CardInfo {
  cardName: string;
  t0Supported: boolean;
  t1Supported: boolean;
  t15Supported: boolean;
  atr: string;
}

interface Status {
  readerConnected: boolean;
  readerName: string | null;
  cardPresent: boolean;
  cardUid: string | null;
  cardName: string | null;
  cardInfo: CardInfo | null;
  detectionActive: boolean;
}

interface OperationLog {
  id: string;
  timestamp: Date;
  type: 'success' | 'error' | 'info';
  message: string;
}

export default function NFCInterface() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [keyInput, setKeyInput] = useState('');
  const [sectorInput, setSectorInput] = useState('0');
  const [sectorData, setSectorData] = useState<any>(null);
  const [cardNameInput, setCardNameInput] = useState('');
  const [showNameInput, setShowNameInput] = useState(false);

  const addLog = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    const log: OperationLog = {
      id: Date.now().toString(),
      timestamp: new Date(),
      type,
      message,
    };
    setLogs((prev) => [log, ...prev].slice(0, 50)); // Keep last 50 logs
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/status`);
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error('Error fetching status:', error);
    }
  }, []);

  const startDetection = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/start-detection`, { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        addLog('success', 'Card detection started');
        fetchStatus();
      }
    } catch (error) {
      addLog('error', 'Failed to start detection');
    }
  }, [addLog, fetchStatus]);

  const stopDetection = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/stop-detection`, { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        addLog('info', 'Card detection stopped');
        fetchStatus();
      }
    } catch (error) {
      addLog('error', 'Failed to stop detection');
    }
  }, [addLog, fetchStatus]);

  const pollStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/poll-status`);
      const data = await response.json();
      if (data.success && data.update) {
        if (data.update.status === 'card_detected') {
          const nameText = data.update.name ? ` - ${data.update.name}` : '';
          addLog('success', `Card detected - UID: ${data.update.uid}${nameText}`);
          fetchStatus();
        } else if (data.update.status === 'card_removed') {
          addLog('info', 'Card removed');
          fetchStatus();
        }
      }
    } catch (error) {
      // Silent fail for polling
    }
  }, [addLog, fetchStatus]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(() => {
      fetchStatus();
      if (status?.detectionActive) {
        pollStatus();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [fetchStatus, pollStatus, status?.detectionActive]);

  const handleOperation = async (endpoint: string, method: string = 'POST', body?: any) => {
    setLoading(true);
    try {
      const options: RequestInit = { method };
      if (body) {
        options.headers = { 'Content-Type': 'application/json' };
        options.body = JSON.stringify(body);
      }
      const response = await fetch(`${API_BASE}/${endpoint}`, options);
      const data = await response.json();
      if (data.success) {
        addLog('success', data.message || 'Operation successful');
        if (endpoint === 'get-uid' && data.uid) {
          addLog('info', `UID: ${data.uid}`);
        }
        fetchStatus();
      } else {
        addLog('error', data.error || 'Operation failed');
      }
      return data;
    } catch (error: any) {
      addLog('error', error.message || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadKey = async () => {
    if (keyInput.length !== 12) {
      addLog('error', 'Key must be 12 hex characters (e.g., FFFFFFFFFFFF)');
      return;
    }
    await handleOperation('load-key', 'POST', { key: keyInput });
  };

  const handleReadSector = async () => {
    const sector = parseInt(sectorInput);
    if (isNaN(sector) || sector < 0 || sector > 15) {
      addLog('error', 'Sector must be between 0 and 15');
      return;
    }
    const data = await handleOperation('read-sector', 'POST', { sector });
    if (data?.success) {
      setSectorData(data);
    }
  };

  const handleSaveCardName = async () => {
    if (!status?.cardUid) {
      addLog('error', 'No card detected');
      return;
    }
    if (!cardNameInput.trim()) {
      addLog('error', 'Card name cannot be empty');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/save-card-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: status.cardUid, name: cardNameInput.trim() }),
      });
      const data = await response.json();
      if (data.success) {
        addLog('success', data.message || 'Card name saved');
        setCardNameInput('');
        setShowNameInput(false);
        fetchStatus();
      } else {
        addLog('error', data.error || 'Failed to save card name');
      }
    } catch (error: any) {
      addLog('error', error.message || 'Failed to save card name');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status?.cardUid && status.cardName) {
      setCardNameInput(status.cardName);
    } else if (status?.cardUid && !status.cardName) {
      setCardNameInput('');
    }
  }, [status?.cardUid, status?.cardName]);

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
          Reader Status
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Reader</p>
            <p className="text-lg font-medium text-gray-900 dark:text-white">
              {status?.readerConnected ? (
                <span className="text-green-600 dark:text-green-400">
                  ✓ {status.readerName}
                </span>
              ) : (
                <span className="text-red-600 dark:text-red-400">✗ Not Connected</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Card Status</p>
            <p className="text-lg font-medium">
              {status?.cardPresent ? (
                <span className="text-green-600 dark:text-green-400">✓ Card Detected</span>
              ) : (
                <span className="text-gray-500 dark:text-gray-400">○ Waiting for card...</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Detection</p>
            <p className="text-lg font-medium">
              {status?.detectionActive ? (
                <span className="text-green-600 dark:text-green-400">Active</span>
              ) : (
                <span className="text-gray-500 dark:text-gray-400">Inactive</span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            {status?.detectionActive ? (
              <button
                onClick={stopDetection}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
              >
                Stop Detection
              </button>
            ) : (
              <button
                onClick={startDetection}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
              >
                Start Detection
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Card Information */}
      {status?.cardPresent && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
            Card Information
          </h2>
          <div className="space-y-4">
            {status.cardUid && (
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">UID</p>
                <p className="text-lg font-mono text-gray-900 dark:text-white">
                  {status.cardUid}
                </p>
              </div>
            )}
            {status.cardName && (
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Card Name</p>
                <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                  {status.cardName}
                </p>
              </div>
            )}
            
            {/* Card Name Input */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {status.cardName ? 'Edit Card Name' : 'Add Card Name'}
                </p>
                {!showNameInput && (
                  <button
                    onClick={() => {
                      setShowNameInput(true);
                      if (status.cardName) {
                        setCardNameInput(status.cardName);
                      }
                    }}
                    className="px-3 py-1 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
                  >
                    {status.cardName ? 'Edit' : 'Add'}
                  </button>
                )}
              </div>
              {showNameInput && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={cardNameInput}
                    onChange={(e) => setCardNameInput(e.target.value)}
                    placeholder="Enter card name (e.g., My Card)"
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveCardName();
                      }
                    }}
                  />
                  <button
                    onClick={handleSaveCardName}
                    disabled={loading}
                    className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-lg transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setShowNameInput(false);
                      setCardNameInput(status.cardName || '');
                    }}
                    className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {status.cardInfo && (
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Card Type</p>
                <p className="text-lg font-medium text-gray-900 dark:text-white">
                  {status.cardInfo.cardName}
                </p>
                <div className="mt-2 flex gap-4 text-sm">
                  <span className={status.cardInfo.t0Supported ? 'text-green-600' : 'text-gray-400'}>
                    T0: {status.cardInfo.t0Supported ? 'Yes' : 'No'}
                  </span>
                  <span className={status.cardInfo.t1Supported ? 'text-green-600' : 'text-gray-400'}>
                    T1: {status.cardInfo.t1Supported ? 'Yes' : 'No'}
                  </span>
                  <span className={status.cardInfo.t15Supported ? 'text-green-600' : 'text-gray-400'}>
                    T15: {status.cardInfo.t15Supported ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Operations */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
          Operations
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <button
            onClick={() => handleOperation('get-uid')}
            disabled={loading}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg transition-colors"
          >
            Get UID
          </button>
          <button
            onClick={() => handleOperation('get-info')}
            disabled={loading}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg transition-colors"
          >
            Get Info
          </button>
          <button
            onClick={() => handleOperation('firmware-version')}
            disabled={loading}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg transition-colors"
          >
            Firmware Version
          </button>
          <button
            onClick={() => handleOperation('mute')}
            disabled={loading}
            className="px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-400 text-white rounded-lg transition-colors"
          >
            Mute Beep
          </button>
          <button
            onClick={() => handleOperation('unmute')}
            disabled={loading}
            className="px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-400 text-white rounded-lg transition-colors"
          >
            Unmute Beep
          </button>
        </div>

        {/* Load Key */}
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
            Load Key
          </h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value.toUpperCase())}
              placeholder="FFFFFFFFFFF"
              maxLength={12}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
            <button
              onClick={handleLoadKey}
              disabled={loading}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 text-white rounded-lg transition-colors"
            >
              Load Key
            </button>
          </div>
        </div>

        {/* Read Sector */}
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
            Read Sector
          </h3>
          <div className="flex gap-2">
            <input
              type="number"
              value={sectorInput}
              onChange={(e) => setSectorInput(e.target.value)}
              placeholder="0"
              min="0"
              max="15"
              className="w-24 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
            <button
              onClick={handleReadSector}
              disabled={loading}
              className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-400 text-white rounded-lg transition-colors"
            >
              Read Sector
            </button>
          </div>
          {sectorData && (
            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <p className="text-sm font-semibold mb-2">
                Sector {sectorData.sector} (Key {sectorData.keyType})
              </p>
              <div className="space-y-2">
                {sectorData.blocks?.map((block: any) => (
                  <div key={block.block} className="text-sm">
                    <p className="font-mono text-xs text-gray-600 dark:text-gray-400">
                      Block {block.block}: {block.hex}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 ml-4">
                      {block.ascii}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Operation Log */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
          Operation Log
        </h2>
        <div className="max-h-64 overflow-y-auto space-y-1">
          {logs.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No operations yet</p>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className={`text-sm p-2 rounded ${
                  log.type === 'success'
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300'
                    : log.type === 'error'
                    ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300'
                    : 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300'
                }`}
              >
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {log.timestamp.toLocaleTimeString()}
                </span>{' '}
                {log.message}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

