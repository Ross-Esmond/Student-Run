import { withIronSessionApiRoute } from "iron-session/next";
const { oAuth2Client } = require('./auth.js')
const { google } = require('googleapis')

export default withIronSessionApiRoute(
    async function callback(req, res) {
        try {
            const code = req.query.code
            const r = await oAuth2Client.getToken(code)
            oAuth2Client.setCredentials(r.tokens)

            var oauth2 = google.oauth2({
                auth: oAuth2Client,
                version: 'v2'
            });
            await new Promise((resolve, reject) => {
                oauth2.userinfo.get(
                    (e, { data }) => {
                        if (e) {
                            reject(e)
                        } else {
                            const email = data.email
                            if (/umn.edu$/.test(email)) {
                                req.session.auth = true
                                req.session.save()
                                    .then(() => {
                                        res.redirect('/')
                                        resolve()
                                    })
                            }
                        }
                    });
            })

        } catch (err) {
            throw err
        }
    },
    {
        cookieName: "umn-cookie",
        password: process.env.PW,
        cookieOptions: {
            secure: process.env.NODE_ENV === "production",
        },
    }
)
