# Student-Run Software

This repository contains two distinct but related pieces of software: 1) a
server for hosting https://studentrun.chat, 2) a bot to help administrate
class-discord servers.

## The Student-Run Discord Bot

The SR Bot may be used to set up role-based class channels. There are two
pieces of state that work together to this end. The first is a `class`, which
consists of a name, like math-1271, a label, like Calculus 1, and a unicode
emoji, like 📕. Each class will get its own listing and enrollment button in a
\#class-registration channel that the bot will create, but will not immediately
receive any channels. In order to give classes any channels, you must add
class-channels–the second piece of state. A class-channel simply has a prefix
for a channel to add for every class that you've added. So a "general"
class-channel, when combined with the calculus class from before, would create
a general-math-1271 channel under the MATH-1271 category. Both of these pieces
of state may be configured with similar commands: `/new-class`,
`/forget-class`, and `/class-list` may be used to add, remove, and list classes
respectively, and the corrisponding commands for class-channels are
`/new-class-channel`, `/forget-class-channel`, and `/class-channel-list`.

### Adding channels

Running `new-class` or `new-class-channel` will no immediately create class
channels or the class-registration channel. Once you are happy with the enties
you've made to the system, you must run `/setup-classes` to trigger channel
creation. This will do many things, which will be logged to a comment as they
happen:
* The bot will create a `---classes---` role, if it does not exist.
* The bot will create a class search index, for the `/enroll in:search` command.
* The bot will create roles for every class, if they do not exist.
* The bot will sort the roles.
* The bot will check for class categories and channels.
  * Any categories or channels that do not exist will be created.
  * Any category that exists will have its permissions updated to only be visible to the class role.
* The bot will create a class-registration page, which will initially be private.

### Removing channels

The `/forget-...` commands were named intentionally. Forgetting a class or
class-channel does not delete the respective channels; it only removes those
entries from class-registration (upon the next `/setup-channels`) and keeps SR
Bot from ever creating those channels again. If you want to be rid of the
channels, you can either manually delete them, or try running the `/clean`
command. The base `/clean` command will list all empty channels on the server,
and running `/clean commit:TRUE` will delete those empty channels and empty
categories. An empty channel has no comments, and an empty category has no
channels. **Student-Run Bot will never delete a channel with a comment.** You
must always remove those channels yourself, but `/clean` may still be used to
clean up generated channels if a mistake was made. If after running `/clean`
you find that you would like to keep an empty channel that was detected, you
may post a filler comment to protect it. Remember that if you believe that
clean may have accidentally deleted a channel, you may use discords server
audit page to check. Since the channel was empty, it may be recreated without a
permanent loss.

### Instructor channels

A similar set of commands may be used to create `instructors`. Instructors have
a name and a class for which they are associated. During channel setup, any
instructor will result in one more channel named after the instructor under the
class category. So an instructor named hejhal under math-4567, will create a
hejhal-math-4567 channel.

### Invites and Invite Campaigns

The best feature of Student-Run Bot is that any user who joins the server using
an invite poining to a class-specific channel, will automatically be given the
necessary role to see that channel. This allows users to invite their
classmates directly to the class channels, but only if the invite is correctly
configured. We provide two commands to help with this process—one for
administrators, and one for users.

The `/invite-campaign` command may be used to send a message with an invite
link to one channel in every class. The command takes two options: `content`,
and a `channel` to target. The `channel` is a `class-channel`, like "general",
which will target the general channel under each class category. The
`/invite-campaign` will **not** launch immediately. Instead, a *private*
dialogue will appear with an example of what the message will look like, and a
button to launch the campaign. Only you may trigger the campaign, and if you
find that you do not like the message, you may dismiss the dialogue. The
`content` option is a template which will replace the required text "{invite}"
with a unique, permanent invite to the respective class channel. You may also
use the "{class}" string to add the class name and label to the content.

The `/invite` command may be used by any user to create a unique, permanent
invite to the channel in which it was used. If used from a class channel, the
response will inform the user that invitee's will gain direct access to those
channels, but if used from any other channel, the response will encourage the
user to target a class channel if they intend to share the link with a class.
In either case, the response will be "ephemeral", which means that only those
users will see it. No other user will be aware that the command was triggered.

### All commands

#### state commands
For each of `class`, `class-channel`, and `instructor`, there are `/new-...`,
`/forget-...`, and `/...-list` commands. There is also an `/update-class`
command, which will update a classes label or emoji based on the class's name.

#### extranious commands
| Command                  | Result                                                                                                                     | Accessible by any user |
|--------------------------|----------------------------------------------------------------------------------------------------------------------------|------------------------|
| /setup-classes           | Creates class channels and class-registration channel                                                                      |                        |
| /clean                   | Lists empty channels                                                                                                       |                        |
| /clean commit:True       | Deletes empty channels and categories                                                                                      |                        |
| /clean-roles             | Lists unassigned roles                                                                                                     |                        |
| /clean-roles commit:True | Delete unassigned roles                                                                                                    |                        |
| /enroll in:*some class*  | Searches for and enrolls the user in *some class*. Lists top five options in a button modal if multiple results are found. | Yes                    |
| /invite                  | Generates a unique, permanent invite to the current channel.                                                               | Yes                    |
| /invite-campaign         | Used to send a message with an invite to one channel for every class. (after a confirmation dialogue)                      |                        |

