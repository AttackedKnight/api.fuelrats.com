import Permission from './Permission'
import {
  ForbiddenAPIError,
  UnauthorizedAPIError,
  BadRequestAPIError,
  NotFoundAPIError,
  UnprocessableEntityAPIError
} from './APIError'
import router from './Router'
import { Rat, db } from '../db'
import { UUID } from './Validators'
import enumerable from './Enum'
import { URL } from 'url'
import DatabaseQuery from '../query/DatabaseQuery'
import ws from 'ws'

const config = require('../../config')

/**
 * @class
 * @classdesc Base class for FuelRats API endpoints
 */
export default class API {
  resource = undefined
  view = undefined

  /**
   * The JSONAPI type for the resource this API endpoint is for, override.
   * @returns {string} JSONAPI type
   * @abstract
   */
  get type () {
    return undefined
  }
}

/* no-unused-vars in function arguments is being ignored for this class since
it is a base class for API endpoints to override */
/* eslint no-unused-vars: ["error", { "args": "none" }] */

/**
 * @class
 * @classdesc Base class for FuelRats API endpoints
 */
export class APIResource extends API {
  /**
   * The JSONAPI type for the resource this API endpoint is for, override.
   * @returns {string} JSONAPI type
   * @abstract
   */
  get type () {
    return undefined
  }

  /**
   * Base function to find a database entry by id
   * @param {object} arg function parameters
   * @param {Context} arg.ctx request context
   * @param {db.Model} arg.databaseType a database type object
   * @param {boolean} arg.requirePermission whether a read permission challenge should be made
   * @returns {Promise<{result: db.Model<any, any>, query: DatabaseQuery}>} query object and result object
   */
  async findById ({ ctx, databaseType, requirePermission = false }) {
    const query = new DatabaseQuery({ connection: ctx })

    const result = await databaseType.findOne({
      where: {
        id: ctx.params.id
      }
    })

    if (!result) {
      throw new NotFoundAPIError({ parameter: 'id' })
    }

    if (requirePermission) {
      this.requireWritePermission({ connection: ctx, entity: result })
    }

    return { query, result }
  }

  /**
   * Base function to create a database entry from a request
   * @param {object} arg function arguments object
   * @param {Context} arg.ctx a request context
   * @param {db.Model} arg.databaseType a database type object
   * @param {Function} arg.callback optional callback to perform actions before resource is returned
   * @param {object} arg.overrideFields fields to override in the create statement
   * @returns {Promise<db.Model>} A transaction to retrieve the created object
   */
  async create ({ ctx, databaseType, callback = undefined, overrideFields = {} }) {
    const dataObj = getJSONAPIData({ ctx, type: this.type })

    await this.validateCreateAccess({ ctx, attributes:  dataObj.attributes })
    const entity = await databaseType.create({ ...dataObj.attributes, ...overrideFields })

    if (callback) {
      await callback({ entity })
    }

    if (ctx.data.relationships instanceof Object) {
      const relationshipChanges = Object.entries(ctx.data.relationships).map(([relationship, data]) => {
        return this.generateRelationshipChange({ ctx, data, entity, change: 'add', relationship })
      })

      await Promise.all(relationshipChanges)
    }

    return databaseType.findOne({
      where: {
        id: entity.id
      }
    })
  }

