import v1Routes from './v1.js'

export default function (fastify, options) {
    fastify.register(v1Routes,{prefix: '/v1'})
}
