import { NextResponse } from 'next/server'

// Fetch attendance JSON from the configured GitHub Gist.
// Environment variables (set in Vercel):
// - GITHUB_TOKEN: GitHub PAT with `gist` scope
// - GIST_ID: ID of the gist created by the receiver (or set during creation)

export async function GET() {
  import { NextResponse } from 'next/server'
  import { promises as fs } from 'fs'
  import path from 'path'

  // Fetch attendance JSON for the UI.
  // Behavior:
  // - First try to read `attendance.json` and `card_names.json` from the repository filesystem
  //   (this lets Vercel deployments serve data based on the committed files after a git push).
  // - If those files aren't present, fall back to the GitHub Gist lookup (existing behavior).
  // Environment variables (optional):
  // - GITHUB_TOKEN: GitHub PAT with `gist` scope (used for the fallback pathway)
  // - GIST_ID: ID of the gist created by the receiver (optional)

  async function readFromRepo() {
    try {
      const repoRoot = process.cwd()
      // prefer public/ where Vercel will serve committed static files
      const attendancePath = path.join(repoRoot, 'public', 'attendance.json')
      const cardNamesPath = path.join(repoRoot, 'public', 'card_names.json')

      const data = await fs.readFile(attendancePath, 'utf8')
      const parsed = JSON.parse(data)

      let parsedCardNames: Record<string, string> = {}
      try {
        const namesRaw = await fs.readFile(cardNamesPath, 'utf8')
        parsedCardNames = JSON.parse(namesRaw)
      } catch (e) {
        // it's fine if card_names.json doesn't exist in the repo
        parsedCardNames = {}
      }

      // Try to get the file mtime for freshness info
      let updatedAt: string | null = null
      try {
        const stat = await fs.stat(attendancePath)
        updatedAt = stat.mtime.toISOString()
      } catch (e) {
        updatedAt = null
      }

      return { success: true, attendance: parsed, cardNames: parsedCardNames, gist: { id: null, updatedAt } }
    } catch (e) {
      return null
    }
  }

  export async function GET() {
    try {
      // Prefer repo files so the site can be updated by `git push` and Vercel redeploys.
      const repoResult = await readFromRepo()
      if (repoResult) return NextResponse.json(repoResult)

      // Fallback to GitHub Gist-based retrieval (original behavior)
      let gistId = process.env.GIST_ID
      const githubToken = process.env.GITHUB_TOKEN
      if (!githubToken) {
        return NextResponse.json({ success: false, error: 'GITHUB_TOKEN not configured and repo files missing' }, { status: 500 })
      }

      const headers: Record<string,string> = {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github+json'
      }

      if (!gistId) {
        const listResp = await fetch('https://api.github.com/gists', { headers })
        if (!listResp.ok) {
          const txt = await listResp.text()
          return NextResponse.json({ success: false, error: `Failed to list gists: ${txt}` }, { status: 502 })
        }
        const gists = await listResp.json()
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

      const gistMeta = { id: data.id, updatedAt: data.updated_at }

      return NextResponse.json({ success: true, attendance: parsed, cardNames: parsedCardNames, gist: gistMeta })
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 })
    }
  }
