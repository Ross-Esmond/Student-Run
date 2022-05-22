import { withIronSessionApiRoute } from "iron-session/next";

export default withIronSessionApiRoute(
    async function profile(req, res) {
        if (req.session?.auth === true) {
            res.status(200).json(true)
        } else {
            res.status(200).json(false)
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