  /**
   * Base function to update a database entry from a request
   * @param {object} arg function arguments object
   * @param {Context} arg.ctx A request context
   * @param {db.Model} arg.databaseType a database type object
   * @param {object} arg.updateSearch search parameter on which to issue an update
   * @returns {Promise<db.Model>}  A transaction to retrieve the updated object
   */
  async update ({ ctx, databaseType, updateSearch }) {
    if (!ctx.params.id) {
      throw new BadRequestAPIError({ parameter: 'id' })
    }

    const dataObj = getJSONAPIData({ ctx, type: this.type })

    const entity = await databaseType.findOne({
      where: {
        id: ctx.params.id
      }
    })

    if (!entity) {
      throw new NotFoundAPIError({ parameter: 'id' })
    }

    this.requireWritePermission({ connection: ctx, entity })

    const { attributes } = dataObj

    if (attributes instanceof Object) {
      this.validateUpdateAccess({ ctx, attributes, entity })

      await entity.update(attributes, updateSearch)
    }

    if (ctx.data.relationships instanceof Object) {
      const relationshipChanges = Object.entries(ctx.data.relationships).map(([relationship, data]) => {
        return this.generateRelationshipChange({ ctx, data, entity, change: 'patch', relationship })
      })

      await Promise.all(relationshipChanges)
    }

    return databaseType.findOne({
      where: {
        id: ctx.params.id
      }
    })
  }

  /**
   * Base function to delete a database entry from a request
   * @param {object} arg function arguments object
   * @param {object} arg.ctx a request context
   * @param {db.Model} arg.databaseType a database type object
   * @returns {Promise<undefined>} A delete transaction
   */
  async delete ({ ctx, databaseType, hasPermission = undefined, callback }) {
    if (!ctx.params.id) {
      throw new BadRequestAPIError({ parameter: 'id' })
    }

    const entity = await databaseType.findOne({
      where: {
        id: ctx.params.id
      }
    })

    if (!entity) {
      throw new NotFoundAPIError({ parameter: 'id' })
    }

    if (hasPermission) {
      const permissionResult = await hasPermission(entity)
      if (permissionResult === false) {
        throw new ForbiddenAPIError({})
      }
    } else {
      this.requireWritePermission({ connection: ctx, entity })
    }


    if (callback) {
      await callback(entity)
    }

    return entity.destroy()
  }

  /**
   * Base function for relationship view requests
   * @param {object} arg function arguments object
   * @param {object} arg.ctx a request context
   * @param {db.Model} arg.databaseType a database type object
   * @param {object} arg.relationship the JSONAPI resource relattionship
   * @returns {Promise<db.Model>} a find transaction
   */
  async relationshipView ({ ctx, databaseType, relationship }) {
    if (!ctx.params.id) {
      throw new BadRequestAPIError({ parameter: 'id' })
    }

    const entity = await databaseType.findOne({
      where: {
        id: ctx.params.id
      }
    })

    if (!entity) {
      throw new NotFoundAPIError({ parameter: 'id' })
    }

    this.requireReadPermission({ connection: ctx, entity })

    return entity[relationship]
  }

  /**
   * Perform a relationship change based on a PATCH /relationships request
   * @param {object} arg function arguments object
   * @param {object} arg.ctx the context of a PATCH /relationships request
   * @param {db.Model} arg.databaseType the sequelize object for this data type
   * @param {string} arg.change The type of relationship change to perform (add, patch, remove)
   * @param {string} arg.relationship the relationship to change
   * @returns {Promise<db.Model>} A resource with its relationships updated
   */
  async relationshipChange ({ ctx, databaseType, change, relationship }) {
    if (!ctx.params.id) {
      throw new BadRequestAPIError({ parameter: 'id' })
    }

    const entity = await databaseType.findOne({
      where: {
        id: ctx.params.id
      }
    })

    if (!entity) {
      throw new NotFoundAPIError({ parameter: 'id' })
    }

    this.requireWritePermission({ connection: ctx, entity })

    await this.generateRelationshipChange({ ctx, data: ctx.data.data, entity, change, relationship })

    return databaseType.findOne({
      where: {
        id: ctx.params.id
      }
    })
  }

