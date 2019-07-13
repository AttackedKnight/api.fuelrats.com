export default class Meta {
  constructor ({ result, query = undefined, additionalParameters }) {
    const meta = {
      meta: {}
    }
    if (query) {
      if (Array.isArray(result)) {
        meta.meta = {
          count: result.length,
          limit: query._limit || 0,
          offset: query._offset || 0,
        }
      } else {
        meta.meta = {
          count: result.rows.length,
          limit: query._limit || 0,
          offset: query._offset || 0,
          total: result.count
        }
      }
    }

    meta.meta = {...meta.meta, ...additionalParameters}
    return meta
  }
}