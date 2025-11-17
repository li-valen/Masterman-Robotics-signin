import { NextResponse } from 'next/server'

// Vercel Serverless endpoint to receive attendance payloads and store them in a GitHub Gist.
// Environment variables to set in Vercel:
// - RECEIVER_SECRET: secret string used to authenticate incoming POSTs (required)
// - GITHUB_TOKEN: GitHub Personal Access Token with `gist` scope (required)
// - GIST_ID: optional existing gist id to update; if omitted a new gist will be created

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization') || ''
    const expected = process.env.RECEIVER_SECRET
    if (!expected) {
      return NextResponse.json({ success: false, error: 'Receiver not configured' }, { status: 500 })
    }

    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'Missing Bearer token' }, { status: 401 })
    }
    const token = authHeader.slice(7)
    if (token !== expected) {
      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 403 })
    }

    const payload = await request.json()

    const githubToken = process.env.GITHUB_TOKEN
    if (!githubToken) {
      return NextResponse.json({ success: false, error: 'GITHUB_TOKEN not configured' }, { status: 500 })
    }

    const gistId = process.env.GIST_ID
    const content = JSON.stringify(payload, null, 2)

    const headers = {
      'Authorization': `token ${githubToken}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    }

    if (gistId) {
      // Update existing gist
      const resp = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ files: { 'attendance.json': { content } } })
      })
      if (!resp.ok) {
        const txt = await resp.text()
        return NextResponse.json({ success: false, error: `GitHub update failed: ${txt}` }, { status: 502 })
      }
      const data = await resp.json()
      return NextResponse.json({ success: true, gistId: data.id, url: data.html_url })
    }

    // Create new gist
    const createResp = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        public: false,
        description: 'Attendance backup from NFC reader',
        files: { 'attendance.json': { content } }
      })
    })
    if (!createResp.ok) {
      const txt = await createResp.text()
      return NextResponse.json({ success: false, error: `GitHub create failed: ${txt}` }, { status: 502 })
    }
    const data = await createResp.json()
    return NextResponse.json({ success: true, gistId: data.id, url: data.html_url })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 })
  }
}
