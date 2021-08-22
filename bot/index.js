const { REST } = require('@discordjs/rest')
const { Routes } = require('discord-api-types/v9')
const { Client, Intents, MessageEmbed } = require('discord.js')
const { Sequelize, Model, DataTypes } = require('sequelize')
const client = new Client({ intents: [Intents.FLAGS.GUILDS] })
const sequelize = new Sequelize({
    dialect: "sqlite",
    storage: "./sq.db"
})

class Class extends Model {}
Class.init({
    name: DataTypes.STRING,
    guild: DataTypes.STRING
}, { sequelize, modelName: 'class' })
class ClassChannel extends Model {}
ClassChannel.init({
    name: DataTypes.STRING,
    guild: DataTypes.STRING
}, { sequelize, modelName: 'class-channel' })

;(async () => {
    await sequelize.sync()
    console.log('sql synced')
})()

const commands = [
    {
        name: 'new-class',
        description: '`/new-class stat-3011` adds a new stat class',
        options: [
            {
                name: 'name',
                description: 'In the form of `math-1001`',
                type: 3,
                required: true
            }
        ]
    },
    {
        name: 'forget-class',
        description: 'class-manager will stop managing class channels',
        options: [
            {
                name: 'name',
                description: 'In the form of `math-1001`',
                type: 3,
                required: true
            }
        ]
    },
    {
        name: 'setup-classes',
        description: 'Sets up class channels.',
    },
    {
        name: 'new-class-channel',
        description: 'adds a new channel to every class category',
        options: [
            {
                name: 'name',
                description: 'The name of the channel: `hw-help`',
                type: 3,
                required: true
            }
        ]
    },
    {
        name: 'forget-class-channel',
        description: 'forgets a class channel',
        options: [
            {
                name: 'name',
                description: 'The name of the channel: `hw-help`',
                type: 3,
                required: true
            }
        ]
    },
    {
        name: 'clean',
        description: 'deletes empty channels',
        options: [
            {
                name: 'commit',
                description: 'WARNING: actually delete the channels.',
                type: 5
            }
        ]
    },
    {
        name: 'clean-roles',
        description: 'deletes unused roles',
        options: [
            {
                name: 'commit',
                description: 'WARNING: actually delete the roles.',
                type: 5
            }
        ]
    }]

async function realize (thang) {
    return Array.from((await thang.fetch()).values())
}

const rest = new REST({ version: '9' }).setToken(process.env.BOT_TOKEN);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        if (process.env.GUILD_ID) {
            console.log('Loading commands to specific Guild for development.')
            await rest.put(
                Routes.applicationGuildCommands(process.env.APP_ID, process.env.GUILD_ID),
                { body: commands },
            );
        } else {
            console.log('Loading commands globally for production.')
            await rest.put(
                Routes.applicationCommands(process.env.APP_ID),
                { body: commands },
            )
        }

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})()

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
})

async function getChannels (guild) {
    return Array.from((await guild.channels.fetch()).values())
}

