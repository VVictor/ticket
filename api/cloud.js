const _ = require('lodash')
const AV = require('leanengine')

const errorHandler = require('./errorHandler')

/**
 * 一个简单的云代码方法
 */
AV.Cloud.define('hello', function(request, response) {
  response.success('Hello world!')
})

AV.Cloud.beforeSave('Ticket', (req, res) => {
  if (!req.currentUser._sessionToken) {
    return res.error('noLogin')
  }
  let assignee
  req.object.set('user', req.currentUser)
  selectAssignee(req.object).then((_assignee) => {
    assignee = _assignee
    req.object.set('assignee', assignee)
    res.success()
  }).catch(errorHandler.captureException)
})

AV.Cloud.afterSave('Ticket', (req) => {
  getTinyUserInfo(req.object.get('assignee'))
  .then((assignee) => {
    new AV.Object('OpsLog').save({
      ticket: req.object,
      action: 'selectAssignee',
      data: {assignee},
    }).catch(errorHandler.captureException)
  })
})

const getTinyUserInfo = (user) => {
  if (user.get('username')) {
    return Promise.resolve({
      id: user.id,
      username: user.get('username'),
    })
  }
  return user.fetch().then((user) => {
    return {
      id: user.id,
      username: user.get('username'),
    }
  })
}

const selectAssignee = (ticket) => {
  return new AV.Query(AV.Role)
  .equalTo('name', 'customerService')
  .first()
  .then((role) => {
    const category = ticket.get('category')
    const query = role.getUsers().query()
    if (!_.isEmpty(category)) {
      query.equalTo('categories', category)
    }
    return query.find()
  }).then((users) => {
    return _.sample(users)
  })
}

AV.Cloud.afterUpdate('Ticket', (req) => {
  if (req.object.updatedKeys.indexOf('status') != -1) {
    getTinyUserInfo(req.currentUser)
    .then((user) => {
      return new AV.Object('OpsLog').save({
        ticket: req.object,
        action: 'changeStatus',
        data: {status: req.object.get('status'), user},
      })
    }).catch(errorHandler.captureException)
  }
})

AV.Cloud.beforeSave('Reply', (req, res) => {
  if (!req.currentUser._sessionToken) {
    return res.error('noLogin')
  }
  req.object.set('user', req.currentUser)
  res.success()
})

module.exports = AV.Cloud
