'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import NFCInterface from '@/components/NFCInterface';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
              NFC Reader Interface
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              ACS-ACR122U NFC Reader - Automatic Card Detection
            </p>
          </div>
          <Link
            href="/attendance"
            className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
          >
            View Attendance
          </Link>
        </div>
        <NFCInterface />
      </div>
    </main>
  );
}

