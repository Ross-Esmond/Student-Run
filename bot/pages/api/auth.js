const {OAuth2Client} = require('google-auth-library');

const port = process.env.PORT || '3000'
let redirect = `http://localhost:${port}/api/callback`
if (process.env.NODE_ENV == "production") {
    redirect = "https://studentrun.chat/api/callback"
}

export const oAuth2Client = new OAuth2Client(
    process.env.GOOGLE_KEY,
    process.env.GOOGLE_SECRET,
    redirect
)

export default function auth(req, res) {
    const authorizeUrl = oAuth2Client.generateAuthUrl({
        scope: 'email',
    })

    res.redirect(307, authorizeUrl)
}