  /**
   * Generate a relationship change database call from a JSONAPI compliant relationship object
   * @param {object} arg function arguments object
   * @param {object} arg.data a JSONAPI compliant relationship object
   * @param {object} arg.entity the entity to change the relationship of
   * @param {string} arg.change the type of change to perform (add, patch, remove)
   * @param {string} arg.relationship The relationship to change
   * @returns {Promise<undefined>} a database change promise for updating the relationships
   */
  generateRelationshipChange ({ ctx, data, entity, change, relationship }) {
    const changeRelationship = this.changeRelationship({ relationship })
    const validOneRelationship = this.isValidOneRelationship({ relationship: data, relation: relationship })

    if (Array.isArray(data) && changeRelationship.many === true) {
      const relationshipIds = data.map((relationshipObject) => {
        const validManyRelationship = this.isValidManyRelationship({
          relationship: relationshipObject,
          relation: relationship
        })
        if (validManyRelationship === false) {
          throw new UnprocessableEntityAPIError({ pointer: '/data' })
        }

        if (!changeRelationship.hasPermission(ctx, entity, relationship.id)) {
          throw new ForbiddenAPIError({ pointer: '/data' })
        }
        return relationshipObject.id
      })

      return changeRelationship[change]({ entity, ids: relationshipIds })
    } else if (validOneRelationship && changeRelationship.many === false) {
      if (!changeRelationship.hasPermission(ctx, entity, relationship.id)) {
        throw new ForbiddenAPIError({ pointer: '/data' })
      }
      return changeRelationship[change]({ entity, id: data.id })
    } else {
      throw new UnprocessableEntityAPIError({ pointer: '/data' })
    }
  }

  /**
   * Valiadate whether the user has access to create all the attributes in the create request
   * @param {object} arg function arguments object
   * @param {Context} arg.ctx request context
   * @param {object} arg.attributes attributes list
   */
  validateCreateAccess ({ ctx, attributes }) {
    const isGroup = Permission.granted({
      permissions: [`${this.type}.write`],
      connection: ctx
    })
    const isSelf = Permission.granted({
      permissions: [`${this.type}.write.me`],
      connection: ctx
    })
    const isInternal = Permission.granted({
      permissions: [`${this.type}.internal`],
      connection: ctx
    })

    Object.entries(attributes).forEach(([key]) => {
      const attributePermissions = this.writePermissionsForFieldAccess[key]
      if (!attributePermissions) {
        throw new ForbiddenAPIError({ pointer: `/data/attributes/${key}` })
      }

      const hasPermission = () => {
        switch (attributePermissions) {
          case WritePermission.all:
            return true

          case WritePermission.internal:
            return isInternal

          case WritePermission.sudo:
            return isGroup

          case WritePermission.group:
            return isGroup || isSelf

          case WritePermission.self:
            return isSelf

          default:
            return false
        }
      }

      if (hasPermission() === false) {
        throw new ForbiddenAPIError({ pointer: `/data/attributes/${key}` })
      }
    })
  }

  /**
   * Validate whether the user has access to modify all the attributes in the update request
   * @param {object} arg function arguments object
   * @param {Context} arg.ctx a request context
   * @param {[object]} arg.attributes attributes list
   * @param {object} arg.entity the entity to validate
   */
  validateUpdateAccess ({ ctx, attributes, entity }) {
    const isGroup = Permission.granted({
      permissions: [`${this.type}.write`],
      connection: ctx
    })
    const isSelf = this.isSelf({ ctx, entity }) && Permission.granted({
      permissions: [`${this.type}.write.me`],
      connection: ctx
    })
    const isInternal = Permission.granted({
      permissions: [`${this.type}.internal`],
      connection: ctx
    })

    Object.entries(attributes).forEach(([key]) => {
      const attributePermissions = this.writePermissionsForFieldAccess[key]
      if (!attributePermissions) {
        throw new ForbiddenAPIError({ pointer: `/data/attributes/${key}` })
      }

      const hasPermission = () => {
        switch (attributePermissions) {
          case WritePermission.all:
            return true

          case WritePermission.internal:
            return isInternal

          case WritePermission.sudo:
            return isGroup

          case WritePermission.group:
            return isGroup || isSelf

          case WritePermission.self:
            return isSelf

          default:
            return false
        }
      }

      if (hasPermission() === false) {
        throw new ForbiddenAPIError({ pointer: `/data/attributes/${key}` })
      }
    })
  }

