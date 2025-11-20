import { NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

async function readJsonFile(paths: string[]) {
  for (const p of paths) {
    try {
      const buf = await fs.readFile(p, 'utf8')
      return JSON.parse(buf)
    } catch (e) {
      // try next
    }
  }
  return {}
}

export async function GET() {
  try {
    const root = process.cwd()
    const attendancePaths = [
      path.join(root, 'public', 'attendance.json'),
      path.join(root, 'attendance.json')
    ]
    const namesPaths = [
      path.join(root, 'public', 'card_names.json'),
      path.join(root, 'card_names.json')
    ]

    const [attendance, cardNames] = await Promise.all([
      readJsonFile(attendancePaths),
      readJsonFile(namesPaths)
    ])

    return NextResponse.json({ success: true, attendance, cardNames })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
