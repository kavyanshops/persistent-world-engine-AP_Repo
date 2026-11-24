const { E } = require('../errors');
const { step } = require('./trace');
module.exports = (req, _res, next) => { step(req, 'notFound: 404'); next(E.notFound(`No route for ${req.method} ${req.path}`)); };
