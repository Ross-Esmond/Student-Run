#!/usr/bin/env node

const { REST } = require('@discordjs/rest')
const { Routes } = require('discord-api-types/v9')
const { Client, Intents, MessageEmbed } = require('discord.js')
const { Sequelize, Model, DataTypes } = require('sequelize')
const Fuse = require('fuse.js')
const { createLogger, format, transports } = require('winston');
const client = new Client({
    intents: [
        Intents.FLAGS.GUILDS,
        Intents.FLAGS.GUILD_MESSAGES,
        Intents.FLAGS.GUILD_INVITES,
        Intents.FLAGS.GUILD_PRESENCES,
        Intents.FLAGS.GUILD_MEMBERS
    ]
})
const sequelize = new Sequelize({
    dialect: "sqlite",
    storage: "./sq.db"
})
const logger = createLogger({
    level: 'info',
    format: format.combine(
        format.errors({ stack: true }),
        format.json()
    ),
    defaultMeta: { service: 'user-service' },
    transports: [
        new transports.File({ filename: 'error.log', level: 'error' }),
        new transports.File({ filename: 'combined.log' }),
        new transports.Console({ format: format.simple() })
    ]
})

const classRegex = /^[a-zA-Z]{2,4}-\d{4}(H|W|h|w)?$/

let classIndex = new Map()

let commands = [
    {
        name: 'setup-classes',
        description: 'Sets up class channels.',
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
    },
    {
        name: 'enroll',
        description: 'searches for and enrolls you in class',
        options: [
            {
                name: 'in',
                description: 'the text to search for',
                type: 3
            }
        ]
    },
    {
        name: 'invite',
        description: 'creates a new invite'
    }
]

class Invite extends Model {}
Invite.init({
    guild: DataTypes.STRING,
    count: DataTypes.INTEGER,
    code: DataTypes.STRING
}, { sequelize, modelName: 'invite' })

let commandHandlers = new Map()
async function addState (name, attrs) {
    class Class extends Model {}

    const getType = value => {
        if (value === DataTypes.STRING || value.type === DataTypes.STRING) {
            return 'string'
        } else {
            throw 'type not supported'
        }
    }

    const attrTypes = Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, getType(v)]))
    const primaryKey = Object.entries(attrs).find(([k, v]) => v?.primaryKey === true)?.[0]

    let nextCommands = [
        {
            name: `new-${name}`,
            description: `Adds a new ${name}.`,
            options: Object.entries(attrs).map(([key, value]) => ({
                name: key,
                description: `The ${key} value for ${name}.`,
                type: getType(value) === 'string' ? 3 : null,
                required: true
            }))
        },
        {
            name: `forget-${name}`,
            description: `Remove a ${name} from SRC Bot. Channels will not be deleted.`,
            options: Object.entries(attrs).map(([key, value]) => ({
                name: key,
                description: `The ${key} value for ${name}.`,
                type: getType(value) === 'string' ? 3 : null,
                required: true
            }))
        },
        {
            name: `${name}-list`,
            description: `List all ${name} entries.`
        }
    ]

    const isPrimary = attr => attr?.primaryKey === true

    if (Object.values(attrs).some(isPrimary)) {
        nextCommands.push({
            name: `update-${name}`,
            description: `Update the attributes of some ${name}.`,
            options: Object.entries(attrs).map(([key, value]) => {
                if (isPrimary(value)) {
                    return {
                        name: key,
                        description: `The ${name} to change.`,
                        type: getType(value) === 'string' ? 3 : null,
                        required: true
                    }
                } else {
                    return {
                        name: key,
                        description: `Change ${key} for ${name}.`,
                        type: getType(value) === 'string' ? 3 : null
                    }
                }
            })
        })
    }

    commands = commands.concat(nextCommands)

    function generalHandler (command, handler) {
        return async (interaction) => {
            if (interaction.commandName === command) {
                if (interaction.member.permissions.any('ADMINISTRATOR')) {
                    const values = Object.fromEntries(
                        Object.entries(attrTypes).map(([key, type]) => {
                            return [key, interaction.options.getString(key)]
                        })
                        .filter(([key, type]) => type != null))
                    let current
                    if (primaryKey != null) {
                        current = await Class.findAll({ where: {
                            guild: interaction.guild.id,
                            [primaryKey]: values[primaryKey]
                        }})
                    } else {
                        current = await Class.findAll({ where: {
                            guild: interaction.guild.id,
                            ...values
                        }})
                    }
                    await handler(values, current, interaction)
                    try {
                        await syncServers(interaction.guild)
                    } catch (e) {
                        logger.error(e)
                    }
                } else {
                    await interaction.reply('Sorry, you must be Verified to use this command.')
                }
            } else {
                logger.error(`${interaction.commandName} was sent to ${command} handler.`)
            }
        }
    }

    commandHandlers.set(`new-${name}`,
        generalHandler(`new-${name}`,
            async function (inputs, current, interaction) {
                if (current.length !== 0) {
                    await interaction.reply(`${name} already exists.`)
                } else {
                    const next = Class.build({
                        guild: interaction.guild.id,
                        ...inputs
                    })
                    await next.save()
                    await interaction.reply(`Added ${name}.`)
                }
            }))

    commandHandlers.set(`update-${name}`,
        generalHandler(`update-${name}`,
            async function (inputs, current, interaction) {
                if (current.length === 0) {
                    await interaction.reply(`Couldn't find ${name}.`)
                } else {
                    Object.entries(inputs)
                        .forEach(([key, value]) => {
                            current[0][key] = value
                        })
                    current[0].save()
                    await interaction.reply(`Updated ${name}.`)
                }
            }))

    commandHandlers.set(`forget-${name}`,
        generalHandler(`forget-${name}`,
            async function (inputs, current, interaction) {
                if (current.length !== 0) {
                    await current[0].destroy()
                    await interaction.reply(`Removed ${name}.`)
                } else {
                    await interaction.reply(`${name} does not exist.`)
                }
            }))

    commandHandlers.set(`${name}-list`,
        async function (interaction) {
            const all = await Class.findAll({ where: { guild: interaction.guild.id } })
            const tell = all.map(a => a.dataValues).map(d => `[${Object.keys(attrs).map(k => d[k]).join(',')}]`).join(', ')
            await interaction.reply(tell || "None found.")
        })

    Class.init({
        ...attrs,
        guild: DataTypes.STRING
    }, { sequelize, modelName: name })

    return Class
}

