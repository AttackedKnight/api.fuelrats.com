

import { Rat } from '../db'
import { NotFoundAPIError, UnsupportedMediaAPIError } from '../classes/APIError'

import API, {
  permissions,
  authenticated,
  GET,
  POST,
  PUT,
  DELETE,
  PATCH,
  parameters,
  protect, WritePermission, APIResource
} from '../classes/API'
import { websocket } from '../classes/WebSocket'
import DatabaseQuery from '../query/DatabaseQuery'
import DatabaseDocument from '../Documents/DatabaseDocument'
import StatusCode from '../classes/StatusCode'
import Permission from '../classes/Permission'
import { RatView, UserView } from '../view'
import { DocumentViewType } from '../Documents'

export default class Rats extends APIResource {
  get type () {
    return 'rats'
  }

  @GET('/rats')
  @websocket('rats', 'search')
  async search (ctx) {
    const query = new DatabaseQuery({ connection: ctx })
    const result = await Rat.findAndCountAll(query.searchObject)
    return new DatabaseDocument({ query, result, type: RatView })
  }

  @GET('/rats/:id')
  @websocket('rats', 'read')
  @parameters('id')
  async findById (ctx) {
    const { query, result } = await super.findById({ ctx, databaseType: Rat })

    return new DatabaseDocument({ query, result, type: RatView })
  }

  @POST('/rats')
  @websocket('rats', 'create')
  @authenticated
  async create (ctx) {
    const result = await super.create({ ctx, databaseType: Rat, overrideFields: {
      userId: ctx.state.user.id
    } })

    const query = new DatabaseQuery({ connection: ctx })
    ctx.response.status = StatusCode.created
    return new DatabaseDocument({ query, result, type: RatView })
  }

  @PUT('/rats')
  @websocket('rats', 'update')
  @authenticated
  @parameters('id')
  async update (ctx) {
    const result = await super.update({ ctx, databaseType: Rat, updateSearch: { id:ctx.params.id } })

    const query = new DatabaseQuery({ connection: ctx })
    return new DatabaseDocument({ query, result, type: RatView })
  }

  @DELETE('/rats/:id')
  @websocket('rats', 'delete')
  @authenticated
  @parameters('id')
  async delete (ctx) {
    await super.delete({ ctx, databaseType: Rat.scope('rescues'), hasPermission: async (entity) => {
      if (Permission.granted({ permissions: ['rats.write'], connection: ctx })) {
        return true
      }

      if (entity.userId !== ctx.state.user.id) {
        return false
      }

      return entity.ships.length === 0 && entity.rescues.length === 0 && entity.firstLimpet.length === 0
    } })

    ctx.response.status = StatusCode.noContent
    return true
  }

  @GET('/rats/:id/relationships/user')
  @websocket('rats', 'user', 'read')
  @authenticated
  async relationshipUserView (ctx) {
    const result = await this.relationshipView({
      ctx,
      databaseType: Rat,
      relationship: 'user'
    })

    const query = new DatabaseQuery({ connection: ctx })
    return new DatabaseDocument({ query, result, type: UserView, view: DocumentViewType.relationship })
  }

  @PATCH('/rats/:id/relationships/user')
  @websocket('rats', 'user', 'patch')
  @authenticated
  async relationshipUserPatch (ctx) {
    await this.relationshipChange({
      ctx,
      databaseType: Rat,
      change: 'patch',
      relationship: 'user'
    })

    ctx.response.status = StatusCode.noContent
    return true
  }

  get writePermissionsForFieldAccess () {
    return {
      name: WritePermission.group,
      data: WritePermission.group,
      platform: WritePermission.group,
      frontierId: WritePermission.internal,
      createdAt: WritePermission.internal,
      updatedAt: WritePermission.internal,
      deletedAt: WritePermission.internal
    }
  }

  /**
   * @inheritdoc
   */
  isSelf ({ ctx, entity }) {
    if (entity.userId === ctx.state.user.id) {
      return Permission.granted({ permissions: ['rat.write.me'], connection: ctx })
    }
    return false
  }

  /**
   *
   * @inheritdoc
   */
  changeRelationship ({ relationship }) {
    if (relationship === 'user') {
      return {
        many: false,

        hasPermission (connection) {
          return Permission.granted({ permissions: ['rats.write'], connection })
        },

        patch ({ entity, id }) {
          return entity.setUser(id)
        }
      }
    }

    throw new UnsupportedMediaAPIError({ pointer: '/relationships' })
  }

  /**
   * @inheritdoc
   */
  get relationTypes () {
    return {
      'user': 'users'
    }
  }
}
