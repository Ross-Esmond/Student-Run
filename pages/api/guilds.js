import { withIronSessionApiRoute } from "iron-session/next"
const { Sequelize, Model, DataTypes } = require('sequelize')
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './sq.db'
})
const Guild = require('../../models/guild.js')(sequelize, DataTypes)

export default withIronSessionApiRoute(
    async function guilds(req, res) {
        await sequelize.authenticate()
        const guilds = await Guild.findAll()
        if (req.session?.auth !== true) {
            res.status(401).json({})
        } else {
            res.status(200).json(guilds)
        }
    },
    {
        cookieName: "umn-cookie",
        password: process.env.PW,
        cookieOptions: {
            secure: process.env.NODE_ENV === "production",
        }
    }
)

