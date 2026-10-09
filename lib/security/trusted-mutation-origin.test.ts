import { afterEach, describe, expect, it, vi } from 'vitest'
import { isTrustedMutationOrigin } from './trusted-mutation-origin'

const request = (origin?: string) => new Request('http://127.0.0.1:3000/api/workspace/retry', {
  method:'POST',
  headers: origin === undefined ? {} : { origin },
})
afterEach(()=>vi.unstubAllEnvs())

describe('cookie-authenticated Route Handler CSRF Origin guard',()=>{
  it('allows same public HTTPS origin behind a reverse proxy',()=>{
    vi.stubEnv('BETTER_AUTH_URL','https://app.fitdesk.example')
    expect(isTrustedMutationOrigin(request('https://app.fitdesk.example'))).toBe(true)
  })
  it('rejects cross-origin, lookalike hostname and scheme downgrade',()=>{
    vi.stubEnv('BETTER_AUTH_URL','https://app.fitdesk.example')
    for(const origin of ['https://malicious.invalid','https://app.fitdesk.example.evil.invalid','http://app.fitdesk.example']){
      expect(isTrustedMutationOrigin(request(origin))).toBe(false)
    }
  })
  it('rejects cross-origin sibling subdomains even if SameSite cookies were sent',()=>{
    vi.stubEnv('BETTER_AUTH_URL','https://app.fitdesk.example')
    expect(isTrustedMutationOrigin(request('https://other.fitdesk.example'))).toBe(false)
  })
  it('rejects missing, null, non-web and path-bearing origin',()=>{
    vi.stubEnv('BETTER_AUTH_URL','https://app.fitdesk.example')
    for(const origin of [undefined,'null','file://localhost','https://app.fitdesk.example/path']){
      expect(isTrustedMutationOrigin(request(origin))).toBe(false)
    }
  })
  it('permits the explicitly configured disposable HTTP loopback origin',()=>{
    vi.stubEnv('BETTER_AUTH_URL','http://127.0.0.1:3000')
    expect(isTrustedMutationOrigin(request('http://127.0.0.1:3000'))).toBe(true)
  })
})
