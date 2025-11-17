'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const API_BASE = typeof window !== 'undefined' && (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '') || 'http://localhost:5001/api';

interface AttendanceEntry {
  uid: string;
  name: string;
  signedIn: boolean;
  signInTime: string | null;
  signOutTime: string | null;
  hours: number;
}

export default function AttendancePage() {
  const [attendance, setAttendance] = useState<AttendanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchAttendance = async () => {
    try {
      // If running on localhost use the local backend attendance-status endpoint.
      // Otherwise (deployed) try the serverless `fetch-attendance` endpoint which
      // reads the persisted gist backup.
      const isLocal = typeof window !== 'undefined' && (
        window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      );

      if (isLocal) {
        const response = await fetch(`${API_BASE}/attendance-status`);
        const data = await response.json();
        if (data.success) {
          // Sort by name alphabetically
          const sorted = data.attendance.sort((a: AttendanceEntry, b: AttendanceEntry) =>
            a.name.localeCompare(b.name)
          );
          setAttendance(sorted);
          setLastUpdate(new Date());
        }
      } else {
        // Deployed: fetch persisted attendance from Vercel
        const resp = await fetch('/api/fetch-attendance');
        const data = await resp.json();
        if (data.success && data.attendance) {
          // `data.attendance` may be either the attendance object
          // or an object containing both `attendance` and `card_names` (deployed older shape).
          const today = new Date().toISOString().slice(0, 10);
          let attendanceByDate = data.attendance as any;
          // If endpoint returned { attendance: { attendance: {...}, card_names: {...} } }
          if (attendanceByDate && attendanceByDate.attendance) {
            // unwrap nested attendance
            const nested = attendanceByDate;
            attendanceByDate = nested.attendance;
            // prefer top-level `data.cardNames` if present, else use nested `card_names`
            const cardNamesFromNested = nested.card_names || nested.cardNames || {};
            // Merge into a normalized `cardNames` on `data` for compatibility below
            (data as any).cardNames = (data as any).cardNames || cardNamesFromNested;
          }
          const cardNamesMap: Record<string, string> = (data as any).cardNames || {};
          // Prefer today's data, else fall back to the most recent date available
          let dayKey: string | null = today;
          if (!attendanceByDate[dayKey]) {
            const keys = Object.keys(attendanceByDate).sort().reverse();
            dayKey = keys.length ? keys[0] : null;
          }

          const entries: AttendanceEntry[] = [];
          if (dayKey) {
            const dayObj = attendanceByDate[dayKey];
            for (const uid of Object.keys(dayObj)) {
              const e = dayObj[uid];
              entries.push({
                uid,
                name: cardNamesMap[uid] || uid,
                signedIn: !!e.signed_in,
                signInTime: e.sign_in_time || null,
                signOutTime: e.sign_out_time || null,
                hours: e.hours || 0
              });
            }
          }

          // Sort by name (which is uid here)
          entries.sort((a, b) => a.name.localeCompare(b.name));
          setAttendance(entries);
          setLastUpdate(new Date());
        }
      }
    } catch (error) {
      console.error('Error fetching attendance:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
    // Refresh every 5 seconds
    const interval = setInterval(fetchAttendance, 5000);
    return () => clearInterval(interval);
  }, []);

  const signedInCount = attendance.filter(a => a.signedIn).length;
  const totalCount = attendance.length;
  const signedOutCount = totalCount - signedInCount;

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
              Attendance System
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {lastUpdate.toLocaleTimeString()} - {lastUpdate.toLocaleDateString()}
            </p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            Back to Reader
          </Link>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Registered</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{totalCount}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Signed In</p>
            <p className="text-3xl font-bold text-green-600 dark:text-green-400">{signedInCount}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Not Signed In</p>
            <p className="text-3xl font-bold text-red-600 dark:text-red-400">{signedOutCount}</p>
          </div>
        </div>

        {/* Attendance List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
              Today's Attendance
            </h2>
            <button
              onClick={fetchAttendance}
              disabled={loading}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg transition-colors text-sm"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <p className="text-gray-500 dark:text-gray-400">Loading attendance...</p>
            </div>
          ) : attendance.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 dark:text-gray-400">No registered cards found</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                Register cards on the main page first
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {attendance.map((entry) => (
                <Link
                  key={entry.uid}
                  href={`/attendance/profile?uid=${encodeURIComponent(entry.uid)}`}
                  className={`p-4 rounded-lg border-2 transition-all cursor-pointer hover:shadow-lg ${
                    entry.signedIn
                      ? 'bg-green-50 dark:bg-green-900/20 border-green-500 dark:border-green-400'
                      : 'bg-red-50 dark:bg-red-900/20 border-red-500 dark:border-red-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-900 dark:text-white text-lg">
                      {entry.name}
                    </h3>
                    <div
                      className={`w-4 h-4 rounded-full ${
                        entry.signedIn
                          ? 'bg-green-500 dark:bg-green-400'
                          : 'bg-red-500 dark:bg-red-400'
                      }`}
                    />
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 font-mono mb-1">
                    {entry.uid}
                  </p>
                  {entry.signedIn && entry.signInTime && (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-gray-500 dark:text-gray-500">
                        In: {new Date(entry.signInTime).toLocaleTimeString()}
                      </p>
                      {entry.hours > 0 && (
                        <p className="text-xs font-semibold text-green-600 dark:text-green-400">
                          {entry.hours.toFixed(1)} hours today
                        </p>
                      )}
                    </div>
                  )}
                  {!entry.signedIn && entry.hours > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-gray-500 dark:text-gray-500">
                        Out: {entry.signOutTime ? new Date(entry.signOutTime).toLocaleTimeString() : 'N/A'}
                      </p>
                      <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                        {entry.hours.toFixed(1)} hours today
                      </p>
                    </div>
                  )}
                  {!entry.signedIn && entry.hours === 0 && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-2 font-medium">
                      Not signed in
                    </p>
                  )}
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 italic">
                    Click to view profile →
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

