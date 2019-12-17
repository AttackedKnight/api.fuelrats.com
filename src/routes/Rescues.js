import { Rescue } from '../db'
import DatabaseQuery from '../query/DatabaseQuery'
import axios from 'axios'
import path from 'path'
import fs from 'fs'
import {
  UnsupportedMediaAPIError
} from '../classes/APIError'

import {
  APIResource,
  permissions,
  authenticated,
  GET,
  POST,
  PUT,
  PATCH,
  DELETE,
  parameters,
  WritePermission
} from '../classes/API'
import { websocket } from '../classes/WebSocket'
import { RescueView, RatView } from '../view'
import DatabaseDocument from '../Documents/DatabaseDocument'
import { DocumentViewType } from '../Documents/Document'
import Permission from '../classes/Permission'
import StatusCode from '../classes/StatusCode'

const rescueAccessHours = 3
const rescueAccessTime = rescueAccessHours * 60 * 60 * 1000

/**
 * @classdesc Rescues API endpoint
 * @class
 */
export default class Rescues extends APIResource {
  /**
   * @inheritdoc
   */
  get type () {
    return 'rescues'
  }

  /**
   * Search rescues
   * @endpoint
   */
  @GET('/rescues')
  @websocket('rescues', 'search')
  @authenticated
  async search (ctx) {
    const query = new DatabaseQuery({ connection: ctx })
    const result = await Rescue.findAndCountAll(query.searchObject)
    return new DatabaseDocument({ query, result, type: RescueView })
  }

  /**
   * Get a rescue by id
   * @endpoint
   */
  @GET('/rescues/:id')
  @websocket('rescues', 'read')
  @authenticated
  async findById (ctx) {
    const { query, result } = await super.findById({ ctx, databaseType: Rescue })

    return new DatabaseDocument({ query, result, type: RescueView })
  }

  /**
   * Create a rescue
   * @endpoint
   */
  @POST('/rescues')
  @websocket('rescues', 'create')
  @authenticated
  @permissions('rescues.write')
  async create (ctx) {
    const result = await super.create({ ctx, databaseType: Rescue })

    const query = new DatabaseQuery({ connection: ctx })
    ctx.response.status = StatusCode.created
    return new DatabaseDocument({ query, result, type: RescueView })
  }

  /**
   * Update a rescue
   * @endpoint
   */
  @PUT('/rescues/:id')
  @websocket('rescues', 'update')
  @authenticated
  @parameters('id')
  async update (ctx) {
    const result = await super.update({ ctx, databaseType: Rescue, updateSearch: { id:ctx.params.id } })

    const randCatId = Math.floor(Math.random() * 10000)
    const image = await axios({
      url: `https://cataas.com/cat?${randCatId}`,
      method: 'GET',
      responseType: 'stream'
    })

    const imagePath = path.resolve(__dirname, `${randCatId}.jpg`)
    const writer = fs.createWriteStream(imagePath)
    image.data.pipe(writer)

    const query = new DatabaseQuery({ connection: ctx })
    return new DatabaseDocument({ query, result, type: RescueView })
  }

  /**
   * Delete a rescue by id
   * @endpoint
   */
  @DELETE('/rescues/:id')
  @websocket('rescues', 'delete')
  @authenticated
  @permissions('rescues.write')
  async delete (ctx) {
    await super.delete({ ctx, databaseType: Rescue })

    ctx.response.status = StatusCode.noContent
    return true
  }

  // relationships

  /**
   * Get a rescue's assigned rats
   * @endpoint
   */
  @GET('/rescues/:id/relationships/rats')
  @websocket('rescues', 'rats', 'read')
  @authenticated
  async relationshipRatsView (ctx) {
    const result = await this.relationshipView({
      ctx,
      databaseType: Rescue,
      relationship: 'rats'
    })

    const query = new DatabaseQuery({ connection: ctx })
    return new DatabaseDocument({ query, result, type: RatView, view: DocumentViewType.relationship })
  }

  /**
   * Assign rats to a rescue
   * @endpoint
   */
  @POST('/rescues/:id/relationships/rats')
  @websocket('rescues', 'rats', 'create')
  @authenticated
  async relationshipRatsCreate (ctx) {
    await this.relationshipChange({
      ctx,
      databaseType: Rescue,
      change: 'add',
      relationship: 'rats'
    })

    ctx.response.status = StatusCode.noContent
    return true
  }