let Class
let ClassChannel
let Instructor

async function realize (thang) {
    return Array.from((await thang.fetch()).values())
}

const rest = new REST({ version: '9' }).setToken(process.env.BOT_TOKEN);

(async () => {
    try {
        logger.info('Started refreshing application (/) commands.');

        Class = await addState('class', {
            name: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            label: DataTypes.STRING
        })
        ClassChannel = await addState('class-channel', { name: DataTypes.STRING })
        Instructor = await addState('instructor', { 'class-name': DataTypes.STRING, 'instructor': DataTypes.STRING })

        ;(async () => {
            await sequelize.sync()
            logger.info('sql synced')
        })()

        if (process.env.GUILD_ID) {
            logger.info('Loading commands to specific Guild for development.')
            await rest.put(
                Routes.applicationGuildCommands(process.env.APP_ID, process.env.GUILD_ID),
                { body: commands },
            );
        } else {
            logger.info('Loading commands globally for production.')
            await rest.put(
                Routes.applicationCommands(process.env.APP_ID),
                { body: commands },
            )
        }

        logger.info('Successfully reloaded application (/) commands.');
    } catch (e) {
        logger.error(e)
    }
})()

client.on('inviteCreate', async invite => {
    await Invite.create({
        guild: invite.guild.id,
        code: invite.code,
        count: invite.uses
    })
})

client.on('guildMemberAdd', async member => {
    try {
        await handleNewMember(member)
    } catch (e) {
        logger.error(e)
    }
})
async function handleNewMember (member) {
    const next = await realize(member.guild.invites)
    const prior = await Invite.findAll({ where: { guild: member.guild.id } })

    let candidates = []
    for (const n of next) {
        const p = prior.find(p => p.code === n.code)
        if (p.count === n.uses - 1) {
            candidates.push(n)
        }
    }
    if (candidates.length === 1) {
        const channel = candidates[0].channel
        if (channel.parentId != null) {
            const category = member.guild.channels.cache.get(channel.parentId)
            if (category != null && classRegex.test(category.name)) {
                const role = (await realize(member.guild.roles))
                    .find(r => r.name === category.name.toLowerCase())
                member.roles.add(role)
            }
        }
    }

    checkInvitesLoop()
}

