import React, { Suspense } from 'react';
import ProfileClient from './ProfileClient';

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      {/* Client component handles search params and data fetching */}
      <ProfileClient />
    </Suspense>
  );
}



