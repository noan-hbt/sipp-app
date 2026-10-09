// Paddle.js v2, loaded only when someone subscribes. Paddle is the seller (merchant of record).

interface PaddleJs {
  Environment: { set: (env: string) => void }
  Initialize: (opts: { token: string }) => void
  Checkout: { open: (opts: Record<string, unknown>) => void }
}
declare global {
  interface Window { Paddle?: PaddleJs }
}

let loading: Promise<PaddleJs> | null = null

function load(token: string, environment: string): Promise<PaddleJs> {
  loading ??= new Promise<PaddleJs>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js'
    script.async = true
    script.onload = () => {
      const paddle = window.Paddle
      if (!paddle) return reject(new Error('paddle unavailable'))
      if (environment !== 'production') paddle.Environment.set('sandbox')
      paddle.Initialize({ token })
      resolve(paddle)
    }
    script.onerror = () => {
      loading = null
      script.remove()
      reject(new Error('paddle unavailable'))
    }
    document.head.appendChild(script)
  })
  return loading
}

export async function openCheckout(opts: {
  transactionId: string
  clientToken: string
  environment: string
  successUrl: string
  email?: string
}) {
  const paddle = await load(opts.clientToken, opts.environment)
  // After payment Paddle redirects to successUrl, which waits for the webhook to grant access.
  paddle.Checkout.open({
    transactionId: opts.transactionId,
    ...(opts.email ? { customer: { email: opts.email } } : {}),
    settings: { displayMode: 'overlay', locale: 'fr', theme: 'light', successUrl: opts.successUrl },
  })
}
