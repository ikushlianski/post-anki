import { createStart } from '@tanstack/react-start'

import { webAuthMiddleware } from './web-auth/web-auth.middleware'

export const startInstance = createStart(() => ({
  requestMiddleware: [webAuthMiddleware],
}))
