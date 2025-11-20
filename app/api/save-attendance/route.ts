import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

// Save attendance + card_names to the repository `public/` directory.
// For safety this only runs when `process.env.NODE_ENV === 'development'`
// or when `process.env.ALLOW_WRITE === 'true'` (useful for local servers).

export async function POST(request: Request) {
  try {
    const allow = process.env.NODE_ENV === 'development' || process.env.ALLOW_WRITE === 'true'
    if (!allow) {
      return NextResponse.json({ success: false, error: 'Write disabled in this environment' }, { status: 403 })
    }

    const body = await request.json()
    const attendance = body.attendance || {}
    const card_names = body.card_names || {}

    const repoRoot = process.cwd()
    const publicDir = path.join(repoRoot, 'public')

    // Ensure public directory exists
    await fs.mkdir(publicDir, { recursive: true })

    const attPath = path.join(publicDir, 'attendance.json')
    const namesPath = path.join(publicDir, 'card_names.json')

    await fs.writeFile(attPath, JSON.stringify(attendance, null, 2), 'utf8')
    await fs.writeFile(namesPath, JSON.stringify(card_names, null, 2), 'utf8')

    return NextResponse.json({ success: true, written: { attendance: attPath, card_names: namesPath } })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 })
  }
}