let nextInviteCheck = null
async function checkInvitesLoop () {
    try {
        clearTimeout(nextInviteCheck)

        await checkInvites()
    } catch (e) {
        logger.error(e)
    } finally {
        nextInviteCheck = setTimeout(checkInvitesLoop, 1000*60*5)
    }
}
async function checkInvites () {
    const guilds = await realize(client.guilds)
    let invites = []
    for (let g of guilds) {
        const guild = await g.fetch()
        logger.info(`Checking invites for ${guild.name}.`)
        let gi = await realize(guild.invites)
        invites = invites.concat(gi)
    }

    for (let invite of invites) {
        let saved = await Invite.findOne({
            where: {
                guild: invite.guild.id,
                code: invite.code
            }
        })
        if (saved == null) {
            await Invite.create({
                guild: invite.guild.id,
                code: invite.code,
                count: invite.uses
            })
        } else if (saved.count !== invite.uses) {
            saved.count = invite.uses
            await saved.save()
        }
    }
}

client.on('ready', () => {
    logger.info(`Logged in as ${client.user.tag}!`);
    checkInvitesLoop()
})

async function getChannels (guild) {
    return Array.from((await guild.channels.fetch()).values())
}

function buildButtons (descriptions) {
    return descriptions.reduce((res, desc) => {
        if (res[res.length - 1].components.length === 5) {
            res.push({
                type: 1,
                components: []
            })
        }
        res[res.length - 1].components.push({
            type: 2,
            label: desc.label,
            style: desc.style,
            custom_id: desc.id,
            disabled: desc.disabled
        })
        return res
    }, [{ type: 1, components: [] }])
}

async function syncServers (guild, interaction = null) {
    let loglist = ''
    const log = string => {
        loglist += `${string}...\r\n`
        interaction != null ? interaction.editReply(loglist) : Promise.resolve()
    }

    try {
        await runSyncServers(guild, log)
    } catch (e) {
        logger.error(e)
        await log(`ERROR: ${e.message}`)
        throw e
    }
}

async function runSyncServers (guild, log) {
    const everyone = guild.roles.cache.find(r => r.name === '@everyone')
    const manager = guild.roles.cache.find(r => r.name.startsWith('Student-Run Bot'))
    await log('looking for classes')
    const classes = await Class.findAll({ where: { guild: guild.id } })
    await log('looking for channels')
    const channels = await ClassChannel.findAll({ where: { guild: guild.id } })
    await log('looking for instructors')
    const instructors = await Instructor.findAll({ where: { guild: guild.id } })
    await log('fetching guild categories')
    const categories = new Set(Array.from((await guild.channels.fetch()).values())
        .filter(c => c.type === 'GUILD_CATEGORY')
        .map(c => c.name))

    await log('creating search index')
    classIndex.set(
        guild.id,
        new Fuse(
            classes.map(({ name, label }) => ({ name, label })),
            {
                keys: ['name', 'label'],
                includeScore: true,
                threshold: 0.5
            }))

    await log('fetching guild roles')
    const rolesByName = Array.from((await guild.roles.fetch()).values())
        .reduce((m, r) => { m.set(r.name, r); return m }, new Map())
    let classHeader = rolesByName.get('---------------Classes----------------')
    if (classHeader == null) {
        await log('creating class header')
        classHeader = await guild.roles.create({
            name: '---------------Classes----------------',
            color: '#2f3136',
            reasion: 'classes marker didn\'t exist',
            position: manager.position - 1
        })
    }
    await log('creating class roles')
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
        .reduce(
            (m, r) => {
                if (m.has(r.name)) throw new Error(`Multiple ${r.name} role found.`)
                m.set(r.name, r); return m
            },
            new Map())
    const sortedClasses = classes.map(c => c.name).sort().reverse()
    let pos = classHeader.position
    await log('sorting class roles')
    for (let className of sortedClasses) {
        try {
            await postRolesByName.get(className).setPosition(pos - 1)
        } catch (e) {
            // wrong roll position
        }
    }

    await log('creating class categories')
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
                    },
                    {
                        id: manager,
                        allow: ['MANAGE_CHANNELS']
                    },
                    {
                        id: manager,
                        allow: ['VIEW_CHANNEL']
                    }
                ]
            })
        }
    }

    const existing = new Set((await getChannels(guild)).map(c => c.name))
    const nextCategories = Array.from((await guild.channels.fetch()).values())
        .reduce((map, obj) => map.set(obj.name, obj), new Map())

    await log('creating class channels')
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

    await log('creating instructor channels')
    for (let insr of instructors) {
        const channelName = `${insr.instructor}-${insr['class-name']}`
        if (!existing.has(channelName)) {
            await guild.channels.create(channelName, {
                parent: nextCategories.get(insr['class-name'].toUpperCase())
            })
        }
    }

    await log('fetching class-registration channel')
    let registration = (await getChannels(guild)).find(c => c.name === 'class-registration')
    if (registration == null) {
        await log('creating class-registration channel')
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

    await log('posting class-registration comments')
    const header = Array.from((await registration.messages.fetch()).values())
        .find(m => m.content.startsWith('**Class Channel Access**'))
    if (header == null) {
        await registration.send({
            content: '**Class Channel Access**\r\nThe following buttons **toggle** access to a class.'
        })
    }

    for (let level of [1, 2, 3, 4, 5, 8]) {
        const levelClasses = classes
            .map(c => [c.name, c.label])
            .filter(([n, _]) => /^[a-z]{2,4}-(\d)\d{3}(W|H|w|h)?$/.exec(n)?.[1] === level.toString())
            .sort(([a], [b]) => (a < b) ? -1 : 1)
        const title = `**${level}000 Level Courses**`
        const existing = Array.from((await registration.messages.fetch()).values())
            .find(m => m.content.startsWith(title))
        let message = {
            content: `${title}\r\n${levelClasses.map(([l, r]) => `${l}: ${r}`).join('\r\n')}`
        }
        if (levelClasses.length !== 0) {
            message.components = buildButtons(levelClasses.map(([c, _]) => {
                const count = rolesByName.get(c)?.members.size
                return {
                    label: `${count !== 0 ? `[ ${count} ] ` : ``}${c.toUpperCase()}`,
                    style: 2,
                    id: c
                }
            }))
        }
        if (existing == null) {
            await registration.send(message)
        } else {
            await existing.edit(message)
        }
    }

    const removalBar = (await realize(registration.messages))
        .find(m => m.content.startsWith('**Remove Classes**'))
    if (removalBar == null) {
        await registration.send({
            content: '**Remove Classes**\r\n',
            components: [{
                type: 1,
                components: [{
                    type: 2,
                    label: 'Select Classes to Remove',
                    style: 2,
                    custom_id: 'class_removal'
                }]
            }]
        })
    }
}

