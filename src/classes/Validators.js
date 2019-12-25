import Permission from './Permission'
import RegexLiteral from './RegexLiteral'
import { UnprocessableEntityAPIError } from './APIError'
import { URL } from 'url'

export const IRCVirtualHost = /^[a-z][a-z0-9.]{3,64}$/u
export const IRCNickname = /^[A-Za-z_\\`\[\]{}]([A-Za-z0-9_\\`\[\]{}]{1,29})?$/u
export const languageCode = /^[a-z]{2}-[A-Z]{2}$./u
const forbiddenCMDRNameComponents = ['[pc]', '[xb]', '[ps]', 'CMDR']

// language=JSUnicodeRegexp
export const FrontierRedeemCode = new RegexLiteral(`^
  [A-Z0-9]{5}-
  [A-Z0-9]{5}-
  [A-Z0-9]{5}-
  [A-Z0-9]{5}-
  FUE[0-9]{2}
$`, 'gu')

// noinspection RegExpRepeatedSpace
// language=JSUnicodeRegexp
export const CMDRname = new RegexLiteral(`^[
  \\p{Alphabetic}
  \\p{Mark}
  \\p{Decimal_Number}
  \\p{Connector_Punctuation}
  \\p{Join_Control}
  \\p{Space_Separator}
]{3,64}$`, 'gui')
// language=JSUnicodeRegexp
export const ShipName = new RegexLiteral(`^[
  \\p{Alphabetic}
  \\p{Mark}
  \\p{Decimal_Number}
  \\p{Connector_Punctuation}
  \\p{Join_Control}
  \\p{Space_Separator}
]{3,22}$`, 'gu')
// language=JSUnicodeRegexp
export const OAuthClientName = new RegexLiteral(`^[
  \\p{Alphabetic}
  \\p{Mark}
  \\p{Decimal_Number}
  \\p{Connector_Punctuation}
  \\p{Join_Control}
  \\p{Punctuation}
  \\p{Space_Separator}
]{3,64}$`, 'gu')
// language=JSUnicodeRegexp
export const UUID = new RegexLiteral(`^
  [0-9a-f]{8}-
  [0-9a-f]{4}-
  [1-5][0-9a-f]{3}-
  [89ab][0-9a-f]{3}-
  [0-9a-f]{12}
`, 'igu')

/**
 * Validate whether a list of OAuth Scopes is valid
 * @param {[string] }value the list of OAuth scopes to validate
 */
export function OAuthScope (value) {
  const invalid = value.some((scope) => {
    return Permission.allPermissions.includes(scope) === false && scope !== '*'
  })
  if (invalid) {
    throw new UnprocessableEntityAPIError({ pointer: '/data/attributes/scope' })
  }
}

/**
 * Validate whether input is a valid CMDR name
 * @param {string} value input to validate
 * @returns {boolean} whether input is a valid CMDR name
 */
export function validCMDRname (value) {
  if (CMDRname.test(value) === true) {
    const lowerNick = value.toLowerCase()
    const forbidden = forbiddenCMDRNameComponents.some((comp) => {
      return lowerNick.includes(comp)
    })

    if (!forbidden) {
      return
    }
  }

  throw new UnprocessableEntityAPIError({ pointer: '/data/attributes/name' })
}

/**
 * Validate whether a value is a valid JSON object for a jsonb field
 * @param {object} value the value to validate
 */
export function JSONObject (value) {
  if (typeof value !== 'object') {
    throw new UnprocessableEntityAPIError({ pointer: '/data/attributes/data' })
  }
}

const requiredQuoteFields = [
  'message',
  'author',
  'lastAuthor',
  'createdAt',
  'updatedAt'
]

/**
 * Validate whether a value is a valid list of rescue quotes
 * @param {object} quotes the list of rescue quotes to validate
 */
export function RescueQuote (quotes) {
  try {
    quotes.forEach((quote) => {
      requiredQuoteFields.forEach((requiredField) => {
        if (Reflect.has(quote, requiredField) === false) {
          throw Error()
        }
      })
    })
  } catch (ex) {
    throw new UnprocessableEntityAPIError({ pointer: '/data/attributes/quotes' })
  }
}

/**
 * Validate whether a value is a valid list of IRC nicknames
 * @param {[string] }value the list of IRC nicknames to validate
 */
export function IRCNicknames (value) {
  if (!Array.isArray(value)) {
    throw new UnprocessableEntityAPIError({ pointer: '/data/attributes/nicknames' })
  }
  value.forEach((nickname) => {
    if (!IRCNickname.test(nickname)) {
      throw new UnprocessableEntityAPIError({ pointer: '/data/attributes/nicknames' })
    }
  })
}

/**
 * Validate whether a value is a valid URL
 * @param {string} value the URL to validate
 * @returns {URL} a url
 */
export function isURL (value) {
  try {
    return new URL(value)
  } catch (ex) {
    throw new UnprocessableEntityAPIError({ pointer: '/data/attributes/redirectUri' })
  }
}