async function syncChannels (guild) {
    const everyone = guild.roles.cache.find(r => r.name === '@everyone')
    const manager = guild.roles.cache.find(r => r.name === 'Student-Run Bot')
    const classes = await Class.findAll({ where: { guild: guild.id } })
    const channels = await ClassChannel.findAll({ where: { guild: guild.id } })
    const categories = new Set(Array.from((await guild.channels.fetch()).values())
        .filter(c => c.type === 'GUILD_CATEGORY')
        .map(c => c.name))

    const rolesByName = Array.from((await guild.roles.fetch()).values())
        .reduce((m, r) => { m.set(r.name, r); return m }, new Map())
    const classHeader = rolesByName.get('---------------Classes----------------')
    if (classHeader == null) {
        classHeader = await guild.roles.create({
            name: '---------------Classes----------------',
            color: '#2f3136',
            reasion: 'classes marker didn\'t exist'
        })
    }
    for (let myClass of classes) {
        let role = rolesByName.get(myClass.name)
        if (role == null) {
            role = await guild.roles.create({
                name: myClass.name,
                reasion: 'Class role didn\'t exist.'
            })
        }
    }
    const postRolesByName = Array.from((await guild.roles.fetch()).values())
        .reduce((m, r) => { m.set(r.name, r); return m }, new Map())
    const sortedClasses = classes.map(c => c.name).sort().reverse()
    let pos = classHeader.position
    for (let className of sortedClasses) {
        try {
            await postRolesByName.get(className).setPosition(pos - 1)
        } catch (e) {
            // wrong roll position
        }
    }

    for (let myClass of classes) {
        const allCap = myClass.name.toUpperCase()
        if (!categories.has(allCap)) {
            const cat = await guild.channels.create(allCap, {
                type: 'GUILD_CATEGORY',
                permissionOverwrites: [
                    {
                        id: everyone,
                        deny: ['VIEW_CHANNEL']
                    },
                    {
                        id: postRolesByName.get(myClass.name),
                        allow: ['VIEW_CHANNEL']
                    }
                ]
            })
        }
    }

    const existing = new Set((await getChannels(guild)).map(c => c.name))
    const nextCategories = Array.from((await guild.channels.fetch()).values())
        .reduce((map, obj) => map.set(obj.name, obj), new Map())

    for (let myClass of classes) {
        for (let channel of channels) {
            const channelName = `${channel.name}-${myClass.name}`
            if (!existing.has(channelName)) {
                const ch = await guild.channels.create(channelName, {
                    parent: nextCategories.get(myClass.name.toUpperCase())
                })
            }
        }
    }

    let registration = (await getChannels(guild)).find(c => c.name === 'class-registration')
    if (registration == null) {
        registration = await guild.channels.create('class-registration', {
            permissionOverwrites: [
                {
                    id: everyone.id,
                    deny: ['SEND_MESSAGES']
                },
                {
                    id: manager.id,
                    allow: ['SEND_MESSAGES']
                }
            ]
        })
    }

    const colorGen = (function* () {
        while (true) {
            yield '#6A0606'
            yield '#E6B60A'
        }
    })()


    const header = Array.from((await registration.messages.fetch()).values())
        .find(m => m.embeds?.[0]?.title === 'Class Channel Access')
    if (header == null) {
        const embed = new MessageEmbed()
            .setColor(colorGen.next().value)
            .setTitle('Class Channel Access')
            .setDescription('React to the following in order to gain access to class channels!')
        await registration.send({
            embeds: [embed]
        })
    }

    for (let level of [1, 2, 3, 4, 5, 8]) {
        const levelClasses = classes
            .map(c => c.name)
            .filter(n => /^[a-z]{4}-(\d)\d{3}$/.exec(n)?.[1] === level.toString())
            .sort()
        if (levelClasses.length !== 0) {
            const title = `**${level}000 Level Courses**`
            const existing = Array.from((await registration.messages.fetch()).values())
                .find(m => m.content.startsWith(title))
            const message = {
                content: title,
                components: levelClasses.reduce((res, c) => {
                    if (res[res.length - 1].components.length === 5) {
                        res.push({
                            type: 1,
                            components: []
                        })
                    }
                    res[res.length - 1].components.push({
                        type: 2,
                        label: c.toUpperCase(),
                        style: 1,
                        custom_id: c
                    })
                    return res
                }, [{ type: 1, components: [] }])
            }
            if (existing == null) {
                await registration.send(message)
            } else {
                await existing.edit(message)
            }
        }
    }
}

async function classCommand (command, interaction, handler) {
    if (interaction.commandName === command) {
        if (interaction.member.roles.cache.some(r => r.name === "Verified")) {
            const name = interaction.options.getString('name')
            if (/^([a-z]){4}-\d{4}$/.test(name)) {
                const current = await Class.findAll({ where: { guild: interaction.guild.id, name } })
                await handler(name, current)
                await syncChannels(interaction.guild)
            } else {
                await interaction.reply('Class must be formatted like subj-1234.')
            }
        } else {
            await interaction.reply('Sorry, you must be Verified to use this command.')
        }
    }
}

async function handleButtonInteraction (interaction) {
    const role = (await realize(interaction.guild.roles))
        .find(r => r.name === interaction.customId)

    if (role != null) {
        const hasRole = interaction.member.roles.cache.has(role.id)
        if (hasRole) {
            await interaction.member.roles.remove(role)
            await interaction.reply({
                content: `You have been removed from ${role.name}.`,
                ephemeral: true
            })
        } else {
            await interaction.member.roles.add(role)
            await interaction.reply({
                content: `Welcome to ${role.name}.`,
                ephemeral: true
            })
        }
    } else {
        await interaction.reply({
            content: `There was no ${role.name}. How weird...`,
            ephemeral: true
        })
    }
}

