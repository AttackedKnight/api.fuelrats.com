
import { db, Rat } from '../db'
import Query from './index'

/**
 * A class representing a rat query
 */
class NicknameQuery extends Query {
  /**
   * Create a sequelize rat query from a set of parameters
   * @constructor
   * @param params
   * @param connection
   */
  constructor ({params, connection}) {
    super({params, connection})

    if (params.nickname) {
      let formattedNickname = params.nickname.replace(/\[(.*?)]$/g, '')
      this._query.where.nicknames = {
        $overlap:  [params.nickname, formattedNickname]
      }
      delete this._query.where.nickname
    }


    this._query.attributes = [
      'id',
      'createdAt',
      'updatedAt',
      'email',
      'displayRatId',
      'nicknames'
    ]

    this._query.include = [{
      model: Rat,
      as: 'rats',
      required: false,
      attributes: {
        exclude: [
          'deletedAt'
        ]
      }
    }]
  }
}

module.exports = NicknameQuery
