"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

// Use local backend when developing locally; otherwise use the serverless relative API path
const LOCAL_API = 'http://localhost:5001/api';
const API_BASE = (typeof window !== 'undefined' && (
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
)) ? (process.env.NEXT_PUBLIC_API_URL || LOCAL_API) : '/api';

interface AttendanceDay {
  date: string;
  signInTime: string | null;
  signOutTime: string | null;
  hours: number;
  signedIn: boolean;
  attended: boolean;
}

interface Profile {
  uid: string;
  name: string;
  totalHours: number;
  daysAttended: number;
  daysMissed: number;
  totalDays: number;
  averageHours: number;
  attendanceRate: number;
  attendanceHistory: AttendanceDay[];
}

export default function ProfileClient() {
  const searchParams = useSearchParams();
  const uid = searchParams?.get('uid');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }

    const fetchProfile = async () => {
      try {
        // If running against the deployed app, there may be no server-side
        // `person-profile` endpoint. In that case, fetch the persisted gist
        // from `/api/fetch-attendance` and compute the profile client-side.
        if (API_BASE === '/api') {
          const resp = await fetch('/api/fetch-attendance');
          const data = await resp.json();
          if (!data.success) {
            console.error('fetch-attendance failed', data);
            return;
          }

          // Normalize attendance shape (handle nested attendance.card_names)
          let attendanceByDate: Record<string, any> = data.attendance as any;
          let cardNamesMap: Record<string, string> = (data as any).cardNames || {};
          if (attendanceByDate && attendanceByDate.attendance) {
            const nested = attendanceByDate;
            attendanceByDate = nested.attendance || {};
            const nestedCardNames = nested.card_names || nested.cardNames || {};
            const top = (data as any).cardNames || {};
            cardNamesMap = Object.keys(top).length > 0 ? top : nestedCardNames;
          }

          // Build profile for uid
          const dates = Object.keys(attendanceByDate).sort();
          const attendanceHistory: any[] = dates.map((d) => {
            const day = attendanceByDate[d] || {};
            const e = day[uid];
            if (e) {
              return {
                date: d,
                signInTime: e.sign_in_time || null,
                signOutTime: e.sign_out_time || null,
                hours: e.hours || 0,
                signedIn: !!e.signed_in,
                attended: !!e.signed_in || (e.sign_out_time != null)
              };
            }
            return {
              date: d,
              signInTime: null,
              signOutTime: null,
              hours: 0,
              signedIn: false,
              attended: false
            };
          });

          const totalDays = attendanceHistory.length;
          const daysAttended = attendanceHistory.filter((x) => x.attended).length;
          const totalHours = attendanceHistory.reduce((s, x) => s + (x.hours || 0), 0);
          const averageHours = totalDays > 0 ? totalHours / totalDays : 0;
          const attendanceRate = totalDays > 0 ? (daysAttended / totalDays) * 100 : 0;

          const profileObj: Profile = {
            uid,
            name: cardNamesMap[uid] || uid,
            totalHours: totalHours,
            daysAttended: daysAttended,
            daysMissed: totalDays - daysAttended,
            totalDays: totalDays,
            averageHours: averageHours,
            attendanceRate: attendanceRate,
            attendanceHistory: attendanceHistory
          };

          setProfile(profileObj);
          return;
        }

        // Fallback: call the local backend person-profile endpoint
        const response = await fetch(`${API_BASE}/person-profile?uid=${encodeURIComponent(uid)}`);
        const data = await response.json();
        if (data.success) {
          setProfile(data.profile);
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [uid]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">Loading profile...</p>
          </div>
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center py-12">
            <p className="text-red-600 dark:text-red-400">Profile not found</p>
            <Link href="/attendance" className="text-blue-500 hover:underline mt-4 inline-block">
              Back to Attendance
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">{profile.name}</h1>
            <p className="text-gray-600 dark:text-gray-400 font-mono text-sm">{profile.uid}</p>
          </div>
          <Link href="/attendance" className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors">
            Back to Attendance
          </Link>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Hours</p>
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{profile.totalHours.toFixed(1)}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Days Attended</p>
            <p className="text-3xl font-bold text-green-600 dark:text-green-400">{profile.daysAttended}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Days Missed</p>
            <p className="text-3xl font-bold text-red-600 dark:text-red-400">{profile.daysMissed}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Avg Hours/Day</p>
            <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">{profile.averageHours.toFixed(1)}</p>
          </div>
        </div>

        {/* Additional Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Attendance Rate</p>
            <div className="flex items-center gap-4">
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{profile.attendanceRate.toFixed(1)}%</p>
              <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-4">
                <div className="bg-green-500 h-4 rounded-full transition-all" style={{ width: `${profile.attendanceRate}%` }} />
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Days Tracked</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{profile.totalDays}</p>
          </div>
        </div>

        {/* Attendance History */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">Attendance History</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900 dark:text-white">Date</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900 dark:text-white">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900 dark:text-white">Sign In</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900 dark:text-white">Sign Out</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900 dark:text-white">Hours</th>
                </tr>
              </thead>
              <tbody>
                {profile.attendanceHistory.map((day, index) => (
                  <tr key={day.date} className={`border-b border-gray-100 dark:border-gray-700 ${index % 2 === 0 ? 'bg-gray-50 dark:bg-gray-900/50' : ''}`}>
                    <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                      {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td className="py-3 px-4">
                      {day.attended ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300">Attended</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300">Missed</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">{day.signInTime ? new Date(day.signInTime).toLocaleTimeString() : '—'}</td>
                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">{day.signOutTime ? new Date(day.signOutTime).toLocaleTimeString() : day.signedIn ? 'Still in' : '—'}</td>
                    <td className="py-3 px-4 text-sm font-semibold text-gray-900 dark:text-white">{day.hours > 0 ? `${day.hours.toFixed(1)}h` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
