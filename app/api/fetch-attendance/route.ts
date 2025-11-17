import { NextResponse } from 'next/server'

// Fetch attendance JSON from the configured GitHub Gist.
// Environment variables (set in Vercel):
// - GITHUB_TOKEN: GitHub PAT with `gist` scope
// - GIST_ID: ID of the gist created by the receiver (or set during creation)

export async function GET() {
  try {
    let gistId = process.env.GIST_ID
    const githubToken = process.env.GITHUB_TOKEN
    if (!githubToken) {
      return NextResponse.json({ success: false, error: 'GITHUB_TOKEN not configured' }, { status: 500 })
    }

    const headers: Record<string,string> = {
      'Authorization': `token ${githubToken}`,
      'Accept': 'application/vnd.github+json'
    }

    // If GIST_ID not set, try to find a gist belonging to the authenticated user
    // that contains `attendance.json` (created by the receiver endpoint).
    if (!gistId) {
      const listResp = await fetch('https://api.github.com/gists', { headers })
      if (!listResp.ok) {
        const txt = await listResp.text()
        return NextResponse.json({ success: false, error: `Failed to list gists: ${txt}` }, { status: 502 })
      }
      const gists = await listResp.json()
      // Find first gist that contains attendance.json or has our description
      const found = gists.find((g: any) => {
        if (!g.files) return false
        if (g.files['attendance.json']) return true
        if (typeof g.description === 'string' && g.description.includes('Attendance backup')) return true
        return false
      })
      if (found) gistId = found.id
      else return NextResponse.json({ success: false, error: 'No gist with attendance.json found' }, { status: 404 })
    }

    const resp = await fetch(`https://api.github.com/gists/${gistId}`, { headers })
    if (!resp.ok) {
      const txt = await resp.text()
      return NextResponse.json({ success: false, error: `GitHub fetch failed: ${txt}` }, { status: 502 })
    }
    const data = await resp.json()
    // Expect file named attendance.json; optionally card_names.json
    const files = data.files || {}
    const file = files['attendance.json']
    if (!file) {
      return NextResponse.json({ success: false, error: 'attendance.json not found in gist' }, { status: 404 })
    }
    let parsed
    try {
      parsed = JSON.parse(file.content)
    } catch (e) {
      return NextResponse.json({ success: false, error: 'Failed to parse attendance JSON' }, { status: 500 })
    }

    let parsedCardNames = {}
    if (files['card_names.json']) {
      try {
        parsedCardNames = JSON.parse(files['card_names.json'].content)
      } catch (e) {
        parsedCardNames = {}
      }
    }

    return NextResponse.json({ success: true, attendance: parsed, cardNames: parsedCardNames })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 })
  }
}
