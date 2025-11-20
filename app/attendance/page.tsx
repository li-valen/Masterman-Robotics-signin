"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface AttendanceEntry {
  uid: string;
  name: string;
  signedIn: boolean;
  signInTime: string | null;
  signOutTime: string | null;
  hours: number;
}

type AttendanceByDate = Record<string, Record<string, { sign_in_time: string | null; sign_out_time: string | null; signed_in: boolean; hours: number }>>;

export default function AttendancePage() {
  const [attendanceMap, setAttendanceMap] = useState<AttendanceByDate>({});
  const [cardNames, setCardNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const availableDates = useMemo(() => Object.keys(attendanceMap).sort().reverse(), [attendanceMap]);

  const fetchRepoFiles = async () => {
    setLoading(true);
    try {
      const [attResp, namesResp] = await Promise.all([
        fetch('/attendance.json'),
        fetch('/card_names.json')
      ]);

      const attJson = attResp.ok ? await attResp.json() : {};
      const namesJson = namesResp.ok ? await namesResp.json() : {};

      setAttendanceMap(attJson || {});
      setCardNames(namesJson || {});

      // default selected date: today if present, else most recent
      const today = new Date().toISOString().slice(0,10);
      if (attJson && attJson[today]) setSelectedDate(today);
      else {
        const keys = Object.keys(attJson || {}).sort().reverse();
        setSelectedDate(keys.length ? keys[0] : null);
      }

      setLastUpdate(new Date());
    } catch (e) {
      console.error('Failed to read local attendance files', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRepoFiles();
    const interval = setInterval(fetchRepoFiles, 5000);
    return () => clearInterval(interval);
  }, []);

  const entries: AttendanceEntry[] = useMemo(() => {
    if (!selectedDate) return [];
    const day = attendanceMap[selectedDate] || {};
    const uids = new Set<string>([...Object.keys(day), ...Object.keys(cardNames)]);
    const list: AttendanceEntry[] = [];
    for (const uid of Array.from(uids)) {
      const e = day[uid] || { signed_in: false, sign_in_time: null, sign_out_time: null, hours: 0 };
      list.push({
        uid,
        name: cardNames[uid] || uid,
        signedIn: !!e.signed_in,
        signInTime: e.sign_in_time || null,
        signOutTime: e.sign_out_time || null,
        hours: e.hours || 0
      });
    }
    return list.sort((a,b) => a.name.localeCompare(b.name));
  }, [selectedDate, attendanceMap, cardNames]);

  const signedInCount = entries.filter(e => e.signedIn).length;
  const totalCount = entries.length;

  // Save updated attendanceMap + cardNames back to server (local only)
  const saveToRepo = async (newMap: AttendanceByDate, newNames: Record<string,string>) => {
    setAttendanceMap(newMap);
    setCardNames(newNames);
    setLastUpdate(new Date());
    try {
      const resp = await fetch('/api/save-attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendance: newMap, card_names: newNames })
      });
      if (!resp.ok) {
        const txt = await resp.text();
        console.warn('Save rejected:', txt);
      }
    } catch (e) {
      console.warn('Save failed (likely running on Vercel or read-only environment):', e);
    }
  };

  const toggleSign = (uid: string) => {
    if (!selectedDate) return;
    const newMap = { ...attendanceMap };
    if (!newMap[selectedDate]) newMap[selectedDate] = {};
    const entry = newMap[selectedDate][uid] || { sign_in_time: null, sign_out_time: null, signed_in: false, hours: 0 };
    if (entry.signed_in) {
      // sign out
      entry.signed_in = false;
      entry.sign_out_time = new Date().toISOString();
      // compute hours if sign_in_time present
      if (entry.sign_in_time) {
        const diff = (new Date(entry.sign_out_time).getTime() - new Date(entry.sign_in_time).getTime())/3600000;
        entry.hours = Math.max(0, diff);
      }
    } else {
      // sign in
      entry.signed_in = true;
      entry.sign_in_time = new Date().toISOString();
      entry.sign_out_time = null;
      entry.hours = 0;
    }
    newMap[selectedDate][uid] = entry;
    saveToRepo(newMap, cardNames);
  };

  const addManual = (uid: string, name?: string) => {
    if (!selectedDate || !uid) return;
    const newMap = { ...attendanceMap };
    if (!newMap[selectedDate]) newMap[selectedDate] = {};
    newMap[selectedDate][uid] = { sign_in_time: new Date().toISOString(), sign_out_time: null, signed_in: true, hours: 0 };
    const newNames = { ...cardNames };
    if (name) newNames[uid] = name;
    saveToRepo(newMap, newNames);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">Attendance System</h1>
            <p className="text-gray-600 dark:text-gray-400">{lastUpdate ? `${lastUpdate.toLocaleTimeString()} - ${lastUpdate.toLocaleDateString()}` : 'Not loaded'}</p>
          </div>
          <Link href="/" className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors">Back to Reader</Link>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center gap-4">
            <label className="text-sm text-gray-600 dark:text-gray-300">Select Date</label>
            <select className="p-2 border rounded" value={selectedDate || ''} onChange={(e) => setSelectedDate(e.target.value || null)}>
              {availableDates.length === 0 && (<option value="">No data</option>)}
              {availableDates.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <button onClick={fetchRepoFiles} className="ml-auto px-3 py-2 bg-gray-200 dark:bg-gray-700 rounded">Reload</button>
          </div>
        </div>

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
            <p className="text-3xl font-bold text-red-600 dark:text-red-400">{totalCount - signedInCount}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">Attendance — {selectedDate || 'None'}</h2>
            <div className="flex items-center gap-2">
              <input id="manual-uid" placeholder="UID (e.g. 70 0A 10 10)" className="px-2 py-1 border rounded" />
              <input id="manual-name" placeholder="Name (optional)" className="px-2 py-1 border rounded" />
              <button onClick={() => {
                const uidEl = document.getElementById('manual-uid') as HTMLInputElement | null;
                const nameEl = document.getElementById('manual-name') as HTMLInputElement | null;
                if (!uidEl) return;
                const uid = uidEl.value.trim();
                const name = nameEl?.value.trim() || undefined;
                if (uid) {
                  addManual(uid, name);
                  uidEl.value = '';
                  if (nameEl) nameEl.value = '';
                }
              }} className="px-3 py-2 bg-blue-500 text-white rounded">Manual Sign In</button>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8"><p className="text-gray-500 dark:text-gray-400">Loading attendance...</p></div>
          ) : entries.length === 0 ? (
            <div className="text-center py-8"><p className="text-gray-500 dark:text-gray-400">No attendance for this date</p></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {entries.map(entry => (
                <div key={entry.uid} className={`p-4 rounded-lg border-2 transition-all ${entry.signedIn ? 'bg-green-50 dark:bg-green-900/20 border-green-500' : 'bg-red-50 dark:bg-red-900/20 border-red-500'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-900 dark:text-white text-lg">{entry.name}</h3>
                    <div className={`w-4 h-4 rounded-full ${entry.signedIn ? 'bg-green-500' : 'bg-red-500'}`} />
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 font-mono mb-1">{entry.uid}</p>
                  {entry.signedIn && entry.signInTime && <p className="text-xs text-gray-500">In: {new Date(entry.signInTime).toLocaleTimeString()}</p>}
                  {!entry.signedIn && entry.signOutTime && <p className="text-xs text-gray-500">Out: {new Date(entry.signOutTime).toLocaleTimeString()}</p>}
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => toggleSign(entry.uid)} className="px-3 py-1 bg-indigo-500 text-white rounded text-sm">{entry.signedIn ? 'Sign Out' : 'Sign In'}</button>
                    <Link href={`/attendance/profile?uid=${encodeURIComponent(entry.uid)}`} className="px-3 py-1 bg-gray-200 rounded text-sm">Profile</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

