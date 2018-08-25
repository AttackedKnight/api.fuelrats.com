import Authentication from '../classes/Authentication'
import { UnauthorizedAPIError } from '../classes/APIError'
import API, {
  GET,
  POST,
  required
} from '../classes/API'
import Profiles from './Profiles'

export default class Login extends API {
  @POST('/login')
  @required('email', 'password')
  async login (ctx) {
    let {email, password} = ctx.data
    let user = await Authentication.passwordAuthenticate({email, password})
    if (!user) {
      throw new UnauthorizedAPIError({})
    }

    ctx.session.userId = user.id
    ctx.status = 200
    if (ctx.session.redirect) {
      let redirectUrl = ctx.session.redirect
      ctx.session.redirect = null
      ctx.redirect(redirectUrl)
    }
    return Profiles.presenter.render(user, {})
  }

  @GET('/logout')
  logout (ctx) {
    if (!ctx.state.user) {
      throw new UnauthorizedAPIError({})
    }

    ctx.session.userId = null
    return null
  }
}
