import { auth } from '@/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'

const handlers = toNextJsHandler(auth)

export async function GET(request: Request) {
  return handlers.GET(request)
}

export async function POST(request: Request) {
  return handlers.POST(request)
}