  /**
   * Get a map of write permissions for fields
   * @returns {object}
   * @abstract
   */
  get writePermissionsForFieldAccess () {
    return {}
  }

  /**
   * Check whether this entity requires self-level access (Can only be accessed by themselves, or admin)
   * @param {object} arg function arguments object
   * @param {object} arg.ctx request context
   * @param {object} arg.entity the entity to check access level on
   * @returns {boolean} whether this entity requires self-level access
   * @abstract
   */
  isSelf ({ ctx, entity }) {
    return undefined
  }

  /**
   * Check whether the user has read permission for this resource
   * @param {object} arg function arguments object
   * @param {object} arg.connection a request context
   * @param {object} arg.entity a resource entity
   * @returns {boolean} whether the user has read permission for this resource
   */
  hasReadPermission ({ connection, entity }) {
    if (this.isSelf({ ctx: connection, entity })) {
      return Permission.granted({ permissions: [`${this.type}.read.me`, `${this.type}.read`], connection })
    }
    return Permission.granted({ permissions: [`${this.type}.read`], connection })
  }

  /**
   * Check whether the user has write permission for this resource
   * @param {object} arg function arguments object
   * @param {object}  arg.connection a request context
   * @param {object} arg.entity a resource entity
   * @returns {boolean} whether the usre has write permission for this resource
   */
  hasWritePermission ({ connection, entity }) {
    if (this.isSelf({ ctx: connection, entity })) {
      return Permission.granted({ permissions: [`${this.type}.write.me`, `${this.type}.write`], connection })
    }
    return Permission.granted({ permissions: [`${this.type}.write`], connection })
  }

  /**
   * Get a change relationship object for this resource defining the actions to perform for add, delete, and patch
   * relationship requests
   * @param {string} relationship the relationship relative to the ressource
   * @returns {*} a change relationship object
   * @abstract
   */
  changeRelationship ({ relationship }) {
    return undefined
  }

  /**
   * Get a map of JSONAPI ressource types for the relationships of this resource
   * @returns {*} a map of JSONAPI ressource types
   * @abstract
   */
  get relationTypes () {
    return {}
  }

  /**
   * Require read permission to modify this entity
   * @param {object} arg function arguments object
   * @param {object} arg.connection a request context
   * @param {object} arg.entity a resource entity
   */
  requireReadPermission ({ connection, entity }) {
    if (!this.hasReadPermission({ connection, entity })) {
      throw new ForbiddenAPIError({})
    }
  }

  /**
   * Require write permission to modify this entity
   * @param {object} arg function arguments object
   * @param {object} arg.connection a request context
   * @param {object} arg.entity a resource entity
   */
  requireWritePermission ({ connection, entity }) {
    if (!this.hasWritePermission({ connection, entity })) {
      throw new ForbiddenAPIError({})
    }
  }

  /**
   * Get the author of a request
   * @param {object} ctx request context
   * @returns {Promise<db.User>}
   */
  static async getAuthor (ctx) {
    if (ctx.req && Reflect.has(ctx.req.headers, 'x-command-by')) {
      const ratId = ctx.req.headers['x-command-by']
      if (UUID.test(ratId) === false) {
        return undefined
      }

      const rat = await Rat.findOne({
        where: {
          id: ratId
        }
      })

      return rat.user
    } else {
      return ctx.state.user
    }
  }

  /**
   * Check whether a relationship is a valid one-to-one relationship for this resource
   * @param {object} arg function arguments object
   * @param {object} arg.relationship a relationship object
   * @param {string} arg.relation name of the relation relative to the resource
   * @returns {boolean} Whether the relationship is a valid one-to-one relationship for this resource
   */
  isValidOneRelationship ({ relationship, relation }) {
    if (relationship instanceof Object) {
      if (typeof relationship.id !== 'undefined' && relationship.type === this.relationTypes[relation]) {
        return true
      }
    } else if (!relationship) {
      return true
    }
    return false
  }

