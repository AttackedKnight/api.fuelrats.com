import { ReadPermission, DatabaseView, RatView, GroupView, ClientView, NicknameView } from './'

export default class UserView extends DatabaseView {
  static get type () {
    return 'users'
  }

  get attributes () {
    return class {
      static data
      static email = ReadPermission.group
      static status
      static suspended = ReadPermission.group
      static frontierId = ReadPermission.group
      static avatar
      static createdAt
      static updatedAt
      static deletedAt = ReadPermission.internal
    }
  }

  get defaultReadPermission () {
    return ReadPermission.all
  }

  get isSelf () {
    if (this.query.connection.state.user && this.object.id === this.query.connection.state.user.id) {
      return this.query.connection.state.permissions.includes('users.read.me')
    }
    return false
  }

  get isGroup () {
    return this.query.connection.state.permissions.includes('users.read')
  }

  get isInternal () {
    return this.query.connection.state.permissions.includes('users.internal')
  }

  get relationships () {
    return {
      rats: RatView,
      nicknames: NicknameView,
      displayRat: RatView,
      groups: GroupView,
      clients: ClientView
    }
  }

  get includes () {
    return ['rats', 'displayRat', 'groups', 'clients', 'nicknames']
  }
}
