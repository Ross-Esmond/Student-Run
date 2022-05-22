'use strict';
const {
    Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
    class Guild extends Model { }
    Guild.init({
        link: DataTypes.STRING,
        name: DataTypes.STRING,
        server_id: DataTypes.STRING,
        icon_hash: DataTypes.STRING,
        range: DataTypes.STRING
    }, {
        sequelize,
        modelName: 'Guild',
        timestamps: false
    });
    return Guild;
};