  /**
   * Check whether a relationship is a valid many relationship for this resource
   * @param {object} arg function arguments object
   * @param {object} arg.relationship a relationship object
   * @param {string} arg.relation name of the relation relative to the resource
   * @returns {boolean} Whether the relationship is a valid many relationship for this resource
   */
  isValidManyRelationship ({ relationship, relation }) {
    if (relationship instanceof Object) {
      if (typeof relationship.id !== 'undefined' && relationship.type === this.relationTypes[relation]) {
        return true
      }
    }
    return false
  }
}


// region Decorators
/**
 * ESNext Decorator for routing this method through a koa router GET endpoint
 * @param {string} route the http path to route
 * @returns {Function} An ESNExt decorator function
 */
export function GET (route) {
  return function (target, name, descriptor) {
    const endpoint = descriptor.value

    descriptor.value = function (...args) {
      const [ctx] = args
      ctx.endpoint = this
      return endpoint.apply(this, args)
    }
    router.get(route, descriptor.value)
  }
}

/**
 * ESNext Decorator for routing this method through a koa router post endpoint
 * @param {string} route the http path to route
 * @returns {Function}
 */
export function POST (route) {
  return function (target, name, descriptor) {
    const endpoint = descriptor.value

    descriptor.value = function (...args) {
      const [ctx] = args
      ctx.endpoint = this
      return endpoint.apply(this, args)
    }
    router.post(route, descriptor.value)
  }
}

/**
 * ESNext Decorator for routing this method through a koa router PUT endpoint
 * @param {string} route the http path to route
 * @returns {Function}
 */
export function PUT (route) {
  return function (target, name, descriptor) {
    const endpoint = descriptor.value

    descriptor.value = function (...args) {
      const [ctx] = args
      ctx.endpoint = this
      return endpoint.apply(this, args)
    }
    router.put(route, descriptor.value)
    router.patch(route, descriptor.value)
  }
}

/**
 * ESNext Decorator for routing this method through a koa router PATCH endpoint
 * @param {string} route the http path to route
 * @returns {Function}
 */
export function PATCH (route) {
  return function (target, name, descriptor) {
    const endpoint = descriptor.value

    descriptor.value = function (...args) {
      const [ctx] = args
      ctx.endpoint = this
      return endpoint.apply(this, args)
    }
    router.patch(route, descriptor.value)
  }
}

/**
 * ESNext Decorator for routing this method through a koa router DELETE endpoint
 * @param route the http path to route
 * @returns {Function}
 */
export function DELETE (route) {
  return function (target, name, descriptor) {
    const endpoint = descriptor.value

    descriptor.value = function (...args) {
      const [ctx] = args
      ctx.endpoint = this
      return endpoint.apply(this, args)
    }
    router.del(route, descriptor.value)
  }
}

// eslint-disable-next-line jsdoc/require-param
/**
 * ESNext Decorator for requiring authentication on an endpoint
 */
export function authenticated (target, name, descriptor) {
  const endpoint = descriptor.value

  descriptor.value = function (...args) {
    const [ctx] = args
    if (ctx.state.user) {
      return endpoint.apply(target, args)
    } else {
      throw new UnauthorizedAPIError({})
    }
  }
}

// eslint-disable-next-line jsdoc/require-param
/**
 * ESNext Decorator for requiring client authentication on an endpoint
 */
export function clientAuthenticated (target, name, descriptor) {
  const endpoint = descriptor.value

  descriptor.value = function (...args) {
    const [ctx] = args
    if (ctx.state.client) {
      return endpoint.apply(this, args)
    } else {
      throw new UnauthorizedAPIError({})
    }
  }
}

// eslint-disable-next-line jsdoc/require-param
/**
 * ESNext Decorator for requiring IP address authentication on an endpoint
 */
export function IPAuthenticated (target, name, descriptor) {
  const endpoint = descriptor.value

  descriptor.value = function (...args) {
    const [ctx] = args
    if (config.whitelist.includes(ctx.request.ip)) {
      return endpoint.apply(this, args)
    } else {
      throw new UnauthorizedAPIError({})
    }
  }
}

