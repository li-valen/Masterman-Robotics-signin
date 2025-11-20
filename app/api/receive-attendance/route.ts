import { NextResponse } from 'next/server'

// The remote receiver that previously stored attendance in a GitHub Gist
// has been deprecated for this project. Instead, please commit and push
// `public/attendance.json` and `public/card_names.json` to your repository.
// Vercel will redeploy and the site will pick up the updated files.

export async function POST() {
  return NextResponse.json({
    success: false,
    error: 'Remote gist-based receive is disabled. Please git commit & push attendance files instead.'
  }, { status: 410 })
}
