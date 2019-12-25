import API, { GET, authenticated } from '../classes/API'
import { User } from '../db'
import config from '../config'

/**
 * SSO endpoints
 */
export default class SSO extends API {
  /**
   * @inheritdoc
   */
  get type () {
    return 'jira'
  }

  /**
   * User profile information for Jira SSO
   * @endpoint
   */
  @GET('/sso/jira')
  @authenticated
  async jiraProfile (ctx) {
    const user = await User.findOne({
      where: {
        id: ctx.state.user.id
      }
    })

    const userGroups = user.groups.map((group) => {
      return group.id
    })

    return {
      id: user.id,
      email: user.email,
      emailVerified: userGroups.includes('verified'),
      username: user.preferredRat().name,
      profile: `${config.frontend.url}/profile/overview`,
      name: user.preferredRat().name,
      groups: userGroups
    }
  }

  /**
   * User profile information for Grafana SSO
   * @endpoint
   */
  @GET('/sso/grafana')
  @authenticated
  async grafanaProfile (ctx) {
    const user = await User.findOne({
      where: {
        id: ctx.state.user.id
      }
    })

    const unixUpdateTime = Math.floor(user.updatedAt.getTime() / 1000)

    return {
      sub: user.id,
      name: user.preferredRat().name,
      nickname: user.preferredRat().name,
      preferred_username: user.preferredRat().name,
      email: user.email,
      picture: `${config.frontend.url}/users/${user.id}/image`,
      profile: `${config.frontend.url}/profile/overview`,
      updated_at: unixUpdateTime
    }
  }

  /**
   * User profile information for NextCloud SSO
   * @endpoint
   */
  @GET('/sso/nextcloud')
  @authenticated
  async nextcloudProfile (ctx) {
    const user = await User.findOne({
      where: {
        id: ctx.state.user.id
      }
    })

    const userGroups = user.groups.map((group) => {
      return group.id
    })

    return {
      identifier: user.id,
      id: user.id,
      email: user.email,
      displayName: user.preferredRat().name,
      photoURL: `${config.frontend.url}/users/${user.id}/image`,
      roles: userGroups
    }
  }
}