/**
 * ESNext Decorator requiring a set of permissions for an API endpoint
 * @param {...string} perms the permissions to require
 * @returns {Function} A decorator function
 */
export function permissions (...perms) {
  return function (target, name, descriptor) {
    const endpoint = descriptor.value

    descriptor.value = function (...args) {
      const [ctx] = args
      if (Permission.granted({ permissions: perms, connection: ctx })) {
        return endpoint.apply(this, args)
      } else {
        throw new ForbiddenAPIError({})
      }
    }
  }
}

/**
 * ESNext Decorator for requiring query parameters in an endpoint
 * @param {...string} fields The query parameters to require
 * @returns {Function} A decorator function
 */
export function parameters (...fields) {
  return function (target, name, descriptor) {
    const endpoint = descriptor.value

    descriptor.value = function (...args) {
      const [ctx] = args
      const missingFields = fields.filter((requiredField) => {
        return (requiredField in ctx.params === false && requiredField in ctx.query === false)
      })
      if (missingFields.length > 0) {
        throw missingFields.map((field) => {
          return new BadRequestAPIError({ parameter: field })
        })
      }
      return endpoint.apply(this, args)
    }
  }
}

/**
 * ESNext Decorator for requiring data fields in an endpoint
 * @param {...string} fields The data fields to require
 * @returns {Function} A decorator function
 *
 */
export function required (...fields) {
  return function (target, name, descriptor) {
    const endpoint = descriptor.value

    descriptor.value = function (...args) {
      const [ctx] = args
      const missingFields = fields.filter((requiredField) => {
        return ctx.data.hasOwnProperty(requiredField) === false
      })
      if (missingFields.length > 0) {
        throw missingFields.map((field) => {
          return new BadRequestAPIError({ pointer: `/data/attributes/${field}` })
        })
      }
      return endpoint.apply(this, args)
    }
  }
}

/**
 * ESNext Decorator for disallowing a set of data fields in an endpoint
 * @param {...string} fields The data fields to disallow
 * @returns {Function} A decorator function
 */
export function disallow (...fields) {
  return function (target, name, descriptor) {
    const endpoint = descriptor.value

    descriptor.value = function (...args) {
      const [ctx] = args
      if (Array.isArray(ctx.data) || typeof ctx.data === 'object') {
        fields.map((cleanField) => {
          delete ctx.data[cleanField]
          return cleanField
        })
      }
      return endpoint.apply(target, args)
    }
  }
}

/**
 * Protect a set of fields in an endpoint with a specific permission
 * @param permission the permission to require
 * @param {...string} fields the fields to require this permission for
 * @returns {Function} A decorator function
 */
export function protect (permission, ...fields) {
  return function (target, name, descriptor) {
    const endpoint = descriptor.value

    descriptor.value = function (...args) {
      const [ctx] = args
      if (ctx.data) {
        fields.map((field) => {
          if (!ctx.data[field]) {
            return false
          }

          if (!Permission.granted({ permissions: [permission], connection: ctx })) {
            throw new ForbiddenAPIError({})
          }
          return true
        })
      }
      return endpoint.apply(target, args)
    }
  }
}

// endregion

/**
 * Validate whether an object is a valid JSONAPI Object
 * @param {object} object an object
 * @returns {boolean} True if valid, false is not valid
 */
export function isValidJSONAPIObject ({ object }) {
  if (object instanceof Object && (object.type && object.type.constructor === String)) {
    if (object.attributes instanceof Object || object.relationships instanceof Object) {
      return true
    }
  }
  return false
}

/**
 * Retrieve the data field of a JSONAPI request
 * @param {object} ctx request context
 * @param {string} type the JSONAPI resource type
 * @returns {object} JSONAPI data field
 */
