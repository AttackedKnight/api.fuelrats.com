import { FrontierRedeemCode } from '../classes/Validators'

const decalNotesMaxLength = 4096

module.exports = function (sequelize, DataTypes) {
  const decal = sequelize.define('Decal', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
      validate: {
        isUUID: 4
      }
    },
    code: {
      type: DataTypes.STRING,
      allowNull: false,
      require: true,
      validate: {
        is: FrontierRedeemCode
      }
    },
    type:  {
      type: DataTypes.ENUM('Rescues', 'Promotional', 'Special'),
      allowNull: false,
      validate: {
        isIn: [['Rescues', 'Promotional', 'Special']]
      }
    },
    claimedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        defaultValue: '',
        len: [0, decalNotesMaxLength]
      }
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      validate: {
        isUUID: 4
      }
    }
  }, {
    paranoid: true
  })

  decal.associate = function (models) {
    models.Decal.belongsTo(models.User, { as: 'user' })
  }

  return decal
}
