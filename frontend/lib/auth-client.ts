import { createAuthClient } from "better-auth/react"
import { anonymousClient } from "better-auth/client/plugins"

export const authClient = createAuthClient({
    baseURL: typeof window !== 'undefined' ? undefined : process.env.NEXT_PUBLIC_API_URL,
    plugins: [
        anonymousClient()
    ]
})