async function classCommand (command, interaction, handler) {
    if (interaction.commandName === command) {
        if (interaction.member.roles.cache.some(r => r.name === "Verified")) {
            const name = interaction.options.getString('name').toLowerCase()
            if (classRegex.test(name)) {
                const current = await Class.findAll({ where: { guild: interaction.guild.id, name } })
                await handler(name, current)
                try {
                    await syncServers(interaction.guild)
                } catch (e) {
                    logger.error(e)
                }
            } else {
                await interaction.reply('Class must be formatted like subj-1234.')
            }
        } else {
            await interaction.reply('Sorry, you must be Verified to use this command.')
        }
    }
}

let removalReplies = new Map()

async function handleButtonInteraction (interaction) {
    if (interaction.customId === 'class_removal') {
        const memberRolls = interaction.member.roles.cache
            .filter(r => classRegex.test(r.name))
        if (Array.from(memberRolls).length === 0) {
            await interaction.reply({
                content: 'You\'re not in any classes dingaling.',
                ephemeral: true
            })
        } else {
            removalReplies.set(
                interaction.member.id, [ memberRolls, interaction ])
            await interaction.reply({
                content: 'Which classes would you like to hide?',
                ephemeral: true,
                components: buildButtons(memberRolls.map(r => ({
                    label: r.name,
                    style: 1,
                    id: `remove_class_${r.id}`
                })))
            })
        }
        return
    } else if (interaction.customId.startsWith('remove_class_')) {
        const memberRolls = interaction.member.roles.cache
            .filter(r => classRegex.test(r.name))
        const target = /^remove_class_(.+)$/.exec(interaction.customId)?.[1]
        await interaction.member.roles.remove(target)
        if (removalReplies.has(interaction.member.id)) {
            const savedReply = removalReplies.get(interaction.member.id)
            await interaction.update({
                content: 'Which classes would you like to hide?',
                components: buildButtons(savedReply[0].map(r => ({
                    label: r.name,
                    style: 1,
                    id: `remove_class_${r.id}`,
                    disabled: !memberRolls.some(mr => mr.id === r.id) || target === r.id
                })))
            })
        } else {
            await interaction.reply({
                content: `You have been removed from the class.`,
                ephemeral: true
            })
        }
        return
    }

    const role = (await realize(interaction.guild.roles))
        .find(r => r.name === interaction.customId)

    if (role != null) {
        const hasRole = interaction.member.roles.cache.has(role.id)
        if (hasRole) {
            try {
                await interaction.member.roles.remove(role)
                await interaction.reply({
                    content: `You have been removed from ${role.name}.`,
                    ephemeral: true
                })
            } catch (er) {
                await interaction.reply({
                    content: `Failed to remove you from ${role.name}. Likely due to a misplaced Student-Run Bot role.`,
                    ephemeral: true
                })
            }
        } else {
            try {
                await interaction.member.roles.add(role)
                await interaction.reply({
                    content: `Welcome to ${role.name}.`,
                    ephemeral: true
                })
            } catch (er) {
                await interaction.reply({
                    content: `Failed to add you to ${role.name}. Likely due to a misplaced Student-Run Bot role.`,
                    ephemeral: true
                })
            }
        }
    } else {
        await interaction.reply({
            content: `There was no ${role.name}. How weird...`,
            ephemeral: true
        })
    }
}

