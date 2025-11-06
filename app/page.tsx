'use client';

import { useEffect, useState } from 'react';
import NFCInterface from '@/components/NFCInterface';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
          NFC Reader Interface
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          ACS-ACR122U NFC Reader - Automatic Card Detection
        </p>
        <NFCInterface />
      </div>
    </main>
  );
}

