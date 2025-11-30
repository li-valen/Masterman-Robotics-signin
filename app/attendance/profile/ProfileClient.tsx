"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';

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
        // Fetch card name
        const nameDoc = await getDoc(doc(db, "card_names", uid));
        const name = nameDoc.exists() ? nameDoc.data().name : uid;

        // Fetch all attendance records
        const attendanceSnapshot = await getDocs(collection(db, "attendance"));
        const attendanceByDate: Record<string, any> = {};
        attendanceSnapshot.docs.forEach(doc => {
          attendanceByDate[doc.id] = doc.data();
        });

        // Build profile for uid
        const dates = Object.keys(attendanceByDate).sort().reverse(); // Newest first
        const attendanceHistory: AttendanceDay[] = dates.map((d) => {
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
        const averageHours = daysAttended > 0 ? totalHours / daysAttended : 0;
        const attendanceRate = totalDays > 0 ? (daysAttended / totalDays) * 100 : 0;

        const profileObj: Profile = {
          uid,
          name,
          totalHours,
          daysAttended,
          daysMissed: totalDays - daysAttended,
          totalDays,
          averageHours,
          attendanceRate,
          attendanceHistory
        };

        setProfile(profileObj);
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