  /**
   * Set the assigned rats of a rescue
   * @endpoint
   */
  @PATCH('/rescues/:id/relationships/rats')
  @websocket('rescues', 'rats', 'patch')
  @authenticated
  async relationshipRatsPatch (ctx) {
    await this.relationshipChange({
      ctx,
      databaseType: Rescue,
      change: 'patch',
      relationship: 'rats'
    })

    ctx.response.status = StatusCode.noContent
    return true
  }

  /**
   * Unassign rats from a rescue
   * @endpoint
   */
  @DELETE('/rescues/:id/relationships/rats')
  @websocket('rescues', 'rats', 'delete')
  @authenticated
  async relationshipRatsDelete (ctx) {
    await this.relationshipChange({
      ctx,
      databaseType: Rescue,
      change: 'remove',
      relationship: 'rats'
    })


    ctx.response.status = StatusCode.noContent
    return true
  }

  /**
   * Get a rescue's first limpet
   * @endpoint
   */
  @GET('/rescues/:id/relationships/firstLimpet')
  @websocket('rescues', 'firstLimpet', 'read')
  @authenticated
  async relationshipFirstLimpetView (ctx) {
    const result = await this.relationshipView({
      ctx,
      databaseType: Rescue,
      relationship: 'firstLimpet'
    })

    const query = new DatabaseQuery({ connection: ctx })
    return new DatabaseDocument({ query, result, type: RatView, view: DocumentViewType.relationship })
  }

  /**
   * Set a rescue's first limpet
   * @endpoint
   */
  @PATCH('/rescues/:id/relationships/firstLimpet')
  @websocket('rescues', 'firstLimpet', 'patch')
  @authenticated
  async relationshipFirstLimpetPatch (ctx) {
    await this.relationshipChange({
      ctx,
      databaseType: Rescue,
      change: 'patch',
      relationship: 'firstLimpet'
    })

    ctx.response.status = StatusCode.noContent
    return true
  }

  /**
   * @inheritdoc
   */
  get writePermissionsForFieldAccess () {
    return {
      client: WritePermission.group,
      clientNick: WritePermission.group,
      clientLanguage: WritePermission.group,
      commandIdentifier: WritePermission.sudo,
      codeRed: WritePermission.group,
      data: WritePermission.group,
      notes: WritePermission.group,
      platform: WritePermission.group,
      system: WritePermission.group,
      title: WritePermission.sudo,
      unidentifiedRats: WritePermission.group,
      outcome: WritePermission.group,
      quotes: WritePermission.group,
      createdAt: WritePermission.internal,
      updatedAt: WritePermission.internal,
      deletedAt: WritePermission.internal
    }
  }

  /**
   * @inheritdoc
   */
  isSelf ({ ctx, entity }) {
    const { user } = ctx.state
    if (!user) {
      return false
    }

    if ((Date.now() - entity.createdAt) < rescueAccessTime) {
      return true
    }

    const isAssigned = entity.rats.some((rat) => {
      return rat.userId === user.id
    })

    let isFirstLimpet = false
    if (entity.firstLimpet) {
      isFirstLimpet = entity.firstLimpet.userId === user.id
    }

    if (isAssigned || isFirstLimpet) {
      return Permission.granted({ permissions: ['rescues.write'], connection: ctx })
    }
    return false
  }

  /**
   * @inheritdoc
   */
  changeRelationship ({ relationship }) {
    switch (relationship) {
      case 'rats':
        return {
          many: true,

          hasPermission (connection, entity) {
            return this.isSelf({ ctx: connection, entity }) || Permission.granted({
              permissions: ['rescues.write'],
              connection
            })
          },

          add ({ entity, ids }) {
            return entity.addRats(ids)
          },

          patch ({ entity, ids }) {
            return entity.setRats(ids)
          },

          remove ({ entity, ids }) {
            return entity.removeRats(ids)
          }
        }

      case 'firstLimpet':
        return {
          many: false,

          hasPermission (connection, entity) {
            return this.isSelf({ ctx: connection, entity }) || Permission.granted({
              permissions: ['rescues.write'],
              connection
            })
          },

          patch ({ entity, id }) {
            return entity.setFirstLimpet(id)
          }
        }

      default:
        throw new UnsupportedMediaAPIError({ pointer: '/relationships' })
    }
  }

  /**
   * @inheritdoc
   */
  get relationTypes () {
    return {
      'rats': 'rats',
      'firstLimpet': 'rats',
      'rescueClient': 'rescue-clients'
    }
  }
}