client.on('interactionCreate', async interaction => {
    if (interaction.isButton()) return await handleButtonInteraction(interaction)

    if (!interaction.isCommand()) return;

    if (interaction.commandName === 'setup-classes') {
        if (interaction.member.permissions.any('MANAGE_CHANNELS')) {
            await interaction.reply('Spinning up channels.')
            await syncChannels(interaction.guild)
        }
    }

    if (interaction.commandName === 'new-class-channel') {
        if (interaction.member.permissions.any('MANAGE_CHANNELS')) {
            const name = interaction.options.getString('name')
            const current = await ClassChannel.findAll({ where: { guild: interaction.guild.id, name } })
            if (current.length !== 0) {
                await interaction.reply(`The channel ${name} already exists.`)
            } else {
                await interaction.reply(`Adding ${name} channel to all classes.`)

                const nextChannel = ClassChannel.build({ name, guild: interaction.guild.id })
                await nextChannel.save()

                await syncChannels(interaction.guild)
            }
        }
    }

    if (interaction.commandName === 'forget-class-channel') {
        if (interaction.member.permissions.any('MANAGE_CHANNELS')) {
            const name = interaction.options.getString('name')
            const current = await ClassChannel.findAll({ where: { guild: interaction.guild.id, name } })
            if (current.length !== 0) {
                await interaction.reply(`${name} who?`)
                await current[0].destroy()
            } else {
                await interaction.reply(`${name} is not currently a class channel.`)
            }
        }
    }

    await classCommand('new-class', interaction, async (name, current) => {
        if (current.length !== 0) {
            await interaction.reply(`${name} already exists.`)
        } else {
            await interaction.reply('Coming right up!')

            const nextClass = Class.build({ name: interaction.options.getString('name'), guild: interaction.guild.id })
            await nextClass.save()
        }
    })

    await classCommand('forget-class', interaction, async (name, current) => {
        if (current.length === 0) {
            await interaction.reply(`${name} does not exist.`)
        } else {
            await interaction.reply(`${name} who?`)

            await current[0].destroy()
        }
    })

    if (interaction.commandName === 'clean') {
        if (interaction.member.permissions.any('MANAGE_CHANNELS')) {
            const channels = Array.from((await interaction.guild.channels.fetch()).values())
                .filter(c => c.type === 'GUILD_TEXT')
                .filter(c => c.lastMessageId === null)

            const deletions = channels.length ? channels.map(c => c.name).join(', ') : 'empty categories'

            if (interaction.options.getBoolean('commit')) {
                await interaction.reply(`Deleting ${deletions}.`)
                for (let ch of channels) {
                    await ch.delete('Clean command was run.')
                }
                const nextChannels = Array.from((await interaction.guild.channels.fetch()).values())
                const keep = new Set(nextChannels.filter(c => c.parentId != null).map(c => c.parentId))
                const removal = nextChannels.filter(c => c.type === 'GUILD_CATEGORY').filter(c => !keep.has(c.id))
                for (let ch of removal) {
                    await ch.delete('Clean command was run.')
                }
            } else {
                await interaction.reply(`If run with commit:True, I would delete ${deletions}.`)
            }
        }
    }

    if (interaction.commandName === 'clean-roles') {
        if (interaction.member.permissions.any('MANAGE_ROLES')) {
            const emptyRoles = (await realize(interaction.guild.roles))
                .filter(r => Array.from(r.members.values()).length === 0)
            if (interaction.options.getBoolean('commit')) {
                await interaction.reply(`Deleting ${emptyRoles.map(r => r.name).join(', ')}.`)
                for (let r of emptyRoles) {
                    try {
                        await r.delete()
                    } catch (e) {
                        console.log(e)
                    }
                }
            } else {
                await interaction.reply(`If run with commit:True, I would delete ${emptyRoles.map(r => r.name).join(', ')}.`)
            }
        }
    }
})

client.login(process.env.BOT_TOKEN)
