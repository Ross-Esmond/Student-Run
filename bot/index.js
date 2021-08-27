#!/usr/bin/env node

const { REST } = require('@discordjs/rest')
const { Routes } = require('discord-api-types/v9')
const { Client, Intents, MessageEmbed } = require('discord.js')
const { Sequelize, Model, DataTypes } = require('sequelize')
const Fuse = require('fuse.js')
const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] })
const sequelize = new Sequelize({
    dialect: "sqlite",
    storage: "./sq.db"
})

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
]

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
                    await syncServers(interaction.guild)
                } else {
                    await interaction.reply('Sorry, you must be Verified to use this command.')
                }
            } else {
                await interaction.reply('Something went wrong.')
                console.error(`${interaction.commandName} was sent to ${command} handler.`)
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
            const all = await Class.findAll()
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
        console.log('Started refreshing application (/) commands.');

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
            console.log('sql synced')
        })()

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

async function syncServers (guild) {
    const everyone = guild.roles.cache.find(r => r.name === '@everyone')
    const manager = guild.roles.cache.find(r => r.name.startsWith('Student-Run Bot'))
    const classes = await Class.findAll({ where: { guild: guild.id } })
    const channels = await ClassChannel.findAll({ where: { guild: guild.id } })
    const instructors = await Instructor.findAll({ where: { guild: guild.id } })
    const categories = new Set(Array.from((await guild.channels.fetch()).values())
        .filter(c => c.type === 'GUILD_CATEGORY')
        .map(c => c.name))

    classIndex.set(
        guild.id,
        new Fuse(
            classes.map(({ name, label }) => ({ name, label })),
            {
                keys: ['name', 'label'],
                includeScore: true,
                threshold: 0.5
            }))

    const rolesByName = Array.from((await guild.roles.fetch()).values())
        .reduce((m, r) => { m.set(r.name, r); return m }, new Map())
    let classHeader = rolesByName.get('---------------Classes----------------')
    if (classHeader == null) {
        classHeader = await guild.roles.create({
            name: '---------------Classes----------------',
            color: '#2f3136',
            reasion: 'classes marker didn\'t exist',
            position: manager.position - 1
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

    for (let insr of instructors) {
        const channelName = `${insr.instructor}-${insr['class-name']}`
        if (!existing.has(channelName)) {
            await guild.channels.create(channelName, {
                parent: nextCategories.get(insr['class-name'].toUpperCase())
            })
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
        .find(m => m.content.startsWith('**Class Channel Access**'))
    if (header == null) {
        await registration.send({
            content: '**Class Channel Access**\r\nThe following buttons **toggle** access to a class.'
        })
    }

    for (let level of [1, 2, 3, 4, 5, 8]) {
        const levelClasses = classes
            .map(c => c.name)
            .filter(n => /^[a-z]{2,4}-(\d)\d{3}$/.exec(n)?.[1] === level.toString())
            .sort()
        const title = `**${level}000 Level Courses**`
        const existing = Array.from((await registration.messages.fetch()).values())
            .find(m => m.content.startsWith(title))
        let message = {
            content: title
        }
        if (levelClasses.length !== 0) {
            message.components = levelClasses.reduce((res, c) => {
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

    const removalBar = (await realize(registration.messages))
        .find(m => m.content.startsWith('**Remove Classes**'))
    if (removalBar == null) {
        await registration.send({
            content: '**Remove Classes**\r\n',
            components: [{
                type: 1,
                components: [{
                    type: 2,
                    label: 'Open Dialogue',
                    style: 1,
                    custom_id: 'class_removal'
                }]
            }]
        })
    }
}

async function classCommand (command, interaction, handler) {
    if (interaction.commandName === command) {
        if (interaction.member.roles.cache.some(r => r.name === "Verified")) {
            const name = interaction.options.getString('name')
            if (/^([a-z]){2,4}-\d{4}$/.test(name)) {
                const current = await Class.findAll({ where: { guild: interaction.guild.id, name } })
                await handler(name, current)
                await syncServers(interaction.guild)
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
            .filter(r => /^([a-z]){2,4}-\d{4}$/.test(r.name))
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
                components: [{
                    type: 1,
                    components: memberRolls.map(r => ({
                        type: 2,
                        label: r.name,
                        style: 1,
                        custom_id: `remove_class_${r.id}`
                    }))
                }]
            })
        }
        return
    } else if (interaction.customId.startsWith('remove_class_')) {
        const memberRolls = interaction.member.roles.cache
            .filter(r => /^([a-z]){2,4}-\d{4}$/.test(r.name))
        const target = /^remove_class_(.+)$/.exec(interaction.customId)?.[1]
        await interaction.member.roles.remove(target)
        if (removalReplies.has(interaction.member.id)) {
            const savedReply = removalReplies.get(interaction.member.id)
            await interaction.update({
                content: 'Which classes would you like to hide?',
                components: [{
                    type: 1,
                    components: savedReply[0].map(r => ({
                        type: 2,
                        label: r.name,
                        style: 1,
                        custom_id: `remove_class_${r.id}`,
                        disabled: !memberRolls.some(mr => mr.id === r.id) || target === r.id
                    }))
                }]
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
            await interaction.reply('Spinning up channels.')
            await syncServers(interaction.guild)
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
