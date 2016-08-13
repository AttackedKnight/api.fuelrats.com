'use strict'

let _ = require('underscore')
let winston = require('winston')
let Permission = require('../permission')
let Rescue = require('../db').Rescue
let findRescueWithRats = require('./rescue').findRescueWithRats
let getRescuePermissionType = require('./rescue').getRescuePermissionType
let convertRescueToAPIResult = require('./rescue').convertRescueToAPIResult

// EDIT
// =============================================================================
exports.editRescue = function (request, response) {
  findRescueWithRats({ id: request.params.id }).then(function (rescueInstance) {
    if (!rescueInstance) {
      response.render('errors/404.swig')
    }

    let rescue = convertRescueToAPIResult(rescueInstance)

    // If the rescue is closed or the user is not involved with the rescue, we will require moderator permission
    let permission = getRescuePermissionType(rescue, request.user)

    Permission.require(permission, request.user).then(function () {
      response.render('rescue-edit.swig', { rescue: rescue })
    }, function () {
      response.render('errors/403.swig')
    })
  })


}

// VIEW
// =============================================================================
exports.viewRescue = function (request, response, next) {
  findRescueWithRats({ id: request.params.id }).then(function (rescueInstance) {
    try {
      if (!rescueInstance) {
        response.render('errors/404.swig')
        return
      }

      let rescue = convertRescueToAPIResult(rescueInstance)
      response.render('rescue-view.swig', rescue)
    } catch (err) {
      console.log(err)
    }
  }).catch(function () {
    response.render('errors/500.swig')
  })
}
