import { NextResponse } from 'next/server'

// Fetch attendance JSON from the configured GitHub Gist.
// Environment variables (set in Vercel):
// - GITHUB_TOKEN: GitHub PAT with `gist` scope
// - GIST_ID: ID of the gist created by the receiver (or set during creation)

export async function GET() {
  try {
    const gistId = process.env.GIST_ID
    const githubToken = process.env.GITHUB_TOKEN
    if (!gistId) {
      return NextResponse.json({ success: false, error: 'GIST_ID not configured' }, { status: 400 })
    }
    if (!githubToken) {
      return NextResponse.json({ success: false, error: 'GITHUB_TOKEN not configured' }, { status: 500 })
    }

    const headers: Record<string,string> = {
      'Authorization': `token ${githubToken}`,
      'Accept': 'application/vnd.github+json'
    }

    const resp = await fetch(`https://api.github.com/gists/${gistId}`, { headers })
    if (!resp.ok) {
      const txt = await resp.text()
      return NextResponse.json({ success: false, error: `GitHub fetch failed: ${txt}` }, { status: 502 })
    }
    const data = await resp.json()
    // Expect file named attendance.json
    const file = data.files && data.files['attendance.json']
    if (!file) {
      return NextResponse.json({ success: false, error: 'attendance.json not found in gist' }, { status: 404 })
    }
    let parsed
    try {
      parsed = JSON.parse(file.content)
    } catch (e) {
      return NextResponse.json({ success: false, error: 'Failed to parse attendance JSON' }, { status: 500 })
    }
    return NextResponse.json({ success: true, attendance: parsed })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 })
  }
}