client.on('interactionCreate', async interaction => {
    try {
        return await interactionHandler(interaction)
    } catch (e) {
        logger.error(e)
    }
})
async function interactionHandler (interaction) {
    if (interaction.isButton()) return await handleButtonInteraction(interaction)

    if (!interaction.isCommand()) return;

    if (commandHandlers.has(interaction.commandName)) {
        await commandHandlers.get(interaction.commandName)(interaction)
    }

    if (interaction.commandName === 'enroll') {
        if (classIndex.has(interaction.guildId)) {
            const results = classIndex.get(interaction.guildId)
                .search(interaction.options.getString('in'))
            const firstScore = results[0].score
            const qualityResults = results.filter(r => ((r.score/firstScore) < 1000))
            const display = qualityResults.map(r => [r.item.name, r.item.label])
            if (display.length === 0) {
                interaction.reply({
                    content: `Couldn't find a match.`,
                    ephemeral: true
                })
            } else {
                if (display.length === 1) {
                    const role = (await realize(interaction.guild.roles)).find(r => r.name === display[0][0])
                    await interaction.member.roles.add(role)
                    interaction.reply({
                        content: `You are now enrolled in **${display[0][0]}: ${display[0][1]}**`,
                        ephemeral: true,
                        components: [{
                            type: 1,
                            components: [{
                                type: 2,
                                label: 'undo',
                                style: 1,
                                custom_id: `remove_class_${role.id}`
                            }]
                        }]
                    })
                } else {
                    interaction.reply({
                        content: `I found ${display.length} results. ${display.length > 5 ? ' Showing top five.' : ''}`,
                        ephemeral: true,
                        components: display.slice(0, 5).map(([l, r]) => ({
                            type: 1,
                            components: [{
                                type: 2,
                                label: `${l}: ${r}`,
                                style: 1,
                                custom_id: l
                            }]
                        }))
                    })
                }
            }
        } else {
            await interaction.reply({
                content: 'Sorry, classes are not set up at the moment.',
                ephemeral: true
            })
        }
    }

    if (interaction.commandName === 'setup-classes') {
        if (interaction.member.permissions.any('MANAGE_CHANNELS')) {
            await interaction.deferReply()
            try {
                await syncServers(interaction.guild, interaction)
                await interaction.editReply('Classes are ready.')
            } catch (e) {
                await interaction.followUp('Class setup failed.')
            }
        }
    }

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
                        logger.error(e)
                    }
                }
            } else {
                await interaction.reply(`If run with commit:True, I would delete ${emptyRoles.map(r => r.name).join(', ')}.`)
            }
        }
    }

    if (interaction.commandName === 'invite') {
        const parentId = interaction.channel.parentId
        let parent = null
        if (parentId != null) {
            parent = interaction.guild.channels.cache.get(parentId)
        }
        if (parent != null && classRegex.test(parent.name)) {
            const invite = await interaction.guild.invites.create(
                interaction.channel,
                {
                    maxAge: 0,
                    unique: true
                })
            await interaction.reply(`
                Here's your invite!\r\n> ${invite.url}\r\nUsers who join with this invite will automatically be able to see channels for ${parent.name}.`)
        } else {
            const invite = await interaction.guild.invites.create(
                interaction.channel,
                {
                    maxAge: 0,
                    unique: true
                })
            await interaction.reply({
                content: `
                    Here's your invite!\r\n> ${invite.url}\r\nIf this invite is intended to be shared with a class, you should consider running \`/invite\` from a class channel. That way the invite will automatically give users permission to see those channels.`,
                ephemeral: true
            })
        }
    }
}

client.login(process.env.BOT_TOKEN)