export function getJSONAPIData ({ ctx, type }) {
  if (!ctx.data.data || !isValidJSONAPIObject({ object: ctx.data.data }) || ctx.data.data.type !== type) {
    throw new UnprocessableEntityAPIError({ pointer: '/data' })
  }

  if (!(ctx.data.data.attributes instanceof Object)) {
    throw new UnprocessableEntityAPIError({ pointer: '/data/attributes' })
  }

  return ctx.data.data
}

@enumerable
export class WritePermission {
  static internal
  static self
  static group
  static sudo
  static all
}

/**
 * Request object
 */
export class Request {
  /**
   * Create a request object
   * @param {object} arg function arguments object
   * @param {ws.Client} arg.client websocket client
   * @param {object} arg.query request query
   * @param {object} arg.body request body
   * @param {object} arg.message the message
   */
  constructor ({ client, query, body, message }) {
    const url = new URL(`${config.externalUrl}${client.req.url}`)

    this.header = client.req.headers
    this.headers = client.req.headers
    this.method = client.req.method
    this.length = message.length
    this.url = client.req.url
    this.originalUrl = client.req.url
    this.origin = url.origin
    this.href = url.href
    this.path = url.pathname
    this.querystring = url.search
    this.search = url.search
    this.host = url.host
    this.hostname = url.hostname
    this.URL = url
    this.type = undefined
    this.charset = undefined
    this.query = query
    this.body = body
    this.fresh = true
    this.state = false
    this.protocol = 'https'
    this.secure = true
    this.ip = client.req.headers['x-forwarded-for'] || client.req.connection.remoteAddress
    this.ips = [client.req.headers['x-forwarded-for'], client.req.connection.remoteAddress]
    this.subdomains = url.hostname.split('.')
    this.is = () => {
      return false
    }
    this.socket = client.req.socket
    this.get = (header) => {
      return client.req.headers[header.toLowerCase()]
    }
  }
}

/**
 * Response object
 */
export class Response {
  /**
   * Create a response object
   * @param {ws.Client} client websocket client
   */
  constructor ({ client }) {
    this.header = {}
    this.headers = this.header
    this.socket = client.req.socket
    this.status = 404
    this.message = undefined
    this.length = 0
    this.body = undefined
    this.get = () => {
      return undefined
    }
    this.set = (field, value) => {
      this.header[field] = value
    }

    this.append = (field, value) => {
      this.header[field] = value
    }

    this.remove = (field) => {
      delete this.header[field]
    }

    this.type = undefined
    this.is = () => {
      return false
    }
  }
}

/**
 * @typedef {object} Context
 * @type {object} Request context
 */
export class Context {
  /**
   * Create a request context
   * @param {object} arg function arguments object
   * @param {ws.Client} arg.client websocket client
   * @param {object} arg.query request query
   * @param {object} arg.body the request body
   * @param {object} arg.message the request message
   */
  constructor ({ client, query, body, message }) {
    const request = new Request({ client, query, body, message })
    const response = new Response({ client })
    this.client = client

    this.req = client.req
    this.res = client.req
    this.request = request
    this.response = response

    this.state = {}
    this.state.scope = client.scope
    this.state.user = client.user
    this.state.userAgent = client.req.headers['user-agent']

    this.app = {}
    this.cookies = {
      get: () => {
        return undefined
      },
      set: () => {
        return undefined
      }
    }

    this.header = request.header
    this.headers = request.headers
    this.method = request.method
    this.url = request.url
    this.originalUrl = request.originalUrl
    this.origin = request.origin
    this.href = request.href
    this.path = request.path
    this.query = request.query
    this.querystring = request.querystring
    this.host = request.host
    this.hostname = request.hostname
    this.fresh = request.fresh
    this.stale = request.stale
    this.socket = request.socket
    this.protocol = request.protocol
    this.secure = request.secure
    this.ip = request.ip
    this.subdomains = request.subdomains
    this.is = request.is
    this.get = request.get
    this.data = request.body

    this.body = response.body
    this.status = response.status
    this.message = response.message
    this.length = response.length
    this.type = response.type
  }
}
