'use strict';

module.exports = {
    async up (queryInterface, Sequelize) {
        const transaction = await queryInterface.sequelize.transaction()
        try {
            await queryInterface.renameTable('guilds', 'guilds_old', { transaction })
            
            await queryInterface.createTable('Guilds', {
                id: {
                    allowNull: false,
                    autoIncrement: true,
                    primaryKey: true,
                    type: Sequelize.INTEGER
                },
                server_id: {
                    type: Sequelize.STRING,
                },
                link: {
                    type: Sequelize.STRING
                },
                name: {
                    type: Sequelize.STRING
                },
                icon_hash: {
                    type: Sequelize.STRING
                },
                range: {
                    type: Sequelize.STRING
                }
            }, {
                transaction
            });

            const [result] = await queryInterface.sequelize.query(`SELECT * FROM guilds_old;`, { transaction })

            const insertions = result.filter(r => r.link != null).map(g => ({
                link: g.link,
                name: g.name,
                server_id: g.server_id,
                icon_hash: g.icon_hash,
                range: g.range
            }))

            await queryInterface.bulkInsert('Guilds', insertions, {
                transaction
            })

            await transaction.commit()
        } catch (err) {
            await transaction.rollback()
            throw err
        }
    },

    async down (queryInterface, Sequelize) {
        const transaction = await queryInterface.sequelize.transaction()
        try {
            await queryInterface.dropTable('Guilds')

            await queryInterface.renameTable('guilds_old', 'guilds', { transaction })

            await transaction.commit()
        } catch (err) {
            await transaction.rollback()
            throw err
        }
    }
};
