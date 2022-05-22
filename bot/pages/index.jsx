import { useState, useEffect } from 'react'
import Head from 'next/head'
import Image from 'next/image'

export default function HomePage() {
    const [auth, setAuth] = useState(false)
    const [guilds, setGuilds] = useState([])

    // Google Analytics
    useEffect(() => {
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());

        gtag('config', 'G-BWBBPZNYGL');
    }, [])

    useEffect(() => {
        async function getProfile() {
            try {
                const res = await fetch("/api/profile")
                const auth = await res.json()
                if (auth) {
                    setAuth(true)
                }
                const guildRes = await fetch("/api/guilds")
                const guilds = await guildRes.json()
                setGuilds(guilds)
            } catch (err) {
                console.error(err)
            }
        }

        getProfile()
    }, [])

    return (
        <div>
            <Head>
                <title>UMN Class Discords</title>
                <meta name="description" content="A list of student-run discord servers for classes at the UMN." />
                <script async src="https://www.googletagmanager.com/gtag/js?id=G-BWBBPZNYGL"></script>
            </Head>
            <header><div>Student-Run Discord Class Servers at the UMN</div></header>
            <main>
                <p>Log in with your UMN email to access the servers.</p>
                <p>If you have a UMN Discord Class Server and would like to be hosted on the site please
                    fill out <a href="https://forms.gle/v8mf3fR3yU4F7CfR7">this form.</a></p>
                <p>If you want to be considered for an Admin or Co-owner position on existing Class Servers
                    please fill out <a href="https://forms.gle/q2VbMeXCtTF5rjzF6">this form.</a></p>
                <p>If you are interested in being an officer of Student Run Connections, the Student
                    Group managing this site, please see <a href="https://forms.gle/aNtGRLy9tsWMJh71A">this form</a>&nbsp;
                    for more information.</p>
                <div className="auth-holder">
                    <a href="/api/auth"><Image src="/google_small.png" alt="Google sign in" width="191" height="46" /></a>
                    <div id="auth" className={auth ? 'yes' : ''}></div>
                </div>
                <p>The servers provided have agreed to host channels for the classes specified.
                    If you cannot find a channel for the class you are taking, you may request it in the
                    respective Class Server, and it will be added.</p>
                <div id="guilds">
                    {guilds.map(guild => (
                        <div>
                            <a key={guild.server_id} className="discord-invite" href={guild.link} target="_blank">
                                <img src={`https://cdn.discordapp.com/icons/${guild.server_id}/${guild.icon_hash}.png?size=64`} />
                                <div> <span className="title">{guild.name}</span> <br/> {guild.range} </div>
                            </a>
                        </div>
                    ))}
                </div>
            </main>
        </div>
    )
}
