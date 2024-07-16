import NextAuth from "next-auth/next"
import Steam from "@/app/_auth/steam"
import type { NextApiRequest, NextApiResponse } from "next"


const auth = async (req: NextApiRequest, res: NextApiResponse) => {
    return await NextAuth(req, res, {
        providers: [
            Steam(req, {
                clientSecret: process.env.STEAM_CLIENT_SECRET!,
                callbackUrl: `${process.env.NEXTAUTH_URL}/api/auth/callback`
            })
        ]
    })
}

export { auth as GET, auth as POST }