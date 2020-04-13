import Permission from '../classes/Permission'
import { IRCVirtualHost } from '../helpers/Validators'
import Model, { column, table, validate, type } from './Model'

@table({ paranoid: true })
/**
 * Model class for permission groups
 */
export default class Group extends Model {
  @validate({ isAlphanumeric: true, notEmpty: true })
  @column(type.UUID, { primaryKey: true })
  static id = undefined

  @validate({ isAlphanumeric: true, notEmpty: true }, { name: 'name' })
  @column(type.STRING, { allowNull: false, unique: true, name: 'name' })
  static groupName = undefined

  @validate({ is: IRCVirtualHost })
  @column(type.STRING, { allowNull: true })
  static vhost = undefined

  @column(type.BOOLEAN)
  static withoutPrefix = false

  @validate({ isInt: true })
  @column(type.INTEGER)
  static priority = 0

  @validate({ scope: Permission.assertOAuthScopes })
  @column(type.ARRAY(type.STRING))
  static permissions = []

  @column(type.JSONB)
  static channels = {}

  /**
   * @inheritdoc
   */
  static getScopes () {
    return {
      stats: [{
        attributes: [],
      }],
    }
  }

  /**
   * @inheritdoc
   */
  static associate (models) {
    super.associate(models)
    models.Group.belongsToMany(models.User, {
      as: 'users',
      foreignKey: 'groupId',
      through: {
        model: models.UserGroups,
        foreignKey: 'groupId',
      },
    })
  }
}
