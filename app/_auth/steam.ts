import type { NextApiRequest } from "next"
import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers/oauth"
import type { NextRequest } from "next/server"
// lib
import { v4 as uuidv4 } from "uuid"
import { TokenSet } from "openid-client"
import { SteamUserProfile } from "./types"

interface SteamProviderOptions extends Partial<OAuthConfig<SteamUserProfile>> {
    // steam secret 
    callbackUrl: string | URL,
    clientSecret: string
}

export const PROVIDER_NAME = "Steam"
export const PROVIDER_ID = "steam"
export const EMAIL_DOMAIN = "steamcommunity.com"


/**
 * https://openid.net/specs/openid-authentication-2_0.html#anchor27
 * @param redirect 
 * @param realm 
 * @returns {Object}
 */
const getAuthorizationParams = (redirect: string, realm: string) => ({
    url: "https://steamcommunity.com/openid/login",
    params: {
        'openid.mode': 'checkid_setup',
        'openid.ns': 'http://specs.openid.net/auth/2.0',
        'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
        'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
        'openid.return_to': redirect,
        'openid.realm': realm
    }
})

// Verifies the OpenID authentication assertion. Promise would return claimed_id if user authenticated or null.
const verifyAssertion = async (url: string): Promise<string | null> => {
    const IDENTIFIER_PATTERN = /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d+)$/

    if (!url) return null

    const { searchParams } = new URL(url)
    const signed = searchParams.get('openid.signed') || ''

    const token_params: Record<string, string> = {}
    for (const val of signed.split(',')) {
        token_params[`openid.${val}`] = searchParams.get(`openid.${val}`) || ''
    }

    const token_url = new URL('https://steamcommunity.com/openid/login')
    const token_url_params = new URLSearchParams({
        'openid.assoc_handle': searchParams.get('openid.assoc_handle') || '',
        'openid.signed': signed,
        'openid.sig': searchParams.get('openid.sig') || '',
        'openid.ns': 'http://specs.openid.net/auth/2.0',
        'openid.mode': 'check_authentication',
        ...token_params
    })

    token_url.search = token_url_params.toString()

    const token_res = await fetch(token_url, {
        method: 'POST',
        headers: {
            'Accept-language': 'en',
            'Content-type': 'application/x-www-form-urlencoded',
            'Content-Length': `${token_url_params.toString().length}`
        },
        body: token_url_params.toString()
    })

    const result = await token_res.text()

    // https://openid.net/specs/openid-authentication-2_0.html#verifying_signatures
    if (result.match(/is_valid\s*:\s*true/i)) {
        console.log(token_url_params)
        const matches = token_url_params.get('openid.claimed_id')?.match(IDENTIFIER_PATTERN)
        return matches ? matches[1] : null
    }

    return null

}

const getProviderStyle = () => ({
    bg: '#121212',
    text: '#fff',
    bgDark: '#000',
    textDark: '#fff'
})

export default function Steam(req: Request | NextRequest | NextApiRequest, options: SteamProviderOptions): OAuthConfig<SteamUserProfile> {
    // string to url
    const callbackUrl = new URL(options.callbackUrl)
    // http://localhost:3000/
    const realm = callbackUrl.origin
    const returnTo = `${callbackUrl.href}/${PROVIDER_ID}`

    if (!options.clientSecret || options.clientSecret.length < 1) {
        throw new Error(
            "Steam API key is missing"
        )
    }


    return {
        authorization: getAuthorizationParams(returnTo, realm),
        token: {
            async request() {
                if (!req.url) {
                    throw new Error("No URL found in request object")
                }
                // https://stackoverflow.com/questions/53573820/steam-openid-signature-validation orginal reference
                const identifier = await verifyAssertion(req.url)

                if (!identifier) {
                    throw new Error("Unauthenticated")
                }

                return {
                    tokens: new TokenSet({
                        id_token: uuidv4(),
                        access_token: uuidv4(),
                        steamId: identifier
                    })
                }
            }
        },
        userinfo: {
            async request(context) {
                // player info 
                const url = new URL("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002")
                url.searchParams.set("key", context.provider.clientSecret as string)
                url.searchParams.set("steamids", context.tokens.steamId as string)

                const response = await fetch(url)
                const data = await response.json()
                return data.response.players[0]
            }
        },
        id: PROVIDER_ID,
        name: PROVIDER_NAME,
        type: 'oauth',
        idToken: false,
        checks: ['none'],
        clientId: PROVIDER_ID,

        profile(profile: SteamUserProfile) {
            return {
                id: profile.steamid,
                name: profile.personaname,
                image: profile.avatarfull,
                personState: profile.personastate,
                communityVisibilityState: profile.communityvisibilitystate,
                accountCreated: profile.timecreated
            }
        },
        options: options as OAuthUserConfig<SteamUserProfile>,
        style: getProviderStyle()
    }
}